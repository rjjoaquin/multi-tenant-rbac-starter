# Security review

Reviewed implementation: authentication, authorization, tenant isolation, invitation lifecycle, and browser request boundaries.

## Controls implemented

- bcrypt (cost 12) for passwords; minimum 12-character passwords; no seeded credentials.
- Signed HTTP-only session cookie (12 hours, secure in production, SameSite=Lax), strict JWT issuer/audience/algorithm.
- Server-side membership checks for every organization endpoint; missing memberships return 404.
- Tenant-scoped resource reads and deletes. Every item belongs to one organization.
- Role assignment restrictions: admins can only invite, change, or remove members; owner role cannot be assigned through API; owner cannot leave.
- Random 256-bit invitation tokens; SHA-256 hashes stored; 7-day expiration; one-time transactional acceptance; exact email match; revocation supported.
- Strict DTO validation, payload whitelisting, and request rate limits (including stricter auth and invitation endpoints).
- Same-origin checks on every state-changing request, paired with same-site cookies. Do not add an unrestricted CORS policy.
- No credentials, demo accounts, personal data, or local environment files committed.

## Threat review and follow-ups

| Area | Assessment |
| --- | --- |
| Horizontal tenant access | Scoped queries and membership checks implemented; add integration tests using two isolated organizations before production. |
| Privilege escalation | Role matrix and target-role checks implemented; add adversarial API integration tests. |
| Concurrent invitation reuse | Conditional consume in database transaction; test with PostgreSQL concurrency. |
| Login attacks | Per-IP throttling; use an edge rate limiter and monitoring at scale. |
| Session revocation | Logout clears browser cookie, but stolen JWTs remain valid until expiry. Add server-side session storage/rotation before production. |
| Account security | No email verification, MFA, password reset, or account recovery. Add these for real users. |
| Invitation links | Token appears in URL and may enter browser history. Treat as a secret; set a strict referrer policy and avoid third-party scripts on invite page. |
| Dependency CVEs | Run \`npm audit\` after installing dependencies and on CI. Network-based audit was not executed here. |

This is a starter, not a production security certification. No live deployment, database-backed penetration test, or dependency scan was performed as part of this review.
