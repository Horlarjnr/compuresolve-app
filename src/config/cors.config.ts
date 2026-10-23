import type { CorsOptions } from 'cors';
import { env } from './env';

const allowed = new Set(env.frontendOrigins);

// CORS only controls what browsers may read. It is NOT authorization.
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // No Origin header = curl / Thunder Client / server-to-server, not a browser cross-origin call.
    if (!origin) return callback(null, false);
    callback(null, allowed.has(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // lets the browser send the session cookie
  maxAge: 600,
};
