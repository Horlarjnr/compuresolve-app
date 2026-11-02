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

// Warm up the Neon connection before the tests start. A sleeping compute or a slow network can make the
// first connection fail even though the database is fine, so retry a few times with a growing pause.
const { prisma } = await import('../../src/utils/prisma');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let connected = false;
for (let attempt = 1; attempt <= 6 && !connected; attempt += 1) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    connected = true;
  } catch {
    console.warn(`Neon connection attempt ${attempt} failed, retrying...`);
    await sleep(3000 * attempt);
  }
}
if (!connected) {
  throw new Error('Could not reach the Neon test branch after 6 attempts. Check your network and .env.test.');
}
