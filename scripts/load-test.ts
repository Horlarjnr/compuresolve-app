// Read-only load test for a STAGING copy of the API. Run with: npm run loadtest
//
//   PowerShell:
//   $env:BASE_URL="https://your-staging.onrender.com"
//   $env:LOGIN_EMAIL="a-test-account@example.com"; $env:LOGIN_PASSWORD="its-password"
//   $env:VUS="50"; $env:DURATION_SECONDS="60"; $env:CONFIRM_LOAD="yes"
//   npm run loadtest
//
// It logs in ONCE, then many virtual users read the dashboard, complaint list and notifications for a while.
// It never creates or changes data. Never point it at production with real users online.
// The API's own limits (GLOBAL_RATE_LIMIT, per IP) will block a single-machine test: raise that setting on staging first.

const BASE = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
const EMAIL = process.env.LOGIN_EMAIL ?? '';
const PASSWORD = process.env.LOGIN_PASSWORD ?? '';
const VUS = Math.min(Number(process.env.VUS ?? 20), 200);
const DURATION_MS = Math.min(Number(process.env.DURATION_SECONDS ?? 30), 600) * 1000;

if (process.env.CONFIRM_LOAD !== 'yes' || !BASE || !EMAIL || !PASSWORD) {
  console.error('Set BASE_URL, LOGIN_EMAIL, LOGIN_PASSWORD and CONFIRM_LOAD=yes (see the comment at the top of this file).');
  process.exit(1);
}

type Stat = { count: number; errors: number; limited: number; clientErrors: number; times: number[] };
const stats = new Map<string, Stat>();
const stat = (name: string) => {
  if (!stats.has(name)) stats.set(name, { count: 0, errors: 0, limited: 0, clientErrors: 0, times: [] });
  return stats.get(name)!;
};
const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

const login = async () => {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed with status ${res.status}`);
  const sid = res.headers.getSetCookie().find((c) => c.startsWith('sid='));
  if (!sid) throw new Error('Login worked but no session cookie came back');
  return sid.split(';')[0];
};

// What a typical signed-in person does, weighted by how often.
const SCENARIO: { name: string; path: string; weight: number; auth: boolean }[] = [
  { name: 'dashboard', path: '/api/v1/dashboard/summary', weight: 4, auth: true },
  { name: 'complaints list', path: '/api/v1/complaints?limit=20', weight: 4, auth: true },
  { name: 'notifications', path: '/api/v1/notifications?limit=20', weight: 3, auth: true },
  { name: 'me', path: '/api/v1/auth/me', weight: 2, auth: true },
  { name: 'departments (public)', path: '/api/v1/departments', weight: 1, auth: false },
];
const pool = SCENARIO.flatMap((s) => Array(s.weight).fill(s));

const virtualUser = async (cookie: string, deadline: number) => {
  while (Date.now() < deadline) {
    const step = pool[Math.floor(Math.random() * pool.length)];
    const s = stat(step.name);
    const started = performance.now();
    try {
      const res = await fetch(`${BASE}${step.path}`, { headers: step.auth ? { Cookie: cookie } : {} });
      await res.arrayBuffer();
      s.times.push(performance.now() - started);
      s.count += 1;
      if (res.status === 429) s.limited += 1;
      else if (res.status >= 500) s.errors += 1;
      else if (res.status >= 400) s.clientErrors += 1;
    } catch {
      s.count += 1;
      s.errors += 1;
    }
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 400)); // people pause between clicks
  }
};

const main = async () => {
  console.log(`Logging in as the test account on ${BASE} ...`);
  const cookie = await login();
  console.log(`Running ${VUS} virtual users for ${DURATION_MS / 1000}s ...`);
  const deadline = Date.now() + DURATION_MS;
  await Promise.all(Array.from({ length: VUS }, () => virtualUser(cookie, deadline)));

  console.log('\nendpoint'.padEnd(26) + 'requests'.padStart(9) + 'p50 ms'.padStart(9) + 'p95 ms'.padStart(9) + 'p99 ms'.padStart(9) + '5xx/net'.padStart(9) + '429'.padStart(7) + '4xx'.padStart(6));
  let total = 0;
  let bad = 0;
  let limited = 0;
  for (const [name, s] of stats) {
    const sorted = [...s.times].sort((a, b) => a - b);
    total += s.count;
    bad += s.errors;
    limited += s.limited;
    console.log(
      name.padEnd(25) + String(s.count).padStart(9) + percentile(sorted, 50).toFixed(0).padStart(9) +
        percentile(sorted, 95).toFixed(0).padStart(9) + percentile(sorted, 99).toFixed(0).padStart(9) +
        String(s.errors).padStart(9) + String(s.limited).padStart(7) + String(s.clientErrors).padStart(6),
    );
  }
  console.log(`\nTotal ${total} requests, ${(total / (DURATION_MS / 1000)).toFixed(1)} per second, ${bad} server/network errors, ${limited} rate-limited.`);
  if (limited > 0) console.log('Some requests were rate-limited (429): raise GLOBAL_RATE_LIMIT on staging for a fair test.');
  if (total === 0 || bad / total > 0.01) {
    console.log('FAIL: more than 1% of requests failed.');
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
