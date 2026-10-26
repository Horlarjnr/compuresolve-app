// Tells TypeScript about the extra fields our middleware adds to req.
export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  matricNumber: string | null;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  memberships: { departmentId: string; role: string }[]; // active department roles
  facultyRoles: { role: string }[]; // active faculty roles
  studentProfile: { level: string } | null;
}

declare global {
  namespace Express {
    interface Request {
      id?: string; // request id, set by requestId middleware
      user?: AuthUser; // set by requireAuth
    }
  }
}
