import type { Connection } from 'mongoose';
import { Snapshot, clearAll, diffSnapshots, intersect, snapshotAll } from './blast-radius';

/**
 * A data-driven suite for the ownership rule in CLAUDE.md:
 *
 *   Any repository method that reads or mutates a user-owned record must scope
 *   its query by the owner, and a non-matching (id, owner) filter must surface
 *   as NOT_FOUND — never a silent no-op.
 *
 * The rule is identical across every repository, so it is expressed once here and
 * driven by a per-repository table. A spec declares how to build one record and
 * how to call one method; everything else — including the blast radius — is
 * derived.
 *
 * ── How decoys work ──
 *
 * The harness calls `seed()` three times (target as owner, sibling as owner,
 * stranger as another owner), snapshotting between calls, so it *learns* which
 * document keys belong to which decoy. A spec therefore never declares what it is
 * allowed to touch: "only the target may change" falls out of the seeding itself.
 *
 * The same-owner sibling is the decoy that matters most and the one hand-written
 * suites routinely omit. A filter that lost its `_id` but kept its `userId` — a
 * plausible typo — passes every cross-user test ever written, and fails here.
 *
 * ── Why there are two axes ──
 *
 * Not every method is scoped the same way, and collapsing the two either produces
 * spurious failures or silently weakens the assertion to nothing:
 *
 * - `record` — takes a record identifier plus the caller. A foreign caller
 *   supplying the OWNER's identifier must be refused and must change nothing,
 *   anywhere.
 * - `owner` — keyed by the owner alone (bulk writes, lists, counts). A foreign
 *   caller legitimately acts on their OWN records, so "changes nothing" is the
 *   wrong assertion; the right one is "the owner's records are untouched".
 */

const SETUP_TIMEOUT_MS = 120_000;

export interface OwnershipContext<TRepo> {
  repo: TRepo;
  connection: Connection;
  teardown: () => Promise<void>;
}

export type OwnershipAxis = 'record' | 'owner';

export interface OwnershipSpec<TRepo, TOwner, TTarget = unknown, TResult = unknown> {
  /** Typed against the repository so a rename breaks the build, not the coverage. */
  method: Extract<keyof TRepo, string>;
  /** Distinguishes multiple specs for one method (e.g. adopt vs decline). */
  label?: string;
  axis: OwnershipAxis;
  /** True when a legitimate owner call is expected to write. */
  mutates: boolean;
  /** Build one record owned by `owner`. Called three times per case. */
  seed: (owner: TOwner) => Promise<TTarget>;
  call: (repo: TRepo, target: TTarget, caller: TOwner) => Promise<TResult>;
  assertOwnerResult?: (result: TResult, target: TTarget) => void;
  assertForeignResult: (result: TResult, target: TTarget) => void;
}

/**
 * Element type of a spec list, with the per-spec target and result erased so
 * heterogeneous specs can share an array.
 */
export type AnyOwnershipSpec<TRepo, TOwner> = OwnershipSpec<
  TRepo,
  TOwner,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

/**
 * Binds a repository and owner type once, returning a builder that infers each
 * spec's own target and result.
 *
 * Without it, specs would be written against the erased `any` element type, and
 * `isOk(result)` — generic over the Result union — would infer its payload as
 * `unknown` from an `any` argument, leaving `result.value` unusable and every
 * callback parameter implicitly `any`. Inferring per spec instead means `seed`
 * types `target`, `call` types `result`, and the assertions narrow normally.
 *
 *   const spec = ownershipSpecFactory<ArtefactsRepository, Types.ObjectId>();
 *   const SPECS = [spec({ ... }), spec({ ... })];
 */
export function ownershipSpecFactory<TRepo, TOwner>() {
  return <TTarget, TResult>(
    spec: OwnershipSpec<TRepo, TOwner, TTarget, TResult>
  ): AnyOwnershipSpec<TRepo, TOwner> => spec as AnyOwnershipSpec<TRepo, TOwner>;
}

/**
 * Why a method is not covered by a spec.
 *
 * The `kind` is what keeps this list an audit of deliberate cross-user queries
 * rather than a junk drawer, and `reason` must say what makes the query safe —
 * not merely restate that it is unscoped.
 *
 * `method` is a bare string, not `keyof TRepo`: TypeScript `private` members are
 * absent from `keyof` but present on the prototype at runtime, so private helpers
 * have to be accountable here too. The staleness check below covers the loss of
 * compile-time protection.
 */
export interface Exemption {
  method: string;
  kind: 'global-by-design' | 'payload-scoped' | 'private-helper';
  reason: string;
}

export interface OwnershipSuiteConfig<TRepo extends object, TOwner> {
  /** Suite name, e.g. 'ArtefactsRepository'. */
  name: string;
  /** The concrete class — reflected over for the exhaustiveness check. */
  repoClass: { prototype: object };
  owner: TOwner;
  stranger: TOwner;
  setup: () => Promise<OwnershipContext<TRepo>>;
  specs: AnyOwnershipSpec<TRepo, TOwner>[];
  exempt: Exemption[];
}

/**
 * How many same-owner decoys are seeded either side of the target.
 *
 * A filter that loses its record predicate but keeps the owner one degrades to
 * "any record of this owner". Which record a single-document write then lands on
 * is the query planner's choice — in practice the first or the last match in
 * whatever index it picks, and the direction is not ours to control.
 *
 * So the target is seeded into the MIDDLE of the owner's records rather than at
 * one end. Neither extreme of the scan is then the target, in either direction,
 * and a widened filter lands on a sibling where the isolation assertion sees it.
 * This is positional, not probabilistic: it does not depend on the planner being
 * unpredictable, only on it choosing *some* end.
 *
 * Two either side rather than one so that a plan taking the second-from-either-end
 * is covered too.
 */
const SIBLINGS_BEFORE_TARGET = 2;
const SIBLINGS_AFTER_TARGET = 2;

/**
 * Records the harness seeds for the owner (siblings + target) and for the
 * stranger. Spec assertions that count rows — list, count, bulk-write returns —
 * must reference these rather than hard-coding a number, so changing the decoy
 * count above does not silently invalidate them.
 */
export const OWNER_SEED_COUNT = SIBLINGS_BEFORE_TARGET + 1 + SIBLINGS_AFTER_TARGET;
export const STRANGER_SEED_COUNT = 1;

interface Decoys<TTarget> {
  target: TTarget;
  targetKeys: string[];
  siblingKeys: string[];
  strangerKeys: string[];
  /** State immediately before the method under test runs. */
  baseline: Snapshot;
}

async function seedDecoys<TOwner, TTarget>(
  connection: Connection,
  // Narrowed to what seeding actually needs, so it stays independent of the
  // spec's result type.
  spec: { seed: (owner: TOwner) => Promise<TTarget> },
  owner: TOwner,
  stranger: TOwner
): Promise<Decoys<TTarget>> {
  const seedMany = async (owningId: TOwner, count: number) => {
    for (let i = 0; i < count; i++) await spec.seed(owningId);
  };

  // Snapshotting between each group is how the harness LEARNS which document
  // keys belong to which decoy — a spec never declares that itself.
  const empty = await snapshotAll(connection);

  await seedMany(owner, SIBLINGS_BEFORE_TARGET);
  const beforeTarget = await snapshotAll(connection);

  // Sandwiched between siblings — see SIBLINGS_BEFORE_TARGET.
  const target = await spec.seed(owner);
  const afterTarget = await snapshotAll(connection);

  await seedMany(owner, SIBLINGS_AFTER_TARGET);
  const afterSiblings = await snapshotAll(connection);

  await spec.seed(stranger);
  const afterStranger = await snapshotAll(connection);

  return {
    target,
    targetKeys: diffSnapshots(beforeTarget, afterTarget).touched,
    siblingKeys: [
      ...diffSnapshots(empty, beforeTarget).touched,
      ...diffSnapshots(afterTarget, afterSiblings).touched,
    ],
    strangerKeys: diffSnapshots(afterSiblings, afterStranger).touched,
    baseline: afterStranger,
  };
}

/**
 * What the harness's own structural rules can find wrong with a case.
 *
 * These are returned as DATA rather than asserted in place, so the harness can be
 * tested by something other than itself: `ownership-harness.integration.spec.ts`
 * drives the evaluators below against deliberately broken repositories and checks
 * the right code comes back. Without that, a refactor that made a rule vacuous
 * would leave every repository suite green while asserting nothing.
 *
 * Codes rather than prose so the self-test asserts on identity, leaving the
 * human-readable `detail` free to change.
 */
export type ViolationCode =
  /** A mutating method wrote nothing on its own happy path — every isolation
   *  rule below would then be vacuously satisfied. */
  | 'NO_WRITE'
  /** A read changed something. */
  | 'UNEXPECTED_WRITE'
  /** Touched a record belonging to another owner. */
  | 'STRANGER_TOUCHED'
  /** Touched one of the caller's OWN other records — a lost record predicate. */
  | 'SIBLING_TOUCHED'
  /** Touched something outside the target that is neither sibling nor stranger,
   *  e.g. a write into a collection the seed never created. */
  | 'OUTSIDE_TARGET_TOUCHED'
  /** A foreign caller changed something, anywhere. */
  | 'FOREIGN_WRITE'
  /** A foreign caller reached the owner's records. */
  | 'OWNER_RECORDS_TOUCHED';

export interface Violation {
  code: ViolationCode;
  detail: string;
}

export interface CaseOutcome<TTarget, TResult> {
  target: TTarget;
  result: TResult;
  violations: Violation[];
}

const violation = (code: ViolationCode, keys: readonly string[]): Violation => ({
  code,
  detail: keys.length ? keys.join(', ') : '(none)',
});

/**
 * Seeds decoys, runs the method as its rightful owner, and reports what the
 * harness's structural rules make of the resulting blast radius.
 *
 * The spec's own `assertOwnerResult` is deliberately NOT run here — that belongs
 * to the spec author and stays in the test body. Only the harness's rules move,
 * because only those need testing independently of the specs that use them.
 */
export async function evaluateOwnerCase<TRepo, TOwner, TTarget, TResult>(
  ctx: OwnershipContext<TRepo>,
  spec: OwnershipSpec<TRepo, TOwner, TTarget, TResult>,
  owner: TOwner,
  stranger: TOwner
): Promise<CaseOutcome<TTarget, TResult>> {
  const decoys = await seedDecoys(ctx.connection, spec, owner, stranger);

  const result = await spec.call(ctx.repo, decoys.target, owner);
  const { touched } = diffSnapshots(decoys.baseline, await snapshotAll(ctx.connection));

  const violations: Violation[] = [];

  if (spec.mutates) {
    if (touched.length === 0) violations.push(violation('NO_WRITE', []));
  } else if (touched.length > 0) {
    violations.push(violation('UNEXPECTED_WRITE', touched));
  }

  // Another owner's records are out of scope on both axes.
  const strangerHits = intersect(touched, decoys.strangerKeys);
  if (strangerHits.length) violations.push(violation('STRANGER_TOUCHED', strangerHits));

  if (spec.axis === 'record') {
    // The case hand-written suites miss: a filter that kept the owner predicate
    // but lost the record id widens onto the caller's OWN other records.
    const siblingHits = intersect(touched, decoys.siblingKeys);
    if (siblingHits.length) violations.push(violation('SIBLING_TOUCHED', siblingHits));

    // Stronger than the two above — also catches writes into collections the seed
    // never created.
    const outside = touched.filter(
      (key) =>
        !decoys.targetKeys.includes(key) &&
        !decoys.siblingKeys.includes(key) &&
        !decoys.strangerKeys.includes(key)
    );
    if (outside.length) violations.push(violation('OUTSIDE_TARGET_TOUCHED', outside));
  }

  return { target: decoys.target, result, violations };
}

/**
 * Same seeding, but the method is called by someone who does not own the target.
 *
 * On the `record` axis an unscoped filter matches here and nowhere else, so the
 * rule is absolute: nothing may change, anywhere. On the `owner` axis a stranger
 * legitimately acts on their own records, so the rule narrows to "the owner's
 * records are untouched".
 */
export async function evaluateForeignCase<TRepo, TOwner, TTarget, TResult>(
  ctx: OwnershipContext<TRepo>,
  spec: OwnershipSpec<TRepo, TOwner, TTarget, TResult>,
  owner: TOwner,
  stranger: TOwner
): Promise<CaseOutcome<TTarget, TResult>> {
  const decoys = await seedDecoys(ctx.connection, spec, owner, stranger);

  const result = await spec.call(ctx.repo, decoys.target, stranger);
  const { touched } = diffSnapshots(decoys.baseline, await snapshotAll(ctx.connection));

  const violations: Violation[] = [];

  if (spec.axis === 'record') {
    if (touched.length) violations.push(violation('FOREIGN_WRITE', touched));
  } else {
    const ownerHits = intersect(touched, [...decoys.targetKeys, ...decoys.siblingKeys]);
    if (ownerHits.length) violations.push(violation('OWNER_RECORDS_TOUCHED', ownerHits));
  }

  return { target: decoys.target, result, violations };
}

function specTitle<TRepo, TOwner>(spec: AnyOwnershipSpec<TRepo, TOwner>): string {
  return spec.label ? `${spec.method} (${spec.label})` : spec.method;
}

function declaredMethods(repoClass: { prototype: object }): string[] {
  const proto = repoClass.prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .filter(
      // Descriptor rather than property access: reading through a getter would
      // invoke it.
      (name) => typeof Object.getOwnPropertyDescriptor(proto, name)?.value === 'function'
    )
    .sort();
}

export function describeOwnershipSuite<TRepo extends object, TOwner>(
  config: OwnershipSuiteConfig<TRepo, TOwner>
): void {
  describe(`${config.name} — ownership & blast radius`, () => {
    let ctx: OwnershipContext<TRepo> | undefined;

    beforeAll(async () => {
      ctx = await config.setup();
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
      await ctx?.teardown();
    });

    beforeEach(async () => {
      await clearAll(ctx!.connection);
    });

    for (const spec of config.specs) {
      describe(specTitle(spec), () => {
        it(
          spec.mutates
            ? 'owner call writes the target and nothing else'
            : 'owner call resolves the target and writes nothing',
          async () => {
            const outcome = await evaluateOwnerCase(ctx!, spec, config.owner, config.stranger);

            spec.assertOwnerResult?.(outcome.result, outcome.target);
            expect(outcome.violations).toEqual([]);
          }
        );

        it(
          spec.axis === 'record'
            ? 'foreign caller is refused and changes nothing, anywhere'
            : "foreign caller never touches the owner's records",
          async () => {
            const outcome = await evaluateForeignCase(ctx!, spec, config.owner, config.stranger);

            spec.assertForeignResult(outcome.result, outcome.target);
            expect(outcome.violations).toEqual([]);
          }
        );
      });
    }

    describe('coverage', () => {
      it('every repository method has a spec or an explicit exemption', () => {
        const accounted = new Set<string>([
          ...config.specs.map((spec) => spec.method),
          ...config.exempt.map((exemption) => exemption.method),
        ]);

        const unaccounted = declaredMethods(config.repoClass).filter(
          (method) => !accounted.has(method)
        );

        expect(unaccounted).toEqual([]);
      });

      it('no exemption names a method that no longer exists', () => {
        const declared = new Set(declaredMethods(config.repoClass));
        const stale = config.exempt
          .map((exemption) => exemption.method)
          .filter((method) => !declared.has(method))
          .sort();

        expect(stale).toEqual([]);
      });
    });
  });
}
