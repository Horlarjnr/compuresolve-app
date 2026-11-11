# CompuResolve: deployment runbook (Vercel + Render + Neon + Gmail)

```
Browser  ->  Vercel (Next.js frontend)  --rewrite /api/*-->  Render (this API)  ->  Neon (PostgreSQL)
                                                                   \-> Gmail SMTP (verification and reset emails)
```

**Why the rewrite?** Vercel and Render are different websites. If the browser talked to Render directly, the login cookie
would count as a third-party cookie, and Safari blocks those. With a Vercel rewrite the browser only ever talks to your
Vercel address, so the cookie is first-party and `COOKIE_SAME_SITE=lax` works everywhere.

Do the steps in this order. Never test deployment steps on the production database before you have a restore plan (step 2.5).

---

## 1. Before you start
- [ ] All tests are green: `npm run typecheck`, `npm test`, `npm run test:db`.
- [ ] `npm audit` reviewed (anything "high" or "critical" understood or fixed).
- [ ] The Gmail account and app password exist (see the Gmail guide you followed earlier).
- [ ] **Passwords that appeared in chat or screenshots during development are changed or replaced** (the seeded admin
      password, test invitation tokens). Production must start with fresh secrets.
- [ ] Two small edits in `package.json`:
  1. Make `tsx` a runtime dependency (Render runs the app with it): `npm install tsx` (it moves from dev to normal dependencies).
  2. Add `"engines": { "node": ">=22" }` and these scripts:
     `"db:cleanup": "tsx scripts/cleanup.ts"`, `"loadtest": "tsx scripts/load-test.ts"`.
- [ ] `.gitignore` already excludes `.env`, `.env.*` (keep it that way), `generated/` and `logs/`.

## 2. Neon (production database)
Use the Neon project's main branch as production. Keep `dev` and `test` branches as they are.

### 2.1 Region
Note your Neon region (for example `us-east-2` = Ohio). Create the Render service in the **same region** (Ohio) so the
API and database are close. This is the single biggest speed gain: your slow tests are slow because they run from Lagos.

### 2.2 Apply the migrations to production
Create `.env.production.local` in the project folder (it is git-ignored) with the **owner** role's two URLs of the main branch:
```
DATABASE_URL="...pooled url of main..."
DIRECT_URL="...direct url of main..."
```
Then, in PowerShell:
```
$env:DOTENV_CONFIG_PATH=".env.production.local"; npx prisma migrate deploy; Remove-Item Env:DOTENV_CONFIG_PATH
```
`migrate deploy` only applies the migrations you already tested. It never resets anything.

### 2.3 Create the least-privilege role for the running API
The API only needs to read and write data. It must not be able to change the schema. In the Neon **SQL Editor** (main
branch, as the owner), run this once, with your own strong password. Create the role with SQL, not through the Neon
console, because console-created roles receive broader rights (check Neon's current docs).
```sql
CREATE ROLE compuresolve_app LOGIN PASSWORD 'PUT-A-LONG-RANDOM-PASSWORD-HERE';
GRANT CONNECT ON DATABASE neondb TO compuresolve_app;
GRANT USAGE ON SCHEMA public TO compuresolve_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO compuresolve_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO compuresolve_app;
-- tables created by FUTURE migrations (replace neondb_owner with your owner role's name if it differs)
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO compuresolve_app;
```
Build the app's `DATABASE_URL` from the **pooled** connection string of main, replacing the user and password with
`compuresolve_app` and its password. The owner's credentials stay on your machine only, for migrations (`DIRECT_URL`).
After every future migration, check that the new tables are usable by the app (the default privileges above do this).

### 2.4 Seed the first data (once)
Add to `.env.production.local` (use the app role's `DATABASE_URL` or the owner's, either can insert):
```
SEED_ADMIN_NAME="Your Name"
SEED_ADMIN_EMAIL="the-real-admin-email@yourschool.edu.ng"
SEED_ADMIN_PASSWORD="a-new-12+-character-password-used-only-once"
```
Then:
```
$env:DOTENV_CONFIG_PATH=".env.production.local"; npx prisma db seed; Remove-Item Env:DOTENV_CONFIG_PATH
```
It creates the five departments, the default categories (proposals only, to be validated with your supervisor) and the
first Faculty Admin. **Delete the three `SEED_` lines afterwards** and change the admin password after first login
(`POST /auth/change-password`). Do not set `NODE_ENV=production` for this step.

### 2.5 Backups and restore (rehearse once before launch)
- Open the project in Neon and find the **Restore / Backup** page. The history window you can restore from depends on
  your Neon plan: write that number in your notes, it is your real recovery limit.
- Rehearsal: create a **branch from a past point in time** on production, open its SQL Editor and confirm the data is
  there. Delete the rehearsal branch afterwards. Do this once so you know the steps before you need them.
- Decide with your supervisor how long backups must be kept (see `docs/PRIVACY_OPEN_ITEMS.md`).

## 3. Gmail (email)
Production must use `MAIL_MODE=smtp` (the API refuses to start in production with console mail, because console mode
prints one-time links). Variables: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS` (the 16-character
app password, no spaces), `MAIL_FROM="CompuResolve <the-gmail-address>"`.
A free Gmail account sends roughly 500 emails a day: enough to start, and the first thing to replace if registration
week is busy (every student registration sends one email). Check the spam folder when testing.

## 4. Render (the API)
New > **Web Service** > connect the repository.

| Setting | Value |
|---|---|
| Region | Same as your Neon region (for example Ohio) |
| Root directory | Leave empty if `package.json` is at the repository root; otherwise the backend folder |
| Runtime | Node |
| Instance type | **Starter or above.** Free instances go to sleep when idle, so the first request after a quiet period is very slow. |
| Build command | `npm ci --include=dev && npx prisma generate` |
| Start command | `npm start` |
| Health check path | `/api/v1/health` |
| Node version | Taken from `engines` in `package.json` (22) |

Environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | The app role's **pooled** URL (step 2.3) |
| `FRONTEND_ORIGINS` | Exactly your Vercel address, no trailing slash, for example `https://compuresolve.vercel.app` |
| `TRUST_PROXY` | `2` (Vercel, then Render). Verify it with step 8. |
| `COOKIE_SAME_SITE` | `lax` |
| `MAIL_MODE` | `smtp` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | From step 3 |
| `GLOBAL_RATE_LIMIT` | Optional (default 600 requests per 15 minutes per IP) |

Do **not** add `DIRECT_URL`, owner credentials or any `SEED_` value to Render. The running API never needs them.
Render sets `PORT` itself.

## 5. Vercel (the frontend)
1. Import the frontend repository. Add the environment variable `API_ORIGIN` = your Render address, for example
   `https://compuresolve-api.onrender.com` (no trailing slash).
2. In `next.config.js` add the rewrite:
```js
/** @type {import('next').NextConfig} */
module.exports = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_ORIGIN}/api/:path*` }];
  },
};
```
3. In the frontend code always call **relative** URLs, for example `fetch('/api/v1/auth/login', { method: 'POST', ... })`.
   Never put the Render address in browser code. Cookies then work automatically.
4. Vercel preview deployments have their own addresses. A preview cannot log in unless its exact address is added to
   `FRONTEND_ORIGINS` on Render. Use previews for looks only, or add the address temporarily.
5. If the school later gets a custom domain, add it to Vercel, then update `FRONTEND_ORIGINS` to match.

## 6. First deployment, in order
1. Neon: migrations applied (2.2), app role created (2.3), seed run (2.4), restore rehearsed (2.5).
2. Render: create the service with the settings above. Wait for the health check to turn green.
3. Open `https://<render-address>/api/v1/health`: it should show `"status":"ok"`.
4. Vercel: deploy the frontend with `API_ORIGIN` set. Put the final Vercel address into `FRONTEND_ORIGINS` on Render and redeploy.
5. Run the smoke test (step 7), then the proxy check (step 8).

## 7. Smoke test after every deployment
1. `GET /api/v1/health` returns ok through the **Vercel address** (`https://<vercel-address>/api/v1/health`).
2. Register a student with your own email: the verification email arrives (check spam). Open the link, log in.
3. In the browser tools (Application > Cookies, on the Vercel address) the `sid` cookie shows **HttpOnly, Secure, SameSite=Lax**.
4. Submit a complaint. Log in as the HOD (via an invitation) and see it. Log in as another department's staff and confirm
   they cannot.
5. CSRF check, from Thunder Client: `POST /api/v1/auth/login` with the header `Origin: https://evil.example` must return 403.
6. Log out, then repeat `GET /api/v1/auth/me`: it must return 401.

## 8. Check that `TRUST_PROXY` is right (one time)
Rate limits count requests per visitor IP. If `TRUST_PROXY` is too low, everyone looks like one visitor; too high, a
client can fake its address.
1. On Render temporarily set `GLOBAL_RATE_LIMIT=20` (the lowest allowed) and redeploy.
2. From your phone on mobile data, open `https://<vercel-address>/api/v1/departments` 25 times quickly. Expect 429 after about 20.
3. Straight away, from your laptop on a different network, open the same address. **It must still work.** If it is also
   blocked, `TRUST_PROXY` is too low: try 3.
4. In Thunder Client send the request with a made-up header `X-Forwarded-For: 1.2.3.4` repeatedly after being blocked.
   **It must stay blocked.** If the fake header lets you through, `TRUST_PROXY` is too high: lower it.
5. Remove `GLOBAL_RATE_LIMIT` (or set it back) and redeploy.

## 9. Daily cleanup job
Expired sessions and old tokens pile up without it. Either:
- **GitHub Actions (free):** the file `.github/workflows/cleanup.yml` runs `npm run db:cleanup` nightly. Add one
  repository secret `PRODUCTION_DATABASE_URL` (the app role's pooled URL). Test it once with "Run workflow".
- **Render Cron Job (paid):** a cron service with start command `npm run db:cleanup`, schedule `0 3 * * *`, build command
  `npm ci --include=dev && npx prisma generate`, and only `DATABASE_URL` set (do not set `NODE_ENV=production` on this
  job; the cleanup only needs the database).

## 10. Load test (staging, before the real launch)
Use a **copy** of the system, never production with real users online.
1. Create a staging Render service (same settings) pointing at a Neon branch copy, and set `GLOBAL_RATE_LIMIT=100000` on it.
2. Create one test student account there. In PowerShell:
```
$env:BASE_URL="https://your-staging.onrender.com"; $env:LOGIN_EMAIL="test-student@example.com"
$env:LOGIN_PASSWORD="its-password"; $env:VUS="50"; $env:DURATION_SECONDS="60"; $env:CONFIRM_LOAD="yes"
npm run loadtest
```
3. Read the table: p95 and p99 are the slow end that real users feel, and "5xx/net" should be 0. Repeat with 100 and 200
   users. Agree the acceptable numbers with your supervisor (a common starting point is p95 under one second for reads).
4. The test is read-only. Password hashing (login and registration) is the heaviest work; test it by hand with a few
   real logins while the load test runs, to see how it feels under pressure.

## 11. Running it
- **Logs:** Render > the service > Logs. One JSON line per request (method, path, status, time, request id), never
  bodies, query strings, cookies or tokens. Search by request id when a user reports a problem.
- **Alerts:** turn on Render's failure notifications and check its metrics (CPU, memory) now and then. Scale up the
  instance when CPU stays high, and add a second instance only if one is not enough. With several instances the
  per-IP rate limit counters are per instance (a shared store such as Redis would be the next step).
- **Releasing a change:** tests green, push, migrations applied to production **first** (step 2.2), then deploy. Migrations
  only go forward, so a bad release is fixed by a new release; the safety net is the Neon restore.
- **Rotating secrets:** SMTP app password (revoke in Google, create a new one, update Render), database password
  (change the role password in Neon, update Render). To sign everybody out: `DELETE FROM "Session";`.
- **Suspected account takeover:** disable the user (`isActive = false`) and delete their sessions.

## 12. When something goes wrong
| Symptom | Likely cause |
|---|---|
| Login works in Thunder Client but not in the browser | Frontend calls the Render address directly (use relative `/api/...`), or `COOKIE_SAME_SITE`/`FRONTEND_ORIGINS` mismatch |
| 403 `CSRF_ORIGIN` on every POST | `FRONTEND_ORIGINS` is not exactly the browser's address (check `https`, spelling, no trailing slash, preview address) |
| Everybody gets 429 | `TRUST_PROXY` too low (step 8) or `GLOBAL_RATE_LIMIT` too small for a shared campus network |
| Server refuses to start | Read the first log lines: it names the missing or wrong variable (never its value) |
| `P1001` or timeouts to the database | Neon branch asleep or wrong URL; the pooled URL must be used by the app |
| Emails do not arrive | Wrong app password, Gmail daily limit, or the spam folder |
| First request after a quiet period is slow | Free Render instance asleep: use Starter |
