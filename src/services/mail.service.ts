import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export type MailMessage = { to: string; subject: string; text: string };

type MailerConfig = {
  mode: 'console' | 'smtp';
  from: string;
  smtp?: { host: string; port: number; user: string; pass: string };
};

// "console" mode prints the email to the terminal (development). "smtp" sends it through Gmail.
// Console output is NOT written to the log files, because emails contain one-time links.
export const createMailer = (config: MailerConfig) => {
  let transporter: Transporter | undefined;

  return {
    async send(message: MailMessage) {
      if (config.mode === 'console' || !config.smtp) {
        console.log(`\n[MAIL:console] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
        return;
      }
      transporter ??= nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
      });
      await transporter.sendMail({ from: config.from, ...message });
    },
  };
};

const mailer = createMailer({ mode: env.mailMode, from: env.mailFrom, smtp: env.smtp });

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
