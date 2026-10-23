import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';

const server = app.listen(env.port, () => {
  logger.info(`Server is running on port ${env.port} (${env.nodeEnv})`);
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
});
