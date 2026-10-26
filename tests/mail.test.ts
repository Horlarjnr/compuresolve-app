import { afterEach, describe, expect, test, vi } from 'vitest';

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({});
  return { sendMailMock, createTransportMock: vi.fn(() => ({ sendMail: sendMailMock })) };
});
vi.mock('nodemailer', () => ({ default: { createTransport: createTransportMock } }));

import { createMailer, sendVerificationEmail } from '../src/services/mail.service';

afterEach(() => vi.clearAllMocks());

describe('mailer', () => {
  test('console mode prints the email and never opens an SMTP connection', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createMailer({ mode: 'console', from: 'x' }).send({ to: 'a@b.com', subject: 'Hi', text: 'Body' });
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][0])).toContain('a@b.com');
    expect(createTransportMock).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test('smtp mode sends through nodemailer with the configured sender', async () => {
    const mailer = createMailer({
      mode: 'smtp',
      from: 'CompuResolve <me@gmail.com>',
      smtp: { host: 'smtp.gmail.com', port: 465, user: 'me@gmail.com', pass: 'secret' },
    });
    await mailer.send({ to: 'a@b.com', subject: 'Hi', text: 'Body' });
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.gmail.com', port: 465, secure: true }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'CompuResolve <me@gmail.com>', to: 'a@b.com', subject: 'Hi' }),
    );
  });
});

describe('verification email', () => {
  test('contains a link with the token and the 24 hour notice', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendVerificationEmail('a@b.com', 'Ada', 'tok123');
    const out = String(log.mock.calls[0][0]);
    expect(out).toContain('/verify-email?token=tok123');
    expect(out).toContain('24 hours');
    log.mockRestore();
  });
});
