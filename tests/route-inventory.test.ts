import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import app from '../src/app';

// DENY BY DEFAULT. This test reads the route files, so a new endpoint cannot be added without either
//   (a) being protected (it must answer 401 to a signed-out caller), or
//   (b) being added to PUBLIC below on purpose, which makes it visible in review.

const ROUTES_DIR = join(process.cwd(), 'src', 'routes');

const MOUNTS: Record<string, string> = {
  'auth.route.ts': '/api/v1/auth',
  'category.route.ts': '/api/v1/categories',
  'complaint.route.ts': '/api/v1/complaints',
  'dashboard.route.ts': '/api/v1/dashboard',
  'department.route.ts': '/api/v1/departments',
  'health.route.ts': '/api/v1/health',
  'invitation.route.ts': '/api/v1/invitations',
  'notification.route.ts': '/api/v1/notifications',
  'reopen.route.ts': '/api/v1/reopen-requests',
};

// The ONLY routes a signed-out person may use.
const PUBLIC = new Set([
  'GET /api/v1/health',
  'GET /api/v1/departments',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/auth/resend-verification',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  'POST /api/v1/invitations/accept',
]);

const UUID = '00000000-0000-4000-8000-000000000000';

type RouteEntry = { method: string; template: string; url: string };

const collectRoutes = (): RouteEntry[] => {
  const entries: RouteEntry[] = [];
  for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.route.ts'))) {
    const source = readFileSync(join(ROUTES_DIR, file), 'utf8');
    const prefix = MOUNTS[file];
    for (const m of source.matchAll(/router\.(get|post|patch|put|delete)\(\s*'([^']*)'/g)) {
      const path = m[2] === '/' ? '' : m[2];
      const template = `${prefix}${path}`;
      entries.push({ method: m[1].toUpperCase(), template, url: template.replace(/:\w+/g, UUID) });
    }
  }
  return entries;
};

const routes = collectRoutes();
const key = (r: RouteEntry) => `${r.method} ${r.template}`;

describe('route inventory', () => {
  test('every route file is registered in this test and mounted in app.ts', () => {
    const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.route.ts')).sort();
    expect(files).toEqual(Object.keys(MOUNTS).sort());

    const appSource = readFileSync(join(process.cwd(), 'src', 'app.ts'), 'utf8');
    for (const prefix of Object.values(MOUNTS)) {
      expect(appSource, `app.ts must mount ${prefix}`).toContain(`'${prefix}'`);
    }
  });

  test('the public list matches reality exactly (no typos, nothing public by accident)', () => {
    const found = new Set(routes.map(key));
    for (const entry of PUBLIC) expect(found.has(entry), `PUBLIC lists a route that does not exist: ${entry}`).toBe(true);
  });

  test('the scan found every route (40 at the time of writing; it can only grow)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(40);
  });

  test.each(routes.filter((r) => !PUBLIC.has(key(r))).map((r) => [key(r), r] as const))(
    'protected: %s answers 401 to a signed-out caller',
    async (_label, route) => {
      const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
      const res = method === 'get' ? await request(app).get(route.url) : await request(app)[method](route.url).send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    },
  );
});
