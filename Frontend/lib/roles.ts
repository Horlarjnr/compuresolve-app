// Role slugs, labels and the central navigation config. The backend stays authoritative:
// hiding a link here never grants or removes access.

export type Role = 'STUDENT' | 'OFFICER' | 'HOD' | 'FACULTY_ADMIN';

export const ROLE_PRIORITY: Role[] = ['FACULTY_ADMIN', 'HOD', 'OFFICER', 'STUDENT'];
export const ROLE_SLUG: Record<Role, string> = { STUDENT: 'student', OFFICER: 'officer', HOD: 'hod', FACULTY_ADMIN: 'admin' };
export const SLUG_ROLE: Record<string, Role> = { student: 'STUDENT', officer: 'OFFICER', hod: 'HOD', admin: 'FACULTY_ADMIN' };
export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: 'Student',
  OFFICER: 'Department Officer',
  HOD: 'Head of Department',
  FACULTY_ADMIN: 'Faculty Admin',
};

export type NavItem = { href: string; label: string; icon: string; mobile?: boolean };

export const NAV: Record<string, NavItem[]> = {
  student: [
    { href: 'dashboard', label: 'Home', icon: 'home', mobile: true },
    { href: 'submit', label: 'Submit Complaint', icon: 'plus', },
    { href: 'complaints', label: 'My Complaints', icon: 'file', mobile: true },
    { href: 'messages', label: 'Messages', icon: 'message', mobile: true },
    { href: 'notifications', label: 'Notifications', icon: 'bell', mobile: true },
    { href: 'profile', label: 'Profile', icon: 'user', mobile: true },
  ],
  officer: [
    { href: 'dashboard', label: 'Home', icon: 'home' },
    { href: 'queue', label: 'Department Queue', icon: 'inbox' },
    { href: 'complaints', label: 'My Complaints', icon: 'file' },
    { href: 'messages', label: 'Messages', icon: 'message' },
    { href: 'reopen', label: 'Reopen Requests', icon: 'refresh' },
    { href: 'notifications', label: 'Notifications', icon: 'bell' },
    { href: 'profile', label: 'Profile', icon: 'user' },
  ],
  hod: [
    { href: 'dashboard', label: 'Home', icon: 'home' },
    { href: 'complaints', label: 'Department Queue', icon: 'inbox' },
    { href: 'messages', label: 'Messages', icon: 'message' },
    { href: 'staff', label: 'Staff', icon: 'users' },
    { href: 'invitations', label: 'Invitations', icon: 'mail' },
    { href: 'categories', label: 'Categories', icon: 'tag' },
    { href: 'reopen', label: 'Reopen Requests', icon: 'refresh' },
    { href: 'notifications', label: 'Notifications', icon: 'bell' },
    { href: 'profile', label: 'Profile', icon: 'user' },
  ],
  admin: [
    { href: 'dashboard', label: 'Dashboard', icon: 'home' },
    { href: 'complaints', label: 'Faculty Overview', icon: 'layers' },
    { href: 'messages', label: 'Messages', icon: 'message' },
    { href: 'escalated', label: 'Escalated Cases', icon: 'alert' },
    { href: 'reopen', label: 'Reopen Requests', icon: 'refresh' },
    { href: 'departments', label: 'Departments', icon: 'building' },
    { href: 'staff', label: 'Staff', icon: 'users' },
    { href: 'invitations', label: 'Invitations', icon: 'mail' },
    { href: 'categories', label: 'Categories', icon: 'tag' },
    { href: 'notifications', label: 'Notifications', icon: 'bell' },
    { href: 'profile', label: 'Profile', icon: 'user' },
  ],
};

// Where "view all complaints" points for each role.
export const COMPLAINTS_HREF: Record<string, string> = {
  student: 'complaints',
  officer: 'queue',
  hod: 'complaints',
  admin: 'complaints',
};
