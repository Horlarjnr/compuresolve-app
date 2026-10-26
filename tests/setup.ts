// Runs before every test file so tests never depend on a developer's local .env.
// (dotenv does not override variables that are already set.)
process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGINS = 'http://localhost:3000';
process.env.PORT = '8080';
process.env.MAIL_MODE = 'console';
process.env.TRUST_PROXY = '0';
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.MAIL_FROM;
