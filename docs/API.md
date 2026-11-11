# CompuResolve API reference

Base path: `/api/v1`. Requests and responses are JSON. Sessions use an HttpOnly cookie named `sid`, set at login.
In the browser call relative URLs (`/api/v1/...`); with Thunder Client the cookie is kept automatically.

## Conventions
- **Success:** `{ "success": true, "message"?: "...", "data": ..., "meta"?: { "page", "limit", "total" } }`
- **Error:** `{ "success": false, "message": "...", "code": "SOME_CODE", "details"?: [...], "requestId": "..." }`
  `details` is a list of `{ field, message }` for validation errors (`VALIDATION_ERROR`, 400).
- **Strict input:** unknown fields are rejected with 400. The client never sends roles, the submitter, status, priority,
  assignee, scope or reference; the server decides them.
- **Not found vs forbidden:** records you may not see answer `404`, exactly like records that do not exist.
- **Lists** are paged: `?page=1&limit=20` (limit 1 to 100). Dates are ISO 8601 (UTC).
- **Status codes:** 200/201/204 success; 400 validation or invalid state input; 401 not signed in; 403 not allowed;
  404 not found; 409 conflict (duplicate, already decided, state changed); 413 body too large; 429 too many requests.
- **Browsers:** state-changing requests must come from the frontend origin (otherwise `403 CSRF_ORIGIN`).
- **Roles:** `STUDENT`, `OFFICER` (department officer), `HOD`, `FACULTY_ADMIN`.

## Complaint statuses
`SUBMITTED`, `UNDER_REVIEW`, `AWAITING_STUDENT`, `IN_PROGRESS`, `ESCALATED`, `RESOLVED`, `CLOSED`, `REJECTED`.
Allowed moves (who may make them is in `src/policies/complaint-workflow.ts`; the complaint detail shows `allowedTransitions` to staff):
- SUBMITTED to UNDER_REVIEW, REJECTED (HOD), ESCALATED (HOD)
- UNDER_REVIEW / IN_PROGRESS / AWAITING_STUDENT move among each other, to RESOLVED, or ESCALATED (HOD)
- ESCALATED to UNDER_REVIEW, IN_PROGRESS, RESOLVED (Faculty Admin)
- RESOLVED to CLOSED. CLOSED and REJECTED are final (only an approved reopen request returns a complaint to UNDER_REVIEW).
- A reason is required for REJECTED, ESCALATED, RESOLVED and AWAITING_STUDENT (it is shown to the student).

---

## Health
| Method and path | Who | Notes |
|---|---|---|
| `GET /health` | public | `{ status: "ok", timestamp }` |

## Authentication
| Method and path | Who | Body / notes |
|---|---|---|
| `POST /auth/register` | public | `{ fullName, email, password, matricNumber (ABC/1234/567), departmentId, level (100-500) }`. Creates an unverified student and emails a link. 201 `{ id, fullName, email }`. 409 if the email or matric number exists. |
| `POST /auth/verify-email` | public | `{ token }` from the emailed link. One use, valid 24 hours. |
| `POST /auth/resend-verification` | public | `{ email }`. Always the same reply; at most one email a minute. |
| `POST /auth/login` | public | `{ email, password }`. Sets the `sid` cookie (7 days). 403 `EMAIL_NOT_VERIFIED` until verified. Returns the user with `roles`. |
| `POST /auth/logout` | any | 204. Deletes the session. |
| `GET /auth/me` | signed in | The user, `roles`, department memberships, level. |
| `POST /auth/forgot-password` | public | `{ email }`. Always the same reply. Link valid 1 hour. |
| `POST /auth/reset-password` | public | `{ token, newPassword }`. Signs the user out everywhere. |
| `POST /auth/change-password` | signed in | `{ currentPassword, newPassword }`. Keeps this device, signs out the others. |

Password rule: 10 to 72 characters with upper case, lower case, a number and a symbol, or a passphrase of 3+ words and 16+ characters.

## Departments and staff
| Method and path | Who | Body / notes |
|---|---|---|
| `GET /departments` | public | Active departments `{ id, name, code }` for the registration form. |
| `GET /departments/all` | Faculty Admin | All departments with `isActive`. |
| `POST /departments` | Faculty Admin | `{ name, code (2-10 letters or digits) }` |
| `POST /departments/:departmentId/deactivate` / `reactivate` | Faculty Admin | |
| `GET /departments/:departmentId/members` | Faculty Admin; HOD of that department | Staff only (Officers and HODs). Paged. |
| `POST /departments/:departmentId/members/:membershipId/suspend` / `reactivate` | Faculty Admin (any staff); HOD (Officers of own department) | Takes effect on the member's next request. Only one active HOD per department. |

## Staff invitations
| Method and path | Who | Body / notes |
|---|---|---|
| `POST /invitations` | Faculty Admin (Officer, HOD, Faculty Admin); HOD (Officers of own department) | `{ email, role: OFFICER or HOD or FACULTY_ADMIN, departmentId? }`. Faculty Admin invitations have no department. Valid 7 days. |
| `GET /invitations` | Faculty Admin (all); HOD (own department's Officer invitations) | Never shows the token. |
| `DELETE /invitations/:id` | same scope | Revokes a pending invitation. 204. |
| `POST /invitations/accept` | public (token holder) | New staff: `{ token, fullName, password }`. Existing account: `{ token, password }` (its current password). |

## Categories
| Method and path | Who | Body / notes |
|---|---|---|
| `GET /categories` | signed in | `?departmentId=&scope=DEPARTMENT\|FACULTY&includeInactive=true` (managers only). Your department's plus faculty-level categories. |
| `POST /categories` | Faculty Admin; HOD (own department) | `{ name, scope, departmentId? }` |
| `POST /categories/:categoryId/deactivate` / `reactivate` | same scope | Categories are never deleted. |

## Complaints
| Method and path | Who | Body / notes |
|---|---|---|
| `POST /complaints` | Student | `{ target?: DEPARTMENT\|FACULTY, departmentId?, categoryId, title (5-150), description (20-5000) }`. Own department only. Returns the reference (for example `CR-SWE-2026-K7M4PX`). |
| `GET /complaints` | signed in | `?status=&departmentId=&categoryId=&assigned=me\|none&q=&page=&limit=`. Only complaints you may see. |
| `GET /complaints/:complaintId` | who may see it | Staff see submitter, assignee, actors and `allowedTransitions`; the student sees their own complaint without staff names. Includes `statusHistory` and `reopenRequests`. |
| `POST /complaints/:complaintId/assignments` | HOD (any active Officer of the department); Officer (claim for themselves) | `{ officerId }` |
| `DELETE /complaints/:complaintId/assignments/current` | HOD | |
| `POST /complaints/:complaintId/status-transitions` | Officer (assigned), HOD, Faculty Admin (faculty-level and escalated) | `{ toStatus, reason? }` |
| `POST /complaints/:complaintId/reopen-requests` | Student (the submitter) | `{ reason }`. Only on RESOLVED, CLOSED or REJECTED; one pending request at a time. |
| `GET /complaints/:complaintId/messages` | who may see it | Oldest first, paged. Students never see internal messages. |
| `POST /complaints/:complaintId/messages` | Student (while open), assigned Officer, HOD, Faculty Admin | `{ body (1-2000), visibility?: STUDENT_AND_STAFF\|STAFF_ONLY }`. Staff only may use STAFF_ONLY. No edit or delete. |

## Reopen requests
| Method and path | Who | Body / notes |
|---|---|---|
| `GET /reopen-requests` | signed in | `?status=PENDING\|APPROVED\|REJECTED`. Staff see requests on complaints they may see, with `canDecide`; students their own. |
| `POST /reopen-requests/:requestId/decision` | HOD, assigned Officer, Faculty Admin (faculty-level and escalated) | `{ decision: APPROVE\|REJECT, note? }` (a note is required to reject). Approval returns the complaint to UNDER_REVIEW. |

## Notifications (in-app)
| Method and path | Who | Notes |
|---|---|---|
| `GET /notifications` | signed in | `?unread=true&page=&limit=`. Your own only. `meta.unread` is the unread count. Each item has `complaintId`. |
| `PATCH /notifications/:notificationId/read` | signed in | Marks one of yours as read (safe to repeat). |

## Dashboard
| Method and path | Who | Notes |
|---|---|---|
| `GET /dashboard/summary` | signed in | One section per role you hold: `student`, `officer`, `hod`, `facultyAdmin`, plus `roles` and `unreadNotifications`. Counts come from the database and include only what you may see. |

## Error codes you may meet
`VALIDATION_ERROR`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `UNAUTHORIZED` (401), `EMAIL_NOT_VERIFIED`, `ACCOUNT_DISABLED`,
`INVALID_CREDENTIALS`, `INVALID_TOKEN`, `FORBIDDEN`, `FORBIDDEN_TRANSITION`, `FORBIDDEN_DEPARTMENT`, `FORBIDDEN_VISIBILITY`,
`NOT_ASSIGNED`, `NOT_FOUND`, `CONFLICT`, `NO_CHANGE`, `STATE_CHANGED`, `INVALID_TRANSITION`, `NOT_REOPENABLE`,
`REOPEN_PENDING`, `REQUEST_DECIDED`, `MESSAGING_CLOSED`, `NOT_ASSIGNABLE`, `ALREADY_ASSIGNED`, `INVALID_ASSIGNEE`,
`INVALID_DEPARTMENT`, `INVALID_CATEGORY`, `HOD_EXISTS`, `STUDENT_ACCOUNT`, `ALREADY_HAS_ROLE`, `DUPLICATE_INVITATION`,
`CSRF_ORIGIN`, `RATE_LIMITED` (429), `MAIL_FAILED`, `INTERNAL_ERROR` (500, never contains details).
