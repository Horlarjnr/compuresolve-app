import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOptions } from './config/cors.config';
import { env } from './config/env';
import { csrfOriginCheck } from './middlewares/csrf.middleware';
import { errorHandler, notFound } from './middlewares/error.middleware';
import { globalLimiter } from './middlewares/rate-limit.middleware';
import { requestId } from './middlewares/request-id.middleware';
import authRoutes from './routes/auth.route';
import categoryRoutes from './routes/category.route';
import complaintRoutes from './routes/complaint.route';
import dashboardRoutes from './routes/dashboard.route';
import departmentRoutes from './routes/department.route';
import healthRoutes from './routes/health.route';
import invitationRoutes from './routes/invitation.route';
import notificationRoutes from './routes/notification.route';
import reopenRoutes from './routes/reopen.route';

const app = express();

app.disable('x-powered-by');
if (env.trustProxyHops > 0) app.set('trust proxy', env.trustProxyHops);

app.use(requestId);
app.use(helmet()); // security headers
app.use(cors(corsOptions));
// Private data must never be kept by browsers or proxies.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(csrfOriginCheck(env.frontendOrigins)); // cookie-session CSRF defence (see the middleware)
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser()); // fills req.cookies (used by the session guard in Phase 3)

app.use('/api/v1/health', healthRoutes); // before the global limiter: platform health checks must never be throttled
app.use('/api/v1', globalLimiter);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/invitations', invitationRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/complaints', complaintRoutes);
app.use('/api/v1/reopen-requests', reopenRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// error handling goes last
app.use(notFound);
app.use(errorHandler);

export default app;
