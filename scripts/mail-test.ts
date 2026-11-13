// Run with: npm run mail:test -- you@example.com
// Checks the SMTP settings from .env, then sends one real test email and prints the exact failure
// reason if something is wrong. It never prints the SMTP password.
import nodemailer from 'nodemailer';
import { env } from '../src/config/env';

const main = async () => {
  console.log(`MAIL_MODE=${env.mailMode}`);
  if (env.mailMode !== 'smtp' || !env.smtp) {
    console.log('MAIL_MODE is "console", so emails are only printed in the terminal and never sent.');
    console.log('Set MAIL_MODE=smtp in .env (and the SMTP_* values), then run this again.');
    return;
  }

  const { host, port, user, pass } = env.smtp;
  const to = process.argv[2] ?? user;
  console.log(`SMTP: ${host}:${port} (secure=${port === 465}) as ${user}; password length ${pass.length}`);
  console.log(`From: ${env.mailFrom}`);
  console.log(`To:   ${to}\n`);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });

  try {
    await transporter.verify();
    console.log('1/2 Connection and login OK');
  } catch (error) {
    report('1/2 Connection or login FAILED', error);
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: env.mailFrom,
      to,
      subject: 'CompuResolve mail test',
      text: 'If you can read this, CompuResolve can send email. Check the Spam folder if it was not in your inbox.',
    });
    console.log('2/2 Gmail accepted the message');
    console.log(`    accepted: ${JSON.stringify(info.accepted)}  rejected: ${JSON.stringify(info.rejected)}`);
    console.log(`    server reply: ${info.response}`);
  } catch (error) {
    report('2/2 Sending FAILED', error);
  }
};

const report = (title: string, error: unknown) => {
  const e = error as { message?: string; code?: string; responseCode?: number; command?: string };
  console.error(title);
  console.error(`    message:      ${e.message}`);
  console.error(`    code:         ${e.code ?? '-'}`);
  console.error(`    responseCode: ${e.responseCode ?? '-'}`);
  console.error(`    command:      ${e.command ?? '-'}`);
  process.exitCode = 1;
};

main();
