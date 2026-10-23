// Seed data: departments, default complaint categories, and the first Faculty Admin.
// Safe to run more than once (idempotent). It never overwrites existing data or passwords.
// Run with: npx prisma db seed
import bcrypt from 'bcryptjs';
import { FacultyRole } from '../generated/prisma/client';
import { prisma } from '../src/utils/prisma';

// Names as supplied. The short codes are placeholders: edit them in the database if the faculty uses others.
const DEPARTMENTS = [
  { name: 'Department of Computer Engineering', code: 'CSE' },
  { name: 'Department of Computer Science and Cybersecurity', code: 'CSC' },
  { name: 'Department of Information System', code: 'IFS' },
  { name: 'Department of Intelligent System Engineering', code: 'ISE' },
  { name: 'Department of Software Engineering', code: 'SWE' },
];

// Proposed defaults only (not institution-approved). Categories stay configurable in the database.
const CATEGORIES = [
  'Academic Records',
  'Course Registration',
  'Grading/Results',
  'Facilities',
  'Staff Conduct',
  'Other',
];

async function seedDepartmentsAndCategories() {
  for (const dept of DEPARTMENTS) {
    const department = await prisma.department.upsert({
      where: { name: dept.name },
      update: {}, // keep any edits made later
      create: dept,
    });
    for (const name of CATEGORIES) {
      await prisma.complaintCategory.upsert({
        where: { name_scope_departmentId: { name, scope: 'DEPARTMENT', departmentId: department.id } },
        update: {},
        create: { name, scope: 'DEPARTMENT', departmentId: department.id },
      });
    }
  }

  // Faculty-level categories (departmentId is null, so a normal upsert on the unique key cannot be used).
  for (const name of CATEGORIES) {
    const existing = await prisma.complaintCategory.findFirst({
      where: { name, scope: 'FACULTY', departmentId: null },
    });
    if (!existing) {
      await prisma.complaintCategory.create({ data: { name, scope: 'FACULTY' } });
    }
  }
  console.log(`Departments: ${DEPARTMENTS.length}, categories per scope: ${CATEGORIES.length}`);
}

async function seedFacultyAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const fullName = process.env.SEED_ADMIN_NAME?.trim() || 'Faculty Administrator';

  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: skipping Faculty Admin.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('SEED_ADMIN_EMAIL is not a valid email address');
  }
  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.userFacultyRole.upsert({
      where: { userId_role: { userId: existing.id, role: FacultyRole.FACULTY_ADMIN } },
      update: {},
      create: { userId: existing.id, role: FacultyRole.FACULTY_ADMIN },
    });
    console.log('Faculty Admin user already exists: role ensured, password unchanged.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash,
      emailVerifiedAt: new Date(), // bootstrap account: trusted, no email step
      facultyRoles: { create: { role: FacultyRole.FACULTY_ADMIN } },
    },
  });
  console.log('Faculty Admin created. Remove SEED_ADMIN_PASSWORD from .env now.');
}

async function main() {
  await seedDepartmentsAndCategories();
  await seedFacultyAdmin();
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
