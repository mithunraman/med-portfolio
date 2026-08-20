import { PdpGoalStatus } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PDP_GOAL_SORT_SENTINEL_ISO } from '../pdp-goal.constants';

// Embedded action subdocument
export class PdpGoalAction {
  @Prop({ required: true })
  xid!: string;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true, default: '' })
  intendedEvidence!: string;

  @Prop({ required: true, type: Number, default: PdpGoalStatus.PROPOSED })
  status!: PdpGoalStatus;

  @Prop({ type: Date, default: null })
  dueDate!: Date | null;

  @Prop({ type: String, default: null })
  completionReview!: string | null;
}

/**
 * Who created a link. `user` is unreachable today — see PdpGoalLink.
 *
 * A const object rather than a bare union so the value has a referenceable name
 * at every site. `proposalFilter` matches on it inside an untyped filter object,
 * where Mongoose's FilterQuery does NOT narrow through `$elemMatch` — a bare
 * literal typo there compiles clean. `Object.values` below then keeps the Mongoose
 * validator derived from this same declaration rather than restating it, so adding
 * a source updates the type, the validator and every call site in one edit.
 */
export const PdpGoalLinkSource = {
  ANALYSIS: 'analysis',
  USER: 'user',
} as const;

export type PdpGoalLinkSource = (typeof PdpGoalLinkSource)[keyof typeof PdpGoalLinkSource];

/**
 * A citation from a goal to an artefact that evidences it.
 *
 * The artefact→goal relationship is citation, not ownership: deleting or
 * archiving an entry never removes a link. The array is APPEND-ONLY — nothing
 * removes, deactivates or reorders an element.
 *
 * `linkedBy` is load-bearing despite only ever being `'analysis'` today: it is
 * the discriminator in `PdpGoalsRepository.proposalFilter`, which is what stops
 * the destructive proposal queries from widening onto goals the trainee owns
 * once goals can be created standalone or carry a second link.
 */
export class PdpGoalLink {
  @Prop({ required: true, type: Types.ObjectId })
  artefactId!: Types.ObjectId;

  @Prop({ required: true, type: Date })
  linkedAt!: Date;

  @Prop({ required: true, type: String, enum: Object.values(PdpGoalLinkSource) })
  linkedBy!: PdpGoalLinkSource;
}

@Schema({
  collection: 'pdp_goals',
  timestamps: true,
})
export class PdpGoal {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  xid!: string;

  @Prop({ required: true })
  goal!: string;

  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  /**
   * Artefacts that evidence this goal. Append-only (see PdpGoalLink).
   *
   * Empty is a legitimate state: an adopted goal whose entries were all deleted
   * today, and a standalone trainee-created goal once that lands. Every read
   * path must render zero links without special-casing.
   */
  @Prop({ type: [PdpGoalLink], default: [] })
  links!: PdpGoalLink[];

  @Prop({ required: true, type: Number, default: PdpGoalStatus.PROPOSED })
  status!: PdpGoalStatus;

  @Prop({ type: Date, default: null })
  reviewDate!: Date | null;

  // Internal, non-null keyset-pagination sort key: reviewDate ?? SENTINEL.
  // Maintained by the repository on every reviewDate write; never surfaced in DTOs.
  // Factory default (not a shared Date object) so every doc gets its own instance.
  @Prop({ required: true, type: Date, default: () => new Date(PDP_GOAL_SORT_SENTINEL_ISO) })
  sortDate!: Date;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: String, default: null })
  completionReview!: string | null;

  @Prop({ type: [PdpGoalAction], default: [] })
  actions!: PdpGoalAction[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type PdpGoalDocument = PdpGoal & Document;

/**
 * The multikey path every citation query filters and indexes on.
 *
 * Centralised for uniform failure, NOT for type safety — TypeScript cannot check a
 * dotted Mongo path either way. The point is that a typo now breaks all four sites
 * at once: the two `find` filters and the `$lookup` return nothing and fail loudly
 * in CI, which catches the one site a test cannot see. A mistyped path in the index
 * below builds an index nothing queries, so lookups stay CORRECT and silently fall
 * back to a collection scan.
 */
export const LINK_ARTEFACT_PATH = 'links.artefactId' as const;

export const PdpGoalSchema = SchemaFactory.createForClass(PdpGoal);

// Compound indexes
// Keyset pagination + dashboard "due soon" both filter { userId, status } and
// sort/seek on sortDate with an _id tiebreak — this index backs both (item 29).
PdpGoalSchema.index({ userId: 1, status: 1, sortDate: 1, _id: 1 });
// Multikey on links.artefactId, led by userId because every read is user-scoped.
// NOTE: a multikey predicate matches across DIFFERENT array elements — any future
// query combining two link fields must use $elemMatch (as proposalFilter does).
PdpGoalSchema.index({ userId: 1, [LINK_ARTEFACT_PATH]: 1 });
