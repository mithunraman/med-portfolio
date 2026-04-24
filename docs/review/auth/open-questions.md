Coverage Gaps / Open Questions
Error code exposure contract — we attach {code, message} inside UnauthorizedException constructor object, but there's no centralized filter asserting the JSON response shape has code at the top level. If SentryGlobalFilter or Nest's default filter strips it, the mobile client's is401WithCode check silently fails and the reactive-refresh path breaks. → Need an integration test hitting a real endpoint and asserting the JSON response has code: 'TOKEN_EXPIRED' as a top-level field.

Concurrent rotation under load — two simultaneous refresh calls for the same active token (legitimate mobile race, not attack): both hit findActiveByRefreshHash, one rotates and the other sees a stale doc and writes stale data. The schema has no optimistic-lock version check. Worst case: both succeed, second overwrites the first's new hash, first client's new token is now invalid (looks like replay). → Either add findOneAndUpdate with the old hash as predicate (atomic CAS), or test that single-flight on the client fully prevents this. Client-side single-flight is covered (U-AC-04, I-AC-03) — server-side race is not.

Clock skew on mobile — proactive refresh decodes exp from the local clock. A device with clock drift > 60s could fire refreshes every request, or never fire them. Testable but requires mocking system time — recommend adding U-AC-01b for "device clock 2 minutes behind" scenario.

Cold-boot behavior when refresh token is present but access token is missing — the mobile initializeAuth thunk was updated to require both. Is this correct? An edge case is user upgrades the app mid-session. → Confirm the product decision: force re-login or auto-refresh from refresh-only state. Today's code forces re-login.

Logout called while offline — api.auth.logout() wrapped in try/catch already; local clear still happens. Covered by I-AC-06. But the server-side session stays active until 90-day expiry. Document this trade-off.

logout on a guest account — should it revoke the guest session (and thus effectively delete the guest's data access forever since they have no email to re-auth)? Today it does. → Is this the intended UX, or should guest logout be disallowed? Test this explicitly.

Session list pagination — listActiveByUser is unbounded. Users with hundreds of sessions (shouldn't happen, but a malicious deviceId loop could generate many) get a huge response. → Cap the query, or enforce max sessions per user (e.g. 20), or bound at 50 and sort by recency. Not currently tested.

Timing-safe hash comparison — refresh token verification uses MongoDB equality (findOne({refreshTokenHash: hash})), which is NOT constant-time. For random 256-bit hashes this is academically safe, but worth documenting that we rely on the hash being a uniform random value; OTP code comparison correctly uses timingSafeEqual.

Family revocation atomicity — if revokeFamily is called concurrently with an in-flight rotation in the same family, what's the ordering guarantee? Mongoose doesn't provide cross-doc transactions for these updates. → Test: rotate + revokeFamily in the same millisecond and verify state converges to "all revoked."

Missing tests for AccountCleanupService session revocation — I added the call but the existing service unit test only asserts revokeAllByUser is invoked with correct args. No integration test confirms that after anonymization, a session's access token is actually rejected end-to-end. → I-CR-03 covers this; ensure it's implemented.

JWT alg confusion attack — we don't explicitly verify the JWT algorithm is HS256. Default Passport-JWT config rejects alg: none, but an alg: RS256 with the symmetric secret as the "public key" has been a historic bug in some libs. → Add a unit test that mints a JWT with alg: none and verifies rejection. Probably already safe, but belt + suspenders.

Secret rotation story — there's no dual-secret verification (accept old + new during a rotation window). Today rotating JWT_ACCESS_SECRET kicks every user out. Pre-launch this is fine; document for later.

Rate-limit on /auth/refresh — set to 30/min. Is that the right number given a mobile app might legitimately fire parallel requests? With single-flight on the client it's definitely enough; without it, mobile bugs could trip it. Confirm with load testing.

Device ID collision / spoofing — a malicious client could submit a deviceId that matches another user's active session's deviceId. This doesn't grant access (different userId), but could enable session-name spoofing in the session list UI. Low severity — just flag it.

Test infrastructure gap — no existing integration test helper for "run the full auth flow with device headers." Recommend adding a testAuthHelper.loginWithDevice(userFixture, deviceId) utility that the integration tests can reuse; otherwise every test duplicates the OTP + verify ceremony.
