# Privacy and data protection: what is built, and what still needs a decision

This is a working note for your supervisor and the faculty. It is **not legal advice**. Your documents say that
applicable Nigerian and institutional data-protection requirements must be confirmed; nothing below claims compliance.

## What personal data the system holds
| Data | Where | Who can see it |
|---|---|---|
| Name, email, password (hashed, never readable) | users | The person; staff see names only in the context of a complaint or staff list |
| Matric number, level, department | students | The student; staff handling that student's complaint |
| Complaint text, status history, reasons | complaints | The submitting student; staff of that department; the Faculty Admin only for faculty-level and escalated cases |
| Messages (student-visible and internal staff notes) | messages | Students see only student-visible messages; internal notes are staff only |
| Notifications (short generic text) | notifications | The recipient only |
| Audit log (who did what, when; never message text, passwords or tokens) | audit | Database access only (no screen in this version) |
| Sessions and one-time tokens (stored as hashes) | sessions, tokens | Nobody (hashed) |

## Built in (privacy by design)
Least data: no anonymous/biometric/extra identifiers, no attachments. Department isolation enforced on the server and
tested. Passwords hashed; tokens hashed. Staff identities are hidden from students. Notifications and logs never contain
complaint text, reasons or messages. Responses are never cached. Logs keep no request bodies, cookies or query strings.
Expired sessions and old one-time tokens are deleted automatically (`npm run db:cleanup`).

## Decisions still open (please get answers in writing)
1. **Retention:** how long are complaints, messages and audit logs kept after a case is closed? Who authorises deletion?
2. **Deletion and correction requests:** how does a student ask for their data to be corrected or removed, and who handles
   it? (There is no self-service export or delete in this version, and complaints are a record the faculty may need to keep.)
3. **Backups:** how long may backups (including deleted data) be kept? Neon's restore window depends on the plan.
4. **Who may read the database directly** (administrators, developers), and how that access is recorded.
5. **Legal basis and notice:** the privacy notice shown at registration, and whether the faculty must register or notify
   an authority. The faculty's data-protection officer should review this.
6. **Hosting location:** data is stored in the Neon region and processed on Render (outside Nigeria). Confirm that cross-border
   processing is acceptable and under what safeguards.
7. **Third parties:** Gmail (emails contain the student's name and one-time links), Vercel, Render, Neon. Confirm they are acceptable processors.
8. **Complaint categories, rejection policy and escalation rules** are proposals until the faculty approves them.
9. **Incident response:** who is told, and how fast, if data is exposed.
