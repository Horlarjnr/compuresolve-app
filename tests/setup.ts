// Runs before every test file so tests never depend on a developer's local .env.
process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGINS = 'http://localhost:3000';
process.env.PORT = '8080';
