# Auth Branch Simplification Findings

Review of the `newAuth` branch (commit `19eb592` — "initial auth commit") vs. `main`.
Scope: refresh-token sessions, device tracking, web + mobile client plumbing, new test harness, deleted token-refresh interceptor.

**No code changes have been made.** This document is a pure findings report. Each item below is described in enough detail that it can be picked up and actioned independently. Items are grouped into three top-level categories (Reuse, Quality, Efficiency) and each item is tagged with a priority.

Legend:
- **[P1]** fix before users arrive — correctness, hot-path, or clear data-integrity concern
- **[P2]** meaningful per-login / per-flow impact, or consistency issue that will cause drift
- **[P3]** polish / low-risk cleanup

---

## Section A — Code Reuse

### A.1 [P2] Mobile `createRNHttpAdapter` duplicates `createFetchAdapter`
**Files:** [apps/mobile/src/api/client.ts:72-111](apps/mobile/src/api/client.ts#L72-L111) vs. [packages/api-client/src/adapters/fetch.adapter.ts:7-48](packages/api-client/src/adapters/fetch.adapter.ts#L7-L48)

The mobile fetch adapter is a near line-for-line copy of the shared `createFetchAdapter`: same `AbortController` timeout wiring, same header iteration into a plain object, same JSON-or-null catch block. The only differences are a few `apiLogger.debug` calls and a re-throw in the catch branch.

**Why it matters:** two fetch adapters = two maintenance surfaces. A bug fix in one will silently not propagate.

**Fix:** Either (a) add a `logger?: (event) => void` option to `createFetchAdapter` and have mobile pass it through, or (b) wrap the shared adapter with a thin logging decorator. Web already uses the shared adapter at [apps/web/src/api/client.ts:33](apps/web/src/api/client.ts#L33) — this is simply a consistency fix.

### A.2 [P2] `mobileTokenProvider` bypasses `AppSecureStorage`
**Files:** [apps/mobile/src/api/client.ts:21-64](apps/mobile/src/api/client.ts#L21-L64) vs. [apps/mobile/src/services/AppSecureStorage.ts](apps/mobile/src/services/AppSecureStorage.ts)

`AppSecureStorage` exists as the typed SecureStore wrapper — its schema already declares `accessToken: string; refreshToken: string`. The new `mobileTokenProvider` reads and writes `expo-secure-store` directly with raw string keys, in parallel to [authSlice.ts:61-64](apps/mobile/src/store/slices/authSlice.ts#L61-L64) which uses `AppSecureStorage.get('accessToken')`. You now have two independent code paths operating on the same SecureStore keys.

**Why it matters:** drift magnet. Any future change to the typed wrapper (compression, encryption wrapping, key-rotation) won't be picked up by the token provider.

**Fix:** Have `mobileTokenProvider` delegate to `AppSecureStorage.get/set/remove('accessToken' | 'refreshToken')`.

### A.3 [P2] `device.ts` also bypasses `AppSecureStorage`
**File:** [apps/mobile/src/api/device.ts:17,23](apps/mobile/src/api/device.ts#L17)

`device.ts` reads and writes `auth.deviceId` via raw `SecureStore.getItemAsync/setItemAsync`. `AppSecureStorage.SecureStorageSchema` could be extended with `deviceId: string` so the wrapper owns all SecureStore keys. As of today, if someone later adds logic to `AppSecureStorage.clearSession()` it will silently forget to touch the device id.

**Fix:** Route all device-id reads/writes through `AppSecureStorage`.

### A.4 [P2] `Session` schema is missing `xid`
**File:** [apps/api/src/auth/schemas/session.schema.ts](apps/api/src/auth/schemas/session.schema.ts)

Every other schema in the project has an auto-generated `xid` via `nanoidAlphanumeric()` (see `notice.schema.ts:12`, `artefact.schema.ts`, `pdp-goal.schema.ts`, etc.). `CLAUDE.md` is explicit: "Responses always return xid, never _id." But `auth.service.ts:392` exposes `session._id.toString()` through `GET /auth/sessions`.

**Why it matters:** leaks the internal identity to API callers, and mobile code will later need to reference sessions by id — it should never see an `ObjectId`-shaped string.

**Fix:** Add `xid: @Prop({ index: true, unique: true, default: () => nanoidAlphanumeric() })` on the session schema, have the controller path params accept and look up by `xid`, and have `toSessionView` return `xid` as the `id` field.

### A.5 [P3] Guest id uses `crypto.randomUUID()` instead of `nanoidAlphanumeric()`
**File:** [apps/api/src/auth/auth.service.ts:142](apps/api/src/auth/auth.service.ts#L142)

Every other module generating client-visible ids uses `nanoidAlphanumeric()` from `apps/api/src/common/utils/nanoid.util.ts`. Guest emails pick a different shape for no stated reason.

**Fix:** Use `nanoidAlphanumeric()` for consistency.

### A.6 [P3] TTL math is open-coded in service + three tests
**Files:**
- [apps/api/src/auth/auth.service.ts:55](apps/api/src/auth/auth.service.ts#L55): `days * 24 * 60 * 60 * 1000`
- [apps/api/src/auth/__tests__/sessions.repository.integration.spec.ts:19](apps/api/src/auth/__tests__/sessions.repository.integration.spec.ts#L19)
- [apps/api/src/auth/__tests__/jwt.strategy.spec.ts:33](apps/api/src/auth/__tests__/jwt.strategy.spec.ts#L33)
- [apps/api/src/auth/__tests__/auth.service.spec.ts:50](apps/api/src/auth/__tests__/auth.service.spec.ts#L50)

The service already imports `ms` at `auth.service.ts:24` (used for `ms('48h')`). Writing `days * 24 * 60 * 60 * 1000` instead of `days * ms('1d')` (or `ms(\`${days}d\`)`) is a small consistency miss, repeated in three test fixtures.

**Fix:** Use `ms()` everywhere. Extract a `REFRESH_TTL_MS_DEFAULT` constant or a `futureDate(days)` helper in the auth test harness.

### A.7 [P3] Repeated `Types.ObjectId.isValid(id)` + `new Types.ObjectId(id)` pattern
**File:** [apps/api/src/auth/sessions.repository.ts:23,39,77,93,112,122,160,176](apps/api/src/auth/sessions.repository.ts)

Six call sites in `sessions.repository.ts` convert a string id to `ObjectId`; two sites also guard with `Types.ObjectId.isValid()`. `apps/api/src/common/utils/objectid.util.ts` already exists and contains `objectIdsEqual` — a natural home for a `toObjectId(id): Types.ObjectId | null` helper that does the validation + conversion in one place.

**Fix:** Add `toObjectId` and `isObjectIdString` to `objectid.util.ts`, replace the six call sites.

### A.8 [P3] `sha256Hex()` helper opportunity
**File:** [apps/api/src/auth/token.service.ts:36](apps/api/src/auth/token.service.ts#L36)

`crypto.createHash('sha256').update(x).digest('hex')` is a one-liner, but the same pattern will appear in any future code that hashes tokens or fingerprints. A shared `sha256Hex(input: string): string` helper in `common/utils/` keeps future hashing consistent.

**Fix:** Nice to have. Optional.

### A.9 [P3] Headers parsing helper `headerString` is file-local + re-implemented in tests
**Files:** [apps/api/src/common/decorators/device-info.decorator.ts:10-14](apps/api/src/common/decorators/device-info.decorator.ts#L10-L14) and [apps/api/src/common/decorators/__tests__/device-info.decorator.spec.ts:30-45](apps/api/src/common/decorators/__tests__/device-info.decorator.spec.ts#L30-L45)

The decorator test file doesn't test the decorator — it re-implements the factory body inline because it couldn't call the Nest factory directly. Strong smell that the pure function wants to be exported and tested.

**Fix:** Export `headerString` (and possibly the factory body itself) from `device-info.decorator.ts`; import and test it directly.

### A.10 [P3] `AUTH_ERROR_CODES` duplicates `AuthErrorCode` from shared
**Files:** [packages/api-client/src/core/api-client.ts:22-40](packages/api-client/src/core/api-client.ts#L22-L40) vs. [packages/shared/src/dto/auth.dto.ts:82-93](packages/shared/src/dto/auth.dto.ts#L82-L93)

`packages/shared` already exports `AuthErrorCode`; api-client redefines the whole map locally. `AuthErrorCode.REFRESH_REPLAY` exists in shared but is missing from the local copy — already drifted.

**Fix:** `import { AuthErrorCode } from '@<shared-package>'`; delete the local object.

### A.11 [P3] Unit + integration test setup duplicate `MongoMemory*` boilerplate
**Observed pre-existing drift.** Every integration test in the repo now creates its own `MongoMemoryServer` / `MongoMemoryReplSet` + teardown. Adding `auth-test-harness.ts` is consistent with that pattern but highlights the absence of a shared `createMongoInMemory()` helper in `apps/api/src/common/test/` (which doesn't exist today).

**Fix:** Not in scope for this PR — but a good future cleanup.

### A.12 [P3] `AuthErrorCode` uses `as const` object while every other shared enum uses `enum`
**File:** [packages/shared/src/dto/auth.dto.ts:82-93](packages/shared/src/dto/auth.dto.ts#L82-L93)

Inconsistent with `SessionRevokedReason` (declared as a real `enum`) and all other enums in `packages/shared/src/enums/`. Readers of `shared` will wonder which pattern to follow.

**Fix:** Convert to `export enum AuthErrorCode { ... }`.

### A.13 [P3] `testAppConfig()` duplicates the real config shape
**File:** [apps/api/src/auth/__tests__/helpers/auth-test-harness.ts:32-68](apps/api/src/auth/__tests__/helpers/auth-test-harness.ts#L32-L68) vs. [apps/api/src/config/app.config.ts:146-188](apps/api/src/config/app.config.ts#L146-L188)

If a config key is renamed in `app.config.ts`, the test harness won't notice.

**Fix:** Have `testAppConfig()` spread the real shape (or import and partially override), so renames are caught.

### A.14 [Confirmed clean] Web cookie handling
No new cookie code exists in this branch despite the task referring to "web cookie auth." `apps/web/src/api/client.ts` uses `localStorage`; no `document.cookie` or `credentials: 'include'` was introduced. If cookie auth on web is actually intended, it is not yet implemented.

---

## Section B — Code Quality

### B.1 [P1] JwtStrategy.validate returns an untyped ad-hoc object
**File:** [apps/api/src/auth/strategies/jwt.strategy.ts:81-86](apps/api/src/auth/strategies/jwt.strategy.ts#L81-L86)

Returns `{ userId, role, sessionId }` — the same shape as `CurrentUserPayload` (`apps/api/src/common/decorators/current-user.decorator.ts:3-7`) but the relationship is implicit. A future field added to `CurrentUserPayload` would silently fail to populate here.

**Fix:** Declare the explicit return type: `async validate(payload: JwtPayload): Promise<CurrentUserPayload>`.

### B.2 [P1] `SessionsRepository` interface leaks `Types.ObjectId` through return types
**File:** [apps/api/src/auth/sessions.repository.interface.ts:17](apps/api/src/auth/sessions.repository.interface.ts#L17)

Methods return `Result<Session, DBError>` where `Session` is the Mongoose schema class with `_id: Types.ObjectId` and `userId: Types.ObjectId`. The service unwraps them: `session._id.toString()`, `session.userId.toString()` (see `auth.service.ts:186, 217-229, 275, 390-398`). `CLAUDE.md` is explicit: services must not know about `Types.ObjectId`.

**Why it matters:** This is a direct violation of the documented architecture rule. Propagating it adds another call-site that will need migration later.

**Fix:** Have the repo return a `SessionRecord` domain type with string ids (`id: string`, `userId: string`). The service becomes `if (found.value.userId !== userId)` — no `.toString()` calls needed.

### B.3 [P1] `RequestOptions` has three optional booleans — combinatoric trap
**File:** [packages/api-client/src/core/api-client.ts:10-20](packages/api-client/src/core/api-client.ts#L10-L20)

```ts
interface RequestOptions extends Omit<HttpRequestConfig, 'url' | 'method'> {
  method?: HttpRequestConfig['method'];
  authenticated?: boolean;
  skipUnauthorizedCallback?: boolean;
  skipRefresh?: boolean;
}
```

Each call site picks a triplet. `auth.client.ts` shows the symptom: every auth call needs a different combination.

**Fix:** Replace with a single `mode` union: `mode?: 'public' | 'authenticated' | 'refresh' | 'best-effort-auth'`. Each mode maps to one valid combination; illegal combinations become unrepresentable.

### B.4 [P1] `AuthContext.tsx` context value re-created every render
**File:** [apps/web/src/auth/AuthContext.tsx:89-99](apps/web/src/auth/AuthContext.tsx#L89-L99)

```tsx
<AuthContext.Provider
  value={{ user, isLoading, isAuthenticated: !!user, otpSend, otpVerify, logout }}
>
```

A fresh object on every render ⇒ every `useAuth()` consumer re-renders on every provider render. This is the classic React context performance bug.

**Fix:** Wrap in `useMemo` with deps `[user, isLoading, otpSend, otpVerify, logout]`. Since `otpSend/otpVerify/logout` are already `useCallback`s, this stabilises the context value.

### B.5 [P1] Dead error code — `AuthErrorCode.REFRESH_REPLAY` never emitted
**Files:** [packages/shared/src/dto/auth.dto.ts:89](packages/shared/src/dto/auth.dto.ts#L89) vs. [apps/api/src/auth/auth.service.ts:189-192](apps/api/src/auth/auth.service.ts#L189-L192)

`REFRESH_REPLAY` is declared in the error code enum. On actual replay detection, the service throws `REFRESH_INVALID`. The only usage of `REFRESH_REPLAY` is a test that asserts the constant exists (`auth-contract.spec.ts:113`). Dead code that a future reader will spend time understanding.

**Fix:** Decide — either (a) emit `REFRESH_REPLAY` from the service on replay detection so clients can distinguish replay from generic invalid, or (b) delete it from the enum.

### B.6 [P2] Mobile caches tokens twice (module cache + AppSecureStorage)
**Files:** [apps/mobile/src/api/client.ts:21-34](apps/mobile/src/api/client.ts#L21-L34) and [apps/mobile/src/store/slices/authSlice.ts:61-64](apps/mobile/src/store/slices/authSlice.ts#L61-L64)

Two read paths for the same SecureStore keys: the token provider's module-level cache, and `authSlice.initializeAuth` reading directly through `AppSecureStorage`. `initializeAuth` never seeds the cache, so the first request after cold boot re-reads the store.

**Fix:** Have `initializeAuth` call `mobileTokenProvider.getAccessToken()` / `.getRefreshToken()` so there is one read path.

### B.7 [P2] `tokensLoaded` flag + two nullable caches = redundant state
**File:** [apps/mobile/src/api/client.ts:21-34, 46-63](apps/mobile/src/api/client.ts#L21-L63)

Three state variables encode "have we loaded yet?" when one memoised promise would do.

**Fix:** Replace with `let loadTokensOnce: Promise<void> | null = null;` — first call initialises, subsequent calls await.

### B.8 [P2] `unauthorizedFired` is derivable state
**File:** [apps/mobile/src/api/client.ts:49, 115, 132-137](apps/mobile/src/api/client.ts#L49)

The flag ensures the global `onUnauthorized` callback fires only once. It's reset on `setTokens` but not on `clearTokens`, and its real meaning ("are we currently authenticated?") duplicates `cachedAccessToken !== null`.

**Fix:** Either derive (`if (cachedAccessToken) onUnauthorizedCallback?.()`) or move the debounce to the redux `authSlice` where auth state already lives.

### B.9 [P2] `StoredUserSession.isGuest` duplicates `user.role`
**Files:** [apps/mobile/src/services/AppSecureStorage.ts:10-14](apps/mobile/src/services/AppSecureStorage.ts#L10-L14) and [apps/mobile/src/store/slices/authSlice.ts:78](apps/mobile/src/store/slices/authSlice.ts#L78)

`isGuest` is already computable from `user.role === UserRole.USER_GUEST`. `authSlice.ts:78` explicitly falls back to that derivation.

**Fix:** Drop the `isGuest` field from `StoredUserSession`; derive on read.

### B.10 [P2] `AuthService.claimGuestAccount` has 6 positional parameters
**File:** [apps/api/src/auth/auth.service.ts:100-107](apps/api/src/auth/auth.service.ts#L100-L107)

Six positional strings — four of which are indistinguishable at a call site. The controller call `user.userId, user.sessionId, dto.email, dto.code, dto.name, device` is an ordering bug waiting to happen.

**Fix:** Accept a single object: `claimGuestAccount({ caller: { userId, sessionId }, credentials: { email, code }, profile: { name }, device })`.

### B.11 [P2] `DeviceInfoProvider.getOs` is an optional method
**File:** [packages/api-client/src/adapters/types.ts:38-42](packages/api-client/src/adapters/types.ts#L38-L42)

Three valid shapes: method missing, method returning `undefined`, method returning string. Too many paths through the type.

**Fix:** Either make `getOs(): string | undefined` required (web returns `undefined`), or collapse the interface to `getDeviceHeaders(): { deviceId; deviceName; os?; appVersion? }` which matches what `attachDeviceHeaders` consumes anyway.

### B.12 [P2] Two near-identical `TokenProvider` implementations
**Files:** [apps/mobile/src/api/client.ts:36-64](apps/mobile/src/api/client.ts#L36-L64) and [apps/web/src/api/client.ts:8-23](apps/web/src/api/client.ts#L8-L23)

Both implement `get/set/clear` over a minimal async KV. Web extracts `ACCESS_KEY`/`REFRESH_KEY` constants; mobile hard-codes the strings — same bug as B.16 below.

**Fix:** Factor `createTokenProvider({ get, set, delete })` in `packages/api-client/src/adapters/`. Both apps shrink to ~5 lines.

### B.13 [P2] Near-identical `loginAs` / `loginFlow` helpers across 4 integration specs
**Files:**
- [apps/api/src/auth/__tests__/auth-flows.integration.spec.ts:16-39](apps/api/src/auth/__tests__/auth-flows.integration.spec.ts#L16-L39)
- [apps/api/src/auth/__tests__/auth-cross-cutting.integration.spec.ts:18-36](apps/api/src/auth/__tests__/auth-cross-cutting.integration.spec.ts#L18-L36)
- [apps/api/src/auth/__tests__/sessions-endpoints.integration.spec.ts:16-39](apps/api/src/auth/__tests__/sessions-endpoints.integration.spec.ts#L16-L39)
- [apps/api/src/auth/__tests__/guest-flows.integration.spec.ts:15-27](apps/api/src/auth/__tests__/guest-flows.integration.spec.ts#L15-L27)

Each owns its own copy of "POST /otp/send → extract → POST /otp/verify → return tokens." `open-questions.md` already flags this.

**Fix:** Add `loginWithOtp(harness, { email, device?, name? })` and `registerGuestFlow(harness, { device? })` to `auth-test-harness.ts`; have every integration file import them.

### B.14 [P2] `'logout_all'` raw string in account-cleanup test
**File:** [apps/api/src/account-cleanup/__tests__/account-cleanup.service.spec.ts:326](apps/api/src/account-cleanup/__tests__/account-cleanup.service.spec.ts#L326)

```ts
expect(sessionRepo.revokeAllByUser).toHaveBeenCalledWith(
  targetUserId.toString(),
  'logout_all'
);
```

Should use `SessionRevokedReason.LOGOUT_ALL` like every other test.

**Fix:** Replace the string literal.

### B.15 [P2] Header names as literals — both sides of the wire
**Files:**
- [packages/api-client/src/core/api-client.ts:163,167,168,176,187,189,191](packages/api-client/src/core/api-client.ts) — `'x-request-id'`, `'x-app-version'`, `'x-platform'`, `'Authorization'`, `'x-device-id'`, `'x-device-name'`, `'x-os'`
- [apps/api/src/common/decorators/device-info.decorator.ts:21-24](apps/api/src/common/decorators/device-info.decorator.ts#L21-L24) — same names
- [apps/api/src/auth/__tests__/helpers/auth-test-harness.ts:186-189](apps/api/src/auth/__tests__/helpers/auth-test-harness.ts#L186-L189) — same names
- [apps/api/src/init/init.controller.ts:13](apps/api/src/init/init.controller.ts#L13)

Client and server agree by convention only. A typo breaks auth silently.

**Fix:** Extract a `HEADERS` constants object in `packages/shared` (or a shared API spot), import on both ends.

### B.16 [P2] Mobile SecureStore keys hard-coded at multiple sites
**Files:**
- [apps/mobile/src/api/client.ts:28,29,51,52,60,61](apps/mobile/src/api/client.ts) — six raw literals
- [apps/mobile/src/services/AppSecureStorage.ts:40,84,85](apps/mobile/src/services/AppSecureStorage.ts)
- [apps/mobile/src/store/slices/authSlice.ts:62,63](apps/mobile/src/store/slices/authSlice.ts)

Web already does this right (`apps/web/src/api/client.ts:5-6` extracts `ACCESS_KEY`/`REFRESH_KEY`). Mobile didn't.

**Fix:** Export `ACCESS_TOKEN_KEY` and `REFRESH_TOKEN_KEY` from `AppSecureStorage.ts`; use everywhere.

### B.17 [P2] `device-info.decorator.spec.ts` tests a re-implementation, not the real decorator
**File:** [apps/api/src/common/decorators/__tests__/device-info.decorator.spec.ts:9-45](apps/api/src/common/decorators/__tests__/device-info.decorator.spec.ts#L9-L45)

The test file contains a paragraph describing three failed attempts to reach the real decorator factory, then re-implements the factory body inline. Every U-DH-xx test runs against the inline copy. **The decorator itself has zero test coverage.** A bug in `device-info.decorator.ts` will not fail these tests.

**Fix:** Replace with a real test via a minimal Nest testing module + throwaway controller + supertest — or delete the file since the happy path is already covered in the integration tests.

### B.18 [P2] `claimGuestAccount` silently ignores revoke failure
**File:** [apps/api/src/auth/auth.service.ts:125-133](apps/api/src/auth/auth.service.ts#L125-L133)

Sequence: mutate guest → save → revoke old session → mint new tokens. If revoke fails (repo returns `err` and the service ignores the `Result`), the user ends up with two active sessions (old guest + new claimed) that both work until natural 90-day expiry.

**Fix:** Check the revoke result; either throw on error or queue a retry.

### B.19 [P3] `authSlice` has 7 top-level fields, some transient
**File:** [apps/mobile/src/store/slices/authSlice.ts:32-40](apps/mobile/src/store/slices/authSlice.ts#L32-L40)

`isNewUser` and `devOtp` are OTP-flow transient state — only meaningful between `otpSend.fulfilled` and `otpVerify.*`. They do not belong in root auth state. `specialties` is similarly misplaced.

**Fix:** Extract an `otpFlow` slice or use local screen state; keep `authSlice` for session concerns only.

### B.20 [P3] Unnecessary narrative comments
**Files:**
- `packages/api-client/src/core/api-client.ts:79` and `:104` — `// Proactive refresh: …` / `// Reactive refresh on 401 …` — immediately followed by code that reads the same. (Keep the CAS comment at lines 210-214 and swallow-reason at 206-208 — those explain WHY.)
- `apps/api/src/auth/auth.service.ts:58, 158, 237, 262, 283, 340` — six section-banner comments in a 427-line file. Low value.
- `apps/mobile/src/store/slices/authSlice.ts` — 9 JSDoc blocks each restating the function name (`/** Send OTP to email address. */` on `otpSend`, etc.).
- `apps/api/src/auth/__tests__/auth-cross-cutting.integration.spec.ts:84-86, 110, 131, 168, 192` — `// ── Bonus: … ──` banners repeating the `it()` description.

**Fix:** Delete the narration; keep only the comments that state a non-obvious WHY.

### B.21 [P3] `(as any)` bypasses mock typing in service tests
**File:** [apps/api/src/auth/__tests__/auth.service.spec.ts:98-102](apps/api/src/auth/__tests__/auth.service.spec.ts#L98-L102)

Mocks are typed implicitly, then cast to `any` at construction time. Renaming an interface method keeps the test green against the stale mock. `jwt.strategy.spec.ts:44` already uses `jest.Mocked<ISessionRepository>` — pattern exists, just wasn't copied.

**Fix:** `const mockSessionRepo: jest.Mocked<ISessionRepository> = { ... };` likewise for `TokenService`, `OtpService`, `ConfigService`.

### B.22 [P3] Fragmented describe blocks in `auth.service.spec.ts`
**File:** `apps/api/src/auth/__tests__/auth.service.spec.ts`

14 top-level describes, four of them for `refreshSession` alone (`refreshSession`, `refreshSession when user disappears mid-flight`, `refreshSession when rotate fails`, `refreshSession replay logging`). Same for `otpVerifyAndLogin` (three).

**Fix:** Consolidate into one `describe('refreshSession', …)` with nested describes or descriptive `it()` names.

### B.23 [P3] Integration tests duplicate unit coverage
`auth.service.spec.ts` methods like `claimGuestAccount`, `refreshSession` are already fully covered by `guest-flows.integration.spec.ts` and `auth-flows.integration.spec.ts`. The unit tests are brittle (mocks encode the same assumptions as the real code) and will need touch-ups on any refactor that the integration tests would already catch.

**Fix:** Keep integration coverage; trim unit tests to cases that actually exercise isolated logic not covered end-to-end (e.g. `toSessionView`, `listSessions` error-fallback).

### B.24 [P3] Magic number `PROACTIVE_REFRESH_BUFFER_SECONDS = 60` not tunable
**File:** [packages/api-client/src/core/api-client.ts:42](packages/api-client/src/core/api-client.ts#L42)

Hard-coded. If access token TTL ever shortens (currently 60 minutes), the buffer-to-lifetime ratio becomes aggressive and every request triggers a proactive refresh.

**Fix:** Accept as `ApiClientConfig.proactiveRefreshBufferSeconds` with 60 as default.

### B.25 [P3] Profile-mutation thunks copy-paste stored-user update
**File:** [apps/mobile/src/store/slices/authSlice.ts:214-218, 240-244, 268-272](apps/mobile/src/store/slices/authSlice.ts)

Three thunks each do: `const s = await AppSecureStorage.get('user'); if (s) await AppSecureStorage.set('user', { ...s, user });`.

**Fix:** Extract `updateStoredUser(user)` helper.

### B.26 [Confirmed clean] Web JSX nesting
No unnecessary nesting in `apps/web/src/auth/AuthContext.tsx`. Only element is `<AuthContext.Provider>{children}</AuthContext.Provider>`.

---

## Section C — Efficiency

### C.1 [P1] JwtStrategy issues 2 Mongo queries on every authenticated request
**File:** [apps/api/src/auth/strategies/jwt.strategy.ts:42-45](apps/api/src/auth/strategies/jwt.strategy.ts#L42-L45)

```ts
const [user, sessionResult] = await Promise.all([
  this.userModel.findById(payload.sub).select('role anonymizedAt').lean(),
  this.sessionRepo.findById(payload.sid),
]);
```

Every authenticated API call pays for two round-trips. `Promise.all` parallelises but the underlying cost is ~2 index lookups × every request. Compared to the pre-branch JWT-only flow, this is a meaningful hot-path regression.

**Why it matters:** the biggest efficiency item on the branch. At even modest sustained traffic this doubles Mongo read load and adds latency to every endpoint.

**Fix (pick one or combine):**
1. Cache revocation status in an in-memory LRU keyed by `sessionId`, TTL 30-60s; `revokeSession` / `revokeAllByUser` bust the entry. Turns the common case into zero queries.
2. Drop the user lookup: `role` is in the JWT payload, and `anonymizedAt` can piggy-back on the session (anonymization revokes all sessions already). If sessions are revoked on anonymization, the user read is redundant.
3. Add a narrow `SessionsRepository.findRevocationStatus(sessionId): { revokedAt; expiresAt } | null` (see C.12), at least avoiding loading the full session document.

### C.2 [P1] Missing TTL index on `session.expiresAt`
**File:** [apps/api/src/auth/schemas/session.schema.ts](apps/api/src/auth/schemas/session.schema.ts)

The schema declares `expiresAt` but has no TTL index. Expired and revoked sessions accumulate forever. Contrast `otp.schema.ts:32` which uses `expireAfterSeconds: 0`.

**Why it matters:** unbounded collection growth. Every login adds a document; it's retained past revoke; past expiry it just sits there. Over time, dead rows dominate the collection and slow every query's index scan.

**Fix:** `SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });`. Revoked-but-not-expired rows are correctly retained (needed for `findByPreviousHash` replay detection during their TTL window); once `expiresAt` passes, Mongo auto-drops them.

### C.3 [P1] Missing index on `session.previousHashes`
**File:** [apps/api/src/auth/sessions.repository.ts:62](apps/api/src/auth/sessions.repository.ts#L62)

`findByPreviousHash({ previousHashes: hash })` is called on every refresh replay check (every stale client + every attacker attempt). With no index on `previousHashes`, this is a full collection scan.

**Why it matters:** refresh is frequent; replay checks fire on every mismatch between stored hash and presented token.

**Fix:** `SessionSchema.index({ previousHashes: 1 });`. Multi-key array indexes are cheap.

### C.4 [P1] Unbounded session-list endpoint
**File:** [apps/api/src/auth/sessions.repository.ts:89-104](apps/api/src/auth/sessions.repository.ts#L89-L104)

```ts
const sessions = await this.sessionModel
  .find({ userId, revokedAt: null, expiresAt: { $gt: now } })
  .sort({ lastUsedAt: -1 })
  .lean();
```

No `.limit()`. A user with many devices (or scripted abuse) could accumulate arbitrary active sessions.

**Fix:** Add a hard `.limit(50)` or similar product cap. Optionally enforce a write-time cap (revoke oldest when active count > N).

### C.5 [P1] `AuthContext.tsx` cascading re-renders — see B.4
Already called out above; listed here as well because it is primarily an efficiency concern (per-render cascade to all `useAuth()` consumers).

### C.6 [P2] Refresh flow does a wide user read
**File:** [apps/api/src/auth/auth.service.ts:202](apps/api/src/auth/auth.service.ts#L202)

`const user = await this.userModel.findById(session.userId);` — returns the full hydrated Mongoose document when only `role` + `anonymizedAt` are needed. No `.lean()`.

**Fix:** `.findById(session.userId).select('role anonymizedAt').lean()`.

### C.7 [P2] `authSlice` reducers replace `user` unconditionally
**File:** [apps/mobile/src/store/slices/authSlice.ts:322-323, 351-352, 366-367, 402, 407-408](apps/mobile/src/store/slices/authSlice.ts)

Each fulfilled handler assigns `state.user = action.payload`, building a new reference every time. Selectors subscribed to `state.auth.user` re-run; connected components re-render.

**Fix:** Shallow-compare before assigning, or have components subscribe to narrow fields via memoised selectors.

### C.8 [P2] TOCTOU in device-login flow and N round-trips
**File:** [apps/api/src/auth/auth.service.ts:351-360](apps/api/src/auth/auth.service.ts#L351-L360)

`findActiveByUserAndDevice → revoke → create` is 3 round-trips and races under concurrent logins from the same device.

**Fix:** Add `sessionRepo.revokeActiveByUserAndDevice(userId, deviceId, reason)` backed by a single `updateMany`. Then `create` the new session. 2 round-trips, correct under concurrency.

### C.9 [P2] `revokeSession` check-then-write could be one conditional update
**File:** [apps/api/src/auth/auth.service.ts:270-281](apps/api/src/auth/auth.service.ts#L270-L281)

`findById → ownership check → revoke` is 2 round-trips. `updateOne({ _id, userId, revokedAt: null }, { revokedAt, revokedReason })` with `modifiedCount` check is one.

**Fix:** Add `sessionRepo.revokeOwnedByUser(sessionId, userId, reason)`; service uses it.

### C.10 [P2] `claimGuestAccount` email pre-check is a TOCTOU race
**File:** [apps/api/src/auth/auth.service.ts:112-123](apps/api/src/auth/auth.service.ts#L112-L123)

Two concurrent claims from the same guest can both pass the pre-check, then one `save()` wins via the unique index and the other throws a duplicate-key error that currently surfaces as a 500.

**Fix:** Keep the fast-path check, but wrap `guestUser.save()` in a try/catch for `E11000` errors and re-throw as `ConflictException`.

### C.11 [P2] `AuthContext.tsx` — `setOnUnauthorized` has no cleanup
**File:** [apps/web/src/auth/AuthContext.tsx:83-87](apps/web/src/auth/AuthContext.tsx#L83-L87)

No cleanup function returned from the effect. If `<AuthProvider>` unmounts (test harness, hot reload, route swap), the registered callback stays live with a stale closure.

**Fix:** Return `() => setOnUnauthorized(null)` and have the client accept `null`.

### C.12 [P2] `findById` on session returns everything for a revocation check
**File:** [apps/api/src/auth/strategies/jwt.strategy.ts:44](apps/api/src/auth/strategies/jwt.strategy.ts#L44)

Hot path reads the full session document when only `revokedAt` and `expiresAt` are needed. BSON decode overhead × every authenticated request.

**Fix:** Add `findRevocationStatus(sessionId): { revokedAt; expiresAt } | null` with `.select('revokedAt expiresAt').lean()`.

### C.13 [P3] Mobile: device-name / os-label computed per request
**Files:** [apps/mobile/src/api/client.ts:66-70](apps/mobile/src/api/client.ts#L66-L70), `apps/mobile/src/api/device.ts`

`getDeviceName()` and `getOsLabel()` run on every request. The values never change for the life of the process.

**Fix:** Memoise once at module load.

### C.14 [P3] JWT `exp` decoded on every request (client)
**File:** [packages/api-client/src/core/api-client.ts:80-82, 196-209](packages/api-client/src/core/api-client.ts#L80-L82)

`decodeJwtExp(token)` runs base64 + `JSON.parse` per request. Not huge, but pointless — `exp` is stable once cached.

**Fix:** Cache `exp` next to the cached access token in the mobile token cache; invalidate on `setTokens`.

### C.15 [P3] Redundant standalone `userId` index on `Session`
**File:** `apps/api/src/auth/schemas/session.schema.ts`

The standalone `userId` index (from `@Prop({ index: true })`) is made redundant by the `(userId, deviceId, revokedAt)` compound, which serves any `userId`-only query via leftmost prefix.

**Fix:** Drop the standalone to save a write-path index.

### C.16 [P3 — pre-existing] Account cleanup loads all expired users
**File:** [apps/api/src/account-cleanup/account-cleanup.service.ts:71-85](apps/api/src/account-cleanup/account-cleanup.service.ts#L71-L85)

Not new to this branch. `.find({ deletionScheduledFor: { $lte: now }, anonymizedAt: null })` loads all, then iterates. At scale this could OOM.

**Fix:** `.limit(100)` per cron tick; next tick picks up the rest. (Out of scope for this PR.)

### C.17 [P3 — pre-existing] `deleteMediaFiles` sequential S3 deletes
**File:** [apps/api/src/account-cleanup/account-cleanup.service.ts:157-163](apps/api/src/account-cleanup/account-cleanup.service.ts#L157-L163)

`for` loop awaiting each S3 `deleteObject`. `Promise.allSettled` with `p-limit(10)` would dramatically speed up cleanup cycles with many files. (Out of scope for this PR.)

### C.18 [Confirmed clean] Refresh stampede
`packages/api-client/src/core/api-client.ts:211-218` — single-flight `refreshPromise` pattern is correct. Parallel 401s share one refresh, no stampede.

### C.19 [Confirmed clean] Logout-all
`sessions.repository.ts:170-184` uses `updateMany` in a single call. Correct.

### C.20 [Confirmed clean] `session.lastUsedAt` not updated on every request
Only set inside the atomic `$set` of `rotate` (`sessions.repository.ts:136`). No per-request write amplification.

### C.21 [Confirmed clean] `previousHashes` cap
`PREVIOUS_HASHES_CAP = 10` at `sessions.repository.ts:9` — named constant, array bounded.

### C.22 [Confirmed clean] `revoke` idempotency
Predicate `{ _id, revokedAt: null }` (`sessions.repository.ts:160`) makes revoke a no-op on replay.

---

## Prioritised summary

### P1 (fix before users arrive)
1. **JwtStrategy: remove or cache the per-request DB reads** (C.1) — biggest hot-path win.
2. **Add TTL index on `expiresAt`** (C.2).
3. **Add index on `previousHashes`** (C.3).
4. **Cap `listActiveByUser` results** (C.4).
5. **Wrap `AuthContext` value in `useMemo`** (B.4 / C.5).
6. **Push `Types.ObjectId` out of the session repository interface + service** (B.2) — architectural rule violation.
7. **Type `JwtStrategy.validate` return as `CurrentUserPayload`** (B.1).
8. **Collapse `RequestOptions` booleans into a `mode` union** (B.3).
9. **Resolve `AuthErrorCode.REFRESH_REPLAY` — emit or delete** (B.5).

### P2 (consistency, moderate efficiency, correctness polish)
10. Mobile: one SecureStore path (B.6, B.7, B.8, A.2, A.3).
11. Drop `StoredUserSession.isGuest` (B.9).
12. Shape `claimGuestAccount` params (B.10). Handle revoke failure (B.18). Handle E11000 race (C.10).
13. `DeviceInfoProvider.getOs` — required or collapse to single headers object (B.11).
14. Extract `createTokenProvider` helper (B.12).
15. Extract `loginWithOtp` test helper (B.13). Fix `'logout_all'` string (B.14).
16. Extract header name + storage key constants (B.15, B.16).
17. Replace `device-info.decorator.spec.ts` with a real test (B.17, A.9).
18. `Session` schema: add `xid` (A.4).
19. Mobile `createRNHttpAdapter` → use shared `createFetchAdapter` (A.1).
20. `AUTH_ERROR_CODES` local copy → use shared `AuthErrorCode` (A.10).
21. Narrow refresh-flow user read (C.6). Narrow JwtStrategy session read (C.12).
22. `authSlice` reducer equality checks (C.7).
23. Collapse TOCTOU patterns (C.8, C.9).
24. `AuthContext` cleanup for `setOnUnauthorized` (C.11).

### P3 (polish)
25. Guest id → `nanoidAlphanumeric()` (A.5).
26. Use `ms()` for TTL math in service + tests (A.6).
27. `toObjectId` / `sha256Hex` helpers (A.7, A.8).
28. Unify `AuthErrorCode` to `enum` (A.12). `testAppConfig` imports real shape (A.13).
29. Delete unnecessary comments (B.20).
30. Type mocks instead of `as any` (B.21). Consolidate fragmented describes (B.22). Trim duplicated unit tests (B.23).
31. Magic number → config (B.24). Extract `updateStoredUser` (B.25).
32. Extract OTP-flow fields from `authSlice` (B.19).
33. Memoise device-name / os-label (C.13). Cache JWT `exp` client-side (C.14).
34. Drop redundant standalone `userId` index (C.15).

### Confirmed clean / no action
- Single-flight refresh (C.18)
- `updateMany` logout-all (C.19)
- `lastUsedAt` not per-request (C.20)
- `previousHashes` capped (C.21)
- `revoke` idempotent (C.22)
- Web JSX has no unnecessary nesting (B.26)
- No new `Types.ObjectId` drift in `account-cleanup.service.ts`
- Deleted `token-refresh.interceptor.ts` has no residual imports
- Web cookie handling is not present (A.14) — flag intent vs. implementation

---

## Appendix — file index

Files most affected by findings:

- `apps/api/src/auth/auth.service.ts` — B.2, B.10, B.18, C.6, C.8, C.9, C.10
- `apps/api/src/auth/sessions.repository.ts` — A.7, B.2, C.4, C.8, C.9, C.12
- `apps/api/src/auth/sessions.repository.interface.ts` — B.2
- `apps/api/src/auth/strategies/jwt.strategy.ts` — B.1, C.1, C.12
- `apps/api/src/auth/schemas/session.schema.ts` — A.4, C.2, C.3, C.15
- `apps/api/src/auth/__tests__/auth.service.spec.ts` — A.6, B.21, B.22, B.23
- `apps/api/src/auth/__tests__/helpers/auth-test-harness.ts` — A.13, B.13
- `apps/api/src/common/decorators/device-info.decorator.ts` — A.9, B.15
- `apps/api/src/common/decorators/__tests__/device-info.decorator.spec.ts` — A.9, B.17
- `apps/api/src/account-cleanup/__tests__/account-cleanup.service.spec.ts` — B.14
- `apps/mobile/src/api/client.ts` — A.1, A.2, B.6, B.7, B.8, B.12, B.16, C.13, C.14
- `apps/mobile/src/api/device.ts` — A.3, C.13
- `apps/mobile/src/services/AppSecureStorage.ts` — A.2, A.3, B.9, B.16
- `apps/mobile/src/store/slices/authSlice.ts` — B.6, B.9, B.19, B.20, B.25, C.7
- `apps/web/src/api/client.ts` — B.12, B.15, B.16
- `apps/web/src/auth/AuthContext.tsx` — B.4, C.5, C.11
- `packages/api-client/src/core/api-client.ts` — A.10, B.3, B.15, B.20, B.24, C.14
- `packages/api-client/src/adapters/types.ts` — B.11
- `packages/shared/src/dto/auth.dto.ts` — A.12, B.5
