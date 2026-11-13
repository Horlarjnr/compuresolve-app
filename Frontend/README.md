# CompuResolve frontend

Next.js (App Router) + TypeScript + Tailwind 3. No UI or data libraries. Talks to the existing CompuResolve backend and changes nothing in it.

> **Status: written without being compiled or run.** Syntax and internal imports were checked, but it has not been through `next build`, a type-check against real React types, or a browser. Expect a few small fixes on first run. `next.config.mjs` sets `typescript.ignoreBuildErrors` so `dev` and `build` don't stop on type nits; run `npm run typecheck`, fix what it reports, then delete that setting.

## Run it

```bash
npm install
cp .env.example .env.local     # API_ORIGIN=http://localhost:8080 (where the backend listens)
npm run dev                    # http://localhost:3000
```

Backend side (no code change): `FRONTEND_ORIGINS` must include `http://localhost:3000` (the backend already defaults to it in development). Verification, invitation and reset emails link to `/verify-email`, `/accept-invitation` and `/reset-password`, which exist here.

## How it talks to the API

The browser only calls this app. `next.config.mjs` rewrites `/api/*` to `API_ORIGIN`, so the HttpOnly `sid` cookie is first-party and the backend's CSRF origin check sees `http://localhost:3000`. No token is read or stored in JavaScript. A 401 from any call (other than login and `/auth/me`) sends the user to `/login?expired=1`.

In production on Vercel + Render, set `API_ORIGIN` to the Render URL and add the Vercel origin to the backend's `FRONTEND_ORIGINS`, as in the backend's `docs/DEPLOYMENT.md`.

## Structure

```
app/(public)         landing, about
app/(auth)           login, register, verify-email, forgot/reset-password, accept-invitation
app/(app)/<role>/…   student | officer | hod | admin  (thin route files)
components/ui        design system: Icon, Logo, Button, fields, Card, StatCard, StatusBadge,
                     Modal, ConfirmDialog, Toast, Skeleton, Tabs, Pagination, EmptyState/ErrorState, Donut
components/layout    AppShell (sidebar, top bar, notification panel, student bottom nav), AuthLayout
components/complaints  ComplaintList (table + mobile cards), ComplaintDetail, Chat, Timeline, SubmitComplaint
components/screens   Dashboard, Notifications, Profile, Reopen, Staff, Invitations, Categories, Departments
lib/roles.ts         role slugs and the central navigation config
lib/status.ts        the 8 statuses and badge colours (no "overdue", no SLA)
lib/api.ts           fetch wrapper, error type
```

A user's roles come from `/auth/me`. The URL prefix picks which role's interface is shown; if the user doesn't hold that role they see the same "not found" page used for missing complaints. This is only a convenience: the backend decides every permission. Users with several roles get a "Switch role" item in the profile menu.

## Backend gaps (documented, not faked)

| Brief / mockup | What the backend offers | What the UI does |
|---|---|---|
| Edit profile, phone, avatar photo | No update-profile endpoint; no phone or photo fields | Read-only profile with initials avatar; **change password** works |
| Profile "Activity" | No endpoint | Omitted |
| "Mark all as read" | Only per-notification `PATCH` | Button marks the unread items on the current page one by one |
| "New announcement" / "System update" notifications | Not a notification type | Not shown |
| Officer "Escalate to HOD" | Only HOD can escalate; no such endpoint | Not shown. HOD sees "Escalate to faculty" |
| Staff and students list for faculty | Only staff per department (`/departments/:id/members`) | Staff screen with a department selector; no student list |
| Reports and analytics | Only `/dashboard/summary` counts | Dashboards use those counts (status donuts, workload, oldest-open age) |
| Escalated-cases filter | No `escalated` query parameter | Fetches up to 100 complaints and filters `escalatedToFaculty` client-side |
| "Remember me" | Fixed 7-day session | Omitted |
| Pending tab ("Pending (4)") in officer mockup | Not a status | Real status filter |
| HOD name per department | No endpoint | Read from each department's staff list |

## Not covered

- Mobile layouts use the same components responsively (student bottom nav, complaint cards below `md`, drawer navigation for staff). They have not been checked on a device.
- No automated tests.
