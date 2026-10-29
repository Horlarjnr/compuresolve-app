// Loads .env.test (the Neon TEST branch) and refuses to run against the same database as .env.
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';

if (!existsSync('.env.test')) {
  throw new Error('.env.test not found. Create it with the DATABASE_URL and DIRECT_URL of your Neon TEST branch.');
}

const testVars = parse(readFileSync('.env.test'));
const devVars = existsSync('.env') ? parse(readFileSync('.env')) : {};

const dbIdentity = (url?: string) => {
  if (!url) return '';
  const u = new URL(url);
  return `${u.host}${u.pathname}`;
};

if (!testVars.DATABASE_URL) throw new Error('.env.test must contain DATABASE_URL');
if (dbIdentity(testVars.DATABASE_URL) === dbIdentity(devVars.DATABASE_URL)) {
  throw new Error('.env.test points at the same database as .env. Use the Neon TEST branch. Aborting.');
}

Object.assign(process.env, testVars, {
  NODE_ENV: 'test',
  MAIL_MODE: 'console',
  FRONTEND_ORIGINS: 'http://localhost:3000',
  PORT: '8080',
  TRUST_PROXY: '0',
});
