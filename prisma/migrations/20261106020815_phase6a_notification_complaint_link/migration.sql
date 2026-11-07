-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "complaintId" UUID;

-- CreateIndex
CREATE INDEX "Notification_complaintId_idx" ON "Notification"("complaintId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
