// Run with: npm run mail:test -- you@example.com
// Sends one real test email with the settings from .env and prints the exact failure reason if something is wrong.
// It never prints the SMTP password or the API keys.
import nodemailer from 'nodemailer';
import { env } from '../src/config/env';
import { createMailer } from '../src/services/mail.service';

const subject = 'CompuResolve mail test';
const text = 'If you can read this, CompuResolve can send email. Check the Spam folder if it was not in your inbox.';

const report = (title: string, error: unknown) => {
  const e = error as { message?: string; code?: string; responseCode?: number; command?: string };
  console.error(title);
  console.error(`    message:      ${e.message}`);
  console.error(`    code:         ${e.code ?? '-'}`);
  console.error(`    responseCode: ${e.responseCode ?? '-'}`);
  console.error(`    command:      ${e.command ?? '-'}`);
  process.exitCode = 1;
};

const testResend = async (to: string) => {
  console.log(`Resend API, from: ${env.mailFrom}`);
  console.log(`To: ${to}\n`);
  try {
    await createMailer({ mode: 'resend', from: env.mailFrom, resendApiKey: env.resendApiKey }).send({ to, subject, text });
    console.log('Resend accepted the message. Check the inbox (and Spam) of the address above.');
  } catch (error) {
    report('Sending FAILED', error);
  }
};

const testBrevo = async (to: string) => {
  console.log(`Brevo API, from: ${env.mailFrom}`);
  console.log(`To: ${to}\n`);
  try {
    await createMailer({ mode: 'brevo', from: env.mailFrom, brevoApiKey: env.brevoApiKey }).send({ to, subject, text });
    console.log('Brevo accepted the message. Check the inbox (and Spam) of the address above.');
  } catch (error) {
    report('Sending FAILED', error);
  }
};

const testSmtp = async (to: string) => {
  const { host, port, user, pass } = env.smtp!;
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
    const info = await transporter.sendMail({ from: env.mailFrom, to, subject, text });
    console.log('2/2 The server accepted the message');
    console.log(`    accepted: ${JSON.stringify(info.accepted)}  rejected: ${JSON.stringify(info.rejected)}`);
    console.log(`    server reply: ${info.response}`);
  } catch (error) {
    report('2/2 Sending FAILED', error);
  }
};

const main = async () => {
  console.log(`MAIL_MODE=${env.mailMode}`);
  const to = process.argv[2];
  if (env.mailMode === 'resend') {
    if (!to) return void console.error('Give the address to send to: npm run mail:test -- you@example.com');
    return testResend(to);
  }
  if (env.mailMode === 'brevo') {
    if (!to) return void console.error('Give the address to send to: npm run mail:test -- you@example.com');
    return testBrevo(to);
  }
  if (env.mailMode === 'smtp' && env.smtp) return testSmtp(to ?? env.smtp.user);
  console.log('MAIL_MODE is "console", so emails are only printed in the terminal and never sent.');
  console.log('Set MAIL_MODE=brevo (and BREVO_API_KEY) or MAIL_MODE=smtp in .env, then run this again.');
};

main();
