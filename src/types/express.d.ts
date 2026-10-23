// Tells TypeScript about the extra fields our middleware adds to req.
// (requireAuth will add `user` in Phase 3.)
export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      id?: string; // request id, set by requestId middleware
      user?: AuthUser;
    }
  }
}
