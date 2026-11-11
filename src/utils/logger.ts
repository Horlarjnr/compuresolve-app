import 'dotenv/config';
import winston from 'winston';

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';
// Tests are silent unless TEST_LOGS=1 is set (useful to see the real error behind a 500 during a test run).
const silenceInTests = isTest && process.env.TEST_LOGS !== '1';

// Production: one JSON object per line on standard output (hosting platforms collect it). No files.
// Development: readable lines in the terminal, plus log files for convenience.
const format = isProduction
  ? winston.format.combine(winston.format.timestamp(), winston.format.json())
  : winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`),
    );

export const logger = winston.createLogger({
  level: 'info',
  silent: silenceInTests, // keep test output clean
  format,
  transports: [
    new winston.transports.Console(),
    ...(isTest || isProduction
      ? []
      : [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]),
  ],
});
