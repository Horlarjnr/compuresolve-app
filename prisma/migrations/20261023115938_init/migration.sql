-- CreateEnum
CREATE TYPE "DepartmentRole" AS ENUM ('STUDENT', 'OFFICER', 'HOD');

-- CreateEnum
CREATE TYPE "FacultyRole" AS ENUM ('FACULTY_ADMIN');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('L100', 'L200', 'L300', 'L400', 'L500');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ComplaintScope" AS ENUM ('DEPARTMENT', 'FACULTY');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'AWAITING_STUDENT', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MessageVisibility" AS ENUM ('STUDENT_AND_STAFF', 'STAFF_ONLY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COMPLAINT_SUBMITTED', 'COMPLAINT_ASSIGNED', 'STATUS_CHANGED', 'MESSAGE_RECEIVED', 'COMPLAINT_ESCALATED', 'COMPLAINT_RESOLVED', 'REOPEN_REQUESTED', 'REOPEN_REQUEST_DECIDED');

-- CreateEnum
CREATE TYPE "ReopenRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "matricNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentMembership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "role" "DepartmentRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFacultyRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "FacultyRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFacultyRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleGrantRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "requestedRole" "DepartmentRole",
    "requestedFacultyRole" "FacultyRole",
    "departmentId" UUID,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleGrantRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "ComplaintScope" NOT NULL,
    "departmentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "scope" "ComplaintScope" NOT NULL,
    "departmentId" UUID,
    "submittedById" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "assignedToId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'SUBMITTED',
    "priority" "ComplaintPriority" NOT NULL DEFAULT 'NORMAL',
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "escalatedToFaculty" BOOLEAN NOT NULL DEFAULT false,
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintAssignment" (
    "id" UUID NOT NULL,
    "complaintId" UUID NOT NULL,
    "officerId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),

    CONSTRAINT "ComplaintAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintStatusHistory" (
    "id" UUID NOT NULL,
    "complaintId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "fromStatus" "ComplaintStatus",
    "toStatus" "ComplaintStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintEscalation" (
    "id" UUID NOT NULL,
    "complaintId" UUID NOT NULL,
    "escalatedById" UUID NOT NULL,
    "fromDepartmentId" UUID,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintReopenRequest" (
    "id" UUID NOT NULL,
    "complaintId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "status" "ReopenRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "decidedById" UUID,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintReopenRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintMessage" (
    "id" UUID NOT NULL,
    "complaintId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "MessageVisibility" NOT NULL DEFAULT 'STUDENT_AND_STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "departmentId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "level" "Level" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffInvitation" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "requestedRole" "DepartmentRole",
    "requestedFacultyRole" "FacultyRole",
    "departmentId" UUID,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_matricNumber_key" ON "User"("matricNumber");

-- CreateIndex
CREATE INDEX "DepartmentMembership_departmentId_role_status_idx" ON "DepartmentMembership"("departmentId", "role", "status");

-- CreateIndex
CREATE INDEX "DepartmentMembership_userId_status_idx" ON "DepartmentMembership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentMembership_userId_departmentId_key" ON "DepartmentMembership"("userId", "departmentId");

-- CreateIndex
CREATE INDEX "UserFacultyRole_role_isActive_idx" ON "UserFacultyRole"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserFacultyRole_userId_role_key" ON "UserFacultyRole"("userId", "role");

-- CreateIndex
CREATE INDEX "RoleGrantRequest_status_createdAt_idx" ON "RoleGrantRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RoleGrantRequest_userId_status_idx" ON "RoleGrantRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "RoleGrantRequest_departmentId_requestedRole_status_idx" ON "RoleGrantRequest"("departmentId", "requestedRole", "status");

-- CreateIndex
CREATE INDEX "ComplaintCategory_scope_isActive_idx" ON "ComplaintCategory"("scope", "isActive");

-- CreateIndex
CREATE INDEX "ComplaintCategory_departmentId_isActive_idx" ON "ComplaintCategory"("departmentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintCategory_name_scope_departmentId_key" ON "ComplaintCategory"("name", "scope", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_reference_key" ON "Complaint"("reference");

-- CreateIndex
CREATE INDEX "Complaint_scope_status_createdAt_idx" ON "Complaint"("scope", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Complaint_escalatedToFaculty_status_createdAt_idx" ON "Complaint"("escalatedToFaculty", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Complaint_departmentId_status_createdAt_idx" ON "Complaint"("departmentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Complaint_submittedById_createdAt_idx" ON "Complaint"("submittedById", "createdAt");

-- CreateIndex
CREATE INDEX "Complaint_assignedToId_status_createdAt_idx" ON "Complaint"("assignedToId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintAssignment_complaintId_assignedAt_idx" ON "ComplaintAssignment"("complaintId", "assignedAt");

-- CreateIndex
CREATE INDEX "ComplaintAssignment_officerId_unassignedAt_idx" ON "ComplaintAssignment"("officerId", "unassignedAt");

-- CreateIndex
CREATE INDEX "ComplaintStatusHistory_complaintId_createdAt_idx" ON "ComplaintStatusHistory"("complaintId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintStatusHistory_actorId_createdAt_idx" ON "ComplaintStatusHistory"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintEscalation_complaintId_createdAt_idx" ON "ComplaintEscalation"("complaintId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintEscalation_escalatedById_createdAt_idx" ON "ComplaintEscalation"("escalatedById", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintReopenRequest_complaintId_status_createdAt_idx" ON "ComplaintReopenRequest"("complaintId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintReopenRequest_requesterId_createdAt_idx" ON "ComplaintReopenRequest"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintMessage_complaintId_createdAt_idx" ON "ComplaintMessage"("complaintId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintMessage_senderId_createdAt_idx" ON "ComplaintMessage"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_departmentId_createdAt_idx" ON "AuditLog"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffInvitation_email_idx" ON "StaffInvitation"("email");

-- CreateIndex
CREATE INDEX "StaffInvitation_departmentId_requestedRole_idx" ON "StaffInvitation"("departmentId", "requestedRole");

-- AddForeignKey
ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFacultyRole" ADD CONSTRAINT "UserFacultyRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleGrantRequest" ADD CONSTRAINT "RoleGrantRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleGrantRequest" ADD CONSTRAINT "RoleGrantRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleGrantRequest" ADD CONSTRAINT "RoleGrantRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintCategory" ADD CONSTRAINT "ComplaintCategory_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ComplaintCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAssignment" ADD CONSTRAINT "ComplaintAssignment_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAssignment" ADD CONSTRAINT "ComplaintAssignment_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAssignment" ADD CONSTRAINT "ComplaintAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintStatusHistory" ADD CONSTRAINT "ComplaintStatusHistory_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintStatusHistory" ADD CONSTRAINT "ComplaintStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEscalation" ADD CONSTRAINT "ComplaintEscalation_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEscalation" ADD CONSTRAINT "ComplaintEscalation_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEscalation" ADD CONSTRAINT "ComplaintEscalation_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintReopenRequest" ADD CONSTRAINT "ComplaintReopenRequest_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintReopenRequest" ADD CONSTRAINT "ComplaintReopenRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintReopenRequest" ADD CONSTRAINT "ComplaintReopenRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMessage" ADD CONSTRAINT "ComplaintMessage_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMessage" ADD CONSTRAINT "ComplaintMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

   ALTER TABLE "Complaint" ADD CONSTRAINT complaint_scope_department_check
     CHECK (("scope" = 'DEPARTMENT' AND "departmentId" IS NOT NULL) OR ("scope" = 'FACULTY' AND "departmentId" IS NULL));

   ALTER TABLE "User" ADD CONSTRAINT user_matric_format_check
     CHECK ("matricNumber" IS NULL OR "matricNumber" ~ '^[A-Z]{3}/[0-9]{4}/[0-9]{3}$');

   ALTER TABLE "StaffInvitation" ADD CONSTRAINT staff_invitation_role_check
     CHECK (
       ("requestedRole" IS NOT NULL AND "requestedFacultyRole" IS NULL AND "requestedRole" <> 'STUDENT' AND "departmentId" IS NOT NULL)
       OR ("requestedRole" IS NULL AND "requestedFacultyRole" IS NOT NULL AND "departmentId" IS NULL)
     );