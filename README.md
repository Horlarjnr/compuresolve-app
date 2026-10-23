# CompuResolve backend: Phase 1 (Express foundation, TypeScript)

Same style as hello-api: `routes -> controllers -> services`, `middlewares`, `common/errors`, `config`, `utils`, `types`.

## Run
    cp .env.example .env
    npm install
    npm run dev
    curl -i http://localhost:8080/api/v1/health

## Check
    npm test
    npm run typecheck

## Layout
    src/
      app.ts                      express app (middleware order, routes)
      server.ts                   starts the server, graceful shutdown
      config/                     env.ts (validated env), cors.config.ts
      common/errors/app-error.ts  createError(status, message, code?, details?)
      middlewares/                request-id, error (notFound + errorHandler), validate (zod)
      routes/ controllers/ services/   one trio per feature (health for now)
      utils/logger.ts             winston (files only outside tests)
      types/express.d.ts          extra fields on req
    tests/                        vitest + supertest

Phase 1 has no auth and no database. Prisma/Neon arrive in Phase 2.
