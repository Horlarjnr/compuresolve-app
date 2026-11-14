import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export type MailMessage = { to: string; subject: string; text: string };

type MailerConfig = {
  mode: 'console' | 'smtp' | 'resend' | 'brevo';
  from: string;
  smtp?: { host: string; port: number; user: string; pass: string };
  resendApiKey?: string;
  brevoApiKey?: string;
};

// MAIL_FROM looks like: CompuResolve <no-reply@example.com>  (or just an address).
const parseFrom = (from: string) => {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return match ? { name: match[1].trim() || undefined, email: match[2].trim() } : { email: from.trim() };
};

// "console" mode prints the email to the terminal (development). "brevo" and "resend" send it through their HTTPS APIs.
// "smtp" sends it through Gmail. Console output is NOT written to the log files, because emails contain one-time links.
export const createMailer = (config: MailerConfig) => {
  let transporter: Transporter | undefined;

  return {
    async send(message: MailMessage) {
      if (config.mode === 'brevo' && config.brevoApiKey) {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': config.brevoApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            sender: parseFrom(config.from),
            to: [{ email: message.to }],
            subject: message.subject,
            textContent: message.text,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
          throw new Error(`Brevo rejected the email (HTTP ${response.status} ${body.code ?? ''}): ${body.message ?? 'no details'}`);
        }
        return;
      }
      if (config.mode === 'resend' && config.resendApiKey) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { message?: string; name?: string };
          throw new Error(`Resend rejected the email (HTTP ${response.status} ${body.name ?? ''}): ${body.message ?? 'no details'}`);
        }
        return;
      }
      if (config.mode === 'smtp' && config.smtp) {
        transporter ??= nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.port === 465,
          auth: { user: config.smtp.user, pass: config.smtp.pass },
        });
        await transporter.sendMail({ from: config.from, ...message });
        return;
      }
      console.log(`\n[MAIL:console] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
    },
  };
};

const mailer = createMailer({ mode: env.mailMode, from: env.mailFrom, smtp: env.smtp, resendApiKey: env.resendApiKey, brevoApiKey: env.brevoApiKey });

const baseUrl = () => env.frontendOrigins[0];

export const sendVerificationEmail = (to: string, fullName: string, token: string) =>
  mailer.send({
    to,
    subject: 'Verify your CompuResolve email',
    text:
      `Hello ${fullName},\n\n` +
      `Confirm your email address by opening this link (valid for 24 hours):\n` +
      `${baseUrl()}/verify-email?token=${token}\n\n` +
      `If you did not create a CompuResolve account, you can ignore this email.`,
  });

export const sendStaffInvitationEmail = (to: string, roleLabel: string, token: string) =>
  mailer.send({
    to,
    subject: 'You have been invited to CompuResolve',
    text:
      `You have been invited to join CompuResolve as ${roleLabel}.\n\n` +
      `Accept the invitation by opening this link (valid for 7 days):\n` +
      `${baseUrl()}/accept-invitation?token=${token}\n\n` +
      `If you were not expecting this, you can ignore this email.`,
  });

export const sendPasswordResetEmail = (to: string, fullName: string, token: string) =>
  mailer.send({
    to,
    subject: 'Reset your CompuResolve password',
    text:
      `Hello ${fullName},\n\n` +
      `We received a request to reset your password. Open this link to choose a new one (valid for 1 hour):\n` +
      `${baseUrl()}/reset-password?token=${token}\n\n` +
      `If you did not ask for this, ignore this email. Your password will not change.`,
  });

export const sendPasswordChangedEmail = (to: string, fullName: string) =>
  mailer.send({
    to,
    subject: 'Your CompuResolve password was changed',
    text:
      `Hello ${fullName},\n\n` +
      `The password on your CompuResolve account was just changed.\n\n` +
      `If this was not you, reset your password straight away using "Forgot password" on the login page.`,
  });
