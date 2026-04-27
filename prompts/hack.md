Scan the entire codebase for **Authentication (AuthN)** and **Authorization (AuthZ)** vulnerabilities.

Focus only on **dangerous, high-priority security issues** that could lead to account takeover, privilege escalation, unauthorized access, or cross-user data exposure.

Do **not** report low-risk findings, style issues, theoretical concerns, or generic best-practice recommendations unless they create a clear, exploitable security risk.

## Scope

Review all code related to:

- Login, signup, logout, password reset, magic links, OAuth, SSO, MFA, and session handling.
- Access token, refresh token, JWT, cookie, and API key generation, storage, validation, and revocation.
- Role-based access control, permission checks, organization/team membership checks, tenant isolation, and admin-only access.
- User, account, organization, workspace, project, billing, file, message, and resource ownership validation.
- Backend APIs, frontend authorization assumptions, middleware, guards, decorators, route handlers, database queries, background jobs, webhooks, and internal admin tools.

## Look specifically for issues such as:

- Users being able to spoof another user’s identity.
- Access tokens, refresh tokens, sessions, cookies, or API keys being usable by the wrong user.
- Missing or bypassable authorization checks.
- Insecure direct object references, where one user can access another user’s resources by changing an ID.
- Cross-tenant or cross-organization data leakage.
- Privilege escalation from normal user to admin, owner, staff, or another privileged role.
- Trusting client-side role, user ID, organization ID, or permission values.
- JWT or session validation flaws, such as accepting unsigned, expired, incorrectly scoped, or incorrectly issued tokens.
- Password reset, email verification, invitation, or magic-link flows that allow account takeover.
- OAuth or SSO flows that allow account linking, callback, state, redirect URI, or email-claim abuse.
- Webhooks, background jobs, or internal APIs that bypass normal authorization controls.

## Output format

For each confirmed dangerous issue, provide:

1. **Issue title**
2. **Severity**
   - Use only `High` or `Critical`.

3. **Affected files and functions**
4. **Attack scenario**
   - Explain how an attacker could exploit the issue.

5. **Proof from code**
   - Quote or reference the exact code path, condition, missing check, or trust boundary failure.

6. **Why this is exploitable**
   - Explain the security impact clearly.

7. **Recommended fix**
   - Provide a concrete code-level or architecture-level remediation.

8. **Regression test**
   - Suggest a test that would prove the issue is fixed.

## Reasoning requirements

Show your reasoning clearly, but keep it evidence-based.

For every finding:

- Tie the conclusion directly to specific code.
- Explain the trust boundary being crossed.
- Explain which user-controlled input, token, session, ID, role, or permission is being trusted incorrectly.
- Avoid speculation. If something cannot be proven from the code, label it as **Needs verification** rather than reporting it as a confirmed issue.

## Final summary

At the end, include:

- A table of confirmed `High` and `Critical` findings.
- A list of areas reviewed where no dangerous issue was found.
- Any areas that could not be fully verified and why.
- The top 3 fixes to prioritize first.

Only report dangerous AuthN/AuthZ vulnerabilities with clear proof from the codebase.
