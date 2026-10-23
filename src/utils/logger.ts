import 'dotenv/config';
import winston from 'winston';

const isTest = process.env.NODE_ENV === 'test';

export const logger = winston.createLogger({
  level: 'info',
  silent: isTest, // keep test output clean
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    ...(isTest
      ? []
      : [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]),
  ],
});
