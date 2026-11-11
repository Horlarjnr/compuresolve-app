// Runs before every test file so tests never depend on a developer's local .env.
// (dotenv does not override variables that are already set.)
process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGINS = 'http://localhost:3000';
process.env.PORT = '8080';
process.env.MAIL_MODE = 'console';
process.env.TRUST_PROXY = '0';
process.env.COOKIE_SAME_SITE = 'lax';
delete process.env.COOKIE_DOMAIN;
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.MAIL_FROM;
// Unit tests never open a database connection, but importing the app needs a syntactically valid URL
// (for example on a CI machine that has no .env). A real value from .env or the shell is kept.
process.env.DATABASE_URL ||= 'postgresql://unit:unit@localhost:5432/unit';
