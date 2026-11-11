# CompuResolve backend: acceptance map

Your specification (section 16) lists the acceptance criteria below and says authorization tests are a **release
blocker**. This table shows which automated tests prove each one.

Run everything before every release:

```
npm run typecheck
npm test            # unit tests, no database
npm run test:db     # integration tests against the Neon TEST branch (wake the branch first: select 1;)
```

| Criterion (from the spec) | Proven by |
|---|---|
| **Authentication.** Unauthenticated users cannot access protected endpoints; logout invalidates the session. | `tests/route-inventory.test.ts` (every protected route answers 401 when signed out; a new route cannot be added unprotected), `tests/auth.middleware.test.ts`, `tests/integration/auth.test.ts` (logout deletes the session and the cookie stops working; expired and deactivated sessions refused) |
| **Complaint creation.** A valid student request creates a complaint, unique reference, initial history and the correct department. | `tests/integration/complaints-submit.test.ts` (reference format, uniqueness, first history row, department taken from the student's own membership), `tests/reference.test.ts` |
| **Input validation.** Missing or invalid fields are rejected with useful, safe errors. | Strict schemas on every route; `tests/errors.test.ts`; "rejects client-supplied ..." cases in `complaints-submit.test.ts`; `invitations.test.ts`, `categories.test.ts`, `auth.test.ts`, `password-flows.test.ts`, `messages.test.ts`, `reopen.test.ts`; error bodies scanned in `tests/integration/privacy-leaks.test.ts` |
| **Student ownership.** Student A cannot read or modify Student B's complaint. | `complaints-submit.test.ts` ("everyone else gets the same 404"), `tenant-isolation.test.ts`, `messages.test.ts` (classmate gets 404 on read and write), `reopen.test.ts` (only the submitter can ask) |
| **Tenant isolation.** Officer/HOD from Department B cannot access Department A's complaint. | `tests/integration/tenant-isolation.test.ts` (two departments, database level, policy and query always agree), plus HTTP-level isolation in `complaints-submit`, `complaints-workflow`, `messages`, `reopen`, `departments-members` (ID-mixing attempts) and `dashboard` |
| **Role enforcement.** A student cannot assign officers, alter privileged roles, or use faculty admin routes. | `complaints-workflow.test.ts` (students refused on assignment and status), `invitations.test.ts` (students and officers cannot invite; clients cannot choose a role at registration), `departments-members.test.ts`, `categories.test.ts`, `tests/policy.test.ts`, `tests/workflow.test.ts` |
| **Assignment.** Only an eligible, active officer in the correct scope can be assigned. | `complaints-workflow.test.ts` ("the assignee must be an active Officer of the same department", suspended Officer refused, escalated and closed complaints not assignable) |
| **Workflow.** Invalid transitions are rejected; valid transitions record actor, timestamp and reason. | `tests/workflow.test.ts` (full permission matrix), `complaints-workflow.test.ts` (lifecycle with exact history sequence, reasons required, INVALID vs FORBIDDEN answers) |
| **Transaction integrity.** A failed workflow operation never leaves a status change without its history. | `complaints-workflow.test.ts` (forced failure rolls back status and history), `notifications.test.ts` and `messages.test.ts` (rollback includes notifications and messages), `reopen.test.ts` (approval fails cleanly if the complaint changed), concurrency tests (two simultaneous changes: exactly one succeeds) |
| **Dashboard.** Counts and lists include only records the current user may see. | `tests/integration/dashboard.test.ts` (exact counts per role across two departments, Faculty Admin limited to faculty-level and escalated cases) |
| **Privacy.** Responses and logs do not leak password hashes, secrets or unrelated complaint details. | `tests/integration/privacy-leaks.test.ts` (every readable endpoint, as every role, scanned for hashes, tokens and internals; students never see staff names, internal notes or other students), `tests/error-logging.test.ts` (database error messages never reach the logs), `tests/errors.test.ts` (500s show no internals) |

## Extra security checks added in Phase 8
| Control | Proven by |
|---|---|
| CSRF: state-changing requests from another site are refused | `tests/security-headers.test.ts` |
| API responses are never cacheable; standard security headers present | `tests/security-headers.test.ts` |
| Cookie policy, proxy count and rate limits are validated at startup | `tests/env.test.ts` |
| Expired sessions and old tokens are cleaned up without touching real data | `tests/integration/cleanup.test.ts` |

## Not covered by automated tests (checked by hand at deployment)
HTTPS and the real cookie behaviour between Vercel and Render, Gmail delivery to a real inbox, Neon backup restore,
and the database role permissions. See the deployment runbook.
