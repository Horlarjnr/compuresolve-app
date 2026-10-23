import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOptions } from './config/cors.config';
import { env } from './config/env';
import { errorHandler, notFound } from './middlewares/error.middleware';
import { requestId } from './middlewares/request-id.middleware';
import healthRoutes from './routes/health.route';

const app = express();

app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', 1);

app.use(requestId);
app.use(helmet()); // security headers
app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser()); // fills req.cookies (used by the session guard in Phase 3)

app.use('/api/v1/health', healthRoutes);
// Phase 3+: app.use('/api/v1/auth', authRoutes); ...

// error handling goes last
app.use(notFound);
app.use(errorHandler);

export default app;
