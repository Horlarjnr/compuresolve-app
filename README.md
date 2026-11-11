# CompuResolve backend

REST API for a multi-tenant complaint resolution system for a Faculty of Computing (departments are the tenants).
Roles: Student, Department Officer, Head of Department (HOD), Faculty Admin.

Stack: Node 22, Express 5, TypeScript, Prisma 7 + PostgreSQL (Neon), zod, vitest + supertest.

## Quick start (development)
```
npm install
cp .env.example .env            # then fill in DATABASE_URL and DIRECT_URL (Neon dev branch)
npx prisma migrate dev          # creates the tables
npx prisma generate
npx prisma db seed              # departments, default categories, first Faculty Admin (see SEED_ in .env.example)
npm run dev                     # http://localhost:8080/api/v1/health
```
With `MAIL_MODE=console` verification and invitation links are printed in the terminal instead of emailed.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm start` | Start (what production runs) |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (no database needed) |
| `npm run test:db` | Integration tests against the Neon **test** branch (needs `.env.test`; wake the branch first with `select 1;`) |
| `npm run db:cleanup` | Delete expired sessions and old one-time tokens (run daily) |
| `npm run loadtest` | Read-only load test for a staging copy (see `docs/DEPLOYMENT.md`) |

## Configuration
All settings are environment variables, validated at startup (the server refuses to start with a clear message that never
prints a value). See `.env.example` for every setting with comments. Never commit `.env` or `.env.test`.

## How the code is organised
```
src/
  app.ts, server.ts      app wiring (middleware order) and startup
  config/                validated environment, CORS
  routes/ controllers/ services/   one trio per feature; controllers are thin, rules live in services and policies
  policies/              THE authorization rules (who sees what, who may do what, the complaint state machine)
  validators/            zod schemas, always strict (unknown fields are rejected)
  middlewares/           auth, validation, rate limits, CSRF origin check, error handling, request ids
  utils/                 passwords, tokens, references, roles, logger, database client
prisma/                  schema, migrations, seed
tests/                   unit tests; tests/integration for the database tests
docs/                    API.md, DEPLOYMENT.md, ACCEPTANCE.md, PRIVACY_OPEN_ITEMS.md
```

## Rules the code is built around
- Authorization is enforced in the API (never just hidden in the interface). Deny by default.
- A record you may not see answers 404, like one that does not exist.
- Anything that changes several records (status, history, notifications, audit) happens in one transaction.
- Passwords and one-time tokens are stored hashed. Responses and logs never contain secrets or complaint text.
- Migrations only. Never reset or edit production data by hand.

## Documentation
- `docs/API.md`: every endpoint, who may call it, bodies and error codes
- `docs/DEPLOYMENT.md`: Vercel + Render + Neon + Gmail runbook, smoke tests, backups, load test
- `docs/ACCEPTANCE.md`: each acceptance criterion of the specification and the tests that prove it
- `docs/PRIVACY_OPEN_ITEMS.md`: what personal data is held and the decisions still needed from the faculty
