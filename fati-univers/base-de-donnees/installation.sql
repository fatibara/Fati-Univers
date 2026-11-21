-- =============================================================================
-- FATI UNIVERS — INSTALLATION COMPLÈTE DE LA BASE (fichier généré, ne pas modifier à la main)
-- =============================================================================
-- AVANT D'EXÉCUTER : remplacez les deux mots de passe ci-dessous
--   REMPLACER_MOT_DE_PASSE_APP        (rôle de l'API)
--   REMPLACER_MOT_DE_PASSE_PLATEFORME (rôle de super-administration)
-- par deux mots de passe longs (20 caractères ou plus), LETTRES ET CHIFFRES
-- UNIQUEMENT (pas de symboles : ils cassent les adresses de connexion).
-- Puis copiez TOUT le fichier dans l'éditeur SQL de Neon et cliquez sur Run.
-- À exécuter UNE SEULE FOIS, sur une base vide. Tout s'annule en cas d'erreur.
-- =============================================================================
BEGIN;

-- 1. RÔLES ------------------------------------------------------------------
-- fati_app      : l'API. Soumis à la Row-Level Security (ne voit qu'une école à la fois).
-- fati_platform : super-administration. Voit toutes les écoles via une politique dédiée.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fati_app') THEN
    CREATE ROLE fati_app LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fati_platform') THEN
    CREATE ROLE fati_platform LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE fati_app      WITH LOGIN PASSWORD 'REMPLACER_MOT_DE_PASSE_APP';
ALTER ROLE fati_platform WITH LOGIN PASSWORD 'REMPLACER_MOT_DE_PASSE_PLATEFORME';

-- 2. TABLES -----------------------------------------------------------------
-- DDL généré par scripts/check_schema.py (équivalent du schéma Prisma, pour les tests)
CREATE TYPE "TenantStatus" AS ENUM ('EN_ATTENTE', 'ACTIF', 'SUSPENDU', 'ARCHIVE');
CREATE TYPE "Role" AS ENUM ('PROMOTEUR', 'DIRECTEUR', 'CENSEUR', 'SECRETAIRE', 'COMPTABLE', 'CAISSIER', 'ENSEIGNANT', 'SURVEILLANT', 'PARENT', 'ELEVE', 'BIBLIOTHECAIRE', 'RESPONSABLE_TRANSPORT', 'RESPONSABLE_CANTINE', 'RESPONSABLE_INTERNAT');
CREATE TYPE "Cycle" AS ENUM ('MATERNELLE', 'PRIMAIRE', 'COLLEGE', 'LYCEE', 'SUPERIEUR', 'FORMATION_PRO');
CREATE TYPE "Gender" AS ENUM ('M', 'F');
CREATE TYPE "PeriodType" AS ENUM ('TRIMESTRE', 'SEMESTRE');
CREATE TYPE "EnrollmentStatus" AS ENUM ('PREINSCRIT', 'INSCRIT', 'TRANSFERE', 'ABANDON', 'EXCLU', 'DIPLOME');
CREATE TYPE "AssessmentType" AS ENUM ('INTERROGATION', 'DEVOIR', 'COMPOSITION', 'EXAMEN');
CREATE TYPE "GradeStatus" AS ENUM ('NOTE', 'ABSENT_JUSTIFIE', 'ABSENT_NON_JUSTIFIE', 'DISPENSE');
CREATE TYPE "AbsentPolicy" AS ENUM ('NON_COMPTE', 'ZERO');
CREATE TYPE "ReportDecision" AS ENUM ('ADMIS', 'REDOUBLE', 'EXCLU');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'RETARD');
CREATE TYPE "FeeCategory" AS ENUM ('INSCRIPTION', 'REINSCRIPTION', 'SCOLARITE', 'MENSUALITE', 'TENUE', 'FOURNITURES', 'CANTINE', 'TRANSPORT', 'EXAMEN', 'AUTRE');
CREATE TYPE "InvoiceStatus" AS ENUM ('EMISE', 'PARTIELLEMENT_PAYEE', 'PAYEE', 'ANNULEE');
CREATE TYPE "PaymentMethod" AS ENUM ('ESPECES', 'ORANGE_MONEY', 'MTN_MOMO', 'CARTE', 'VIREMENT');
CREATE TYPE "PaymentStatus" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'ECHOUE', 'ANNULE');
CREATE TYPE "CashSessionStatus" AS ENUM ('OUVERTE', 'CLOTUREE');
CREATE TYPE "SmsStatus" AS ENUM ('EN_ATTENTE', 'ENVOYE', 'ECHEC');
CREATE TYPE "ImportStatus" AS ENUM ('ANALYSE', 'PRET', 'IMPORTE', 'ANNULE', 'ERREUR');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ESSAI', 'ACTIF', 'IMPAYE', 'LECTURE_SEULE', 'RESILIE');
CREATE TYPE "BillingCycle" AS ENUM ('MENSUEL', 'ANNUEL');
CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "passwordHash" TEXT,
  "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
  "twoFactorSecret" TEXT,
  "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "preferredLanguage" TEXT NOT NULL DEFAULT 'fr',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "UserSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "ip" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");
CREATE TABLE "OtpCode" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OtpCode_phone_purpose_idx" ON "OtpCode"("phone", "purpose");
CREATE TABLE "Tenant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'EN_ATTENTE',
  "country" TEXT NOT NULL DEFAULT 'GN',
  "currency" TEXT NOT NULL DEFAULT 'GNF',
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Conakry',
  "city" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "logoKey" TEXT,
  "cycles" "Cycle"[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE TABLE "Plan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "maxStudents" INTEGER,
  "monthlyPriceGnf" INTEGER NOT NULL,
  "yearlyPriceGnf" INTEGER NOT NULL,
  "monthlySmsCredit" INTEGER NOT NULL,
  "features" TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE TABLE "Subscription" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ESSAI',
  "billingCycle" "BillingCycle" NOT NULL DEFAULT 'ANNUEL',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "smsUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
  "extraSmsCredit" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Subscription_tenantId_idx" ON "Subscription"("tenantId");
CREATE TABLE "SupportAccessGrant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "granteeId" UUID NOT NULL,
  "approvedById" UUID,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SupportAccessGrant_tenantId_idx" ON "SupportAccessGrant"("tenantId");
CREATE TABLE "Membership" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "roles" "Role"[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE TABLE "Campus" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Campus_tenantId_id_key" ON "Campus"("tenantId", "id");
CREATE UNIQUE INDEX "Campus_tenantId_name_key" ON "Campus"("tenantId", "name");
CREATE TABLE "AcademicYear" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "periodType" "PeriodType" NOT NULL DEFAULT 'TRIMESTRE',
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AcademicYear_tenantId_id_key" ON "AcademicYear"("tenantId", "id");
CREATE UNIQUE INDEX "AcademicYear_tenantId_label_key" ON "AcademicYear"("tenantId", "label");
CREATE TABLE "Term" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "gradesLockedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "Term_tenantId_id_key" ON "Term"("tenantId", "id");
CREATE UNIQUE INDEX "Term_tenantId_academicYearId_position_key" ON "Term"("tenantId", "academicYearId", "position");
CREATE TABLE "Level" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "cycle" "Cycle" NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "gradeScale" INTEGER NOT NULL DEFAULT 20
);
CREATE UNIQUE INDEX "Level_tenantId_id_key" ON "Level"("tenantId", "id");
CREATE UNIQUE INDEX "Level_tenantId_name_key" ON "Level"("tenantId", "name");
CREATE TABLE "Track" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL
);
CREATE UNIQUE INDEX "Track_tenantId_id_key" ON "Track"("tenantId", "id");
CREATE UNIQUE INDEX "Track_tenantId_code_key" ON "Track"("tenantId", "code");
CREATE TABLE "Classroom" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "levelId" UUID NOT NULL,
  "trackId" UUID,
  "campusId" UUID,
  "name" TEXT NOT NULL,
  "capacity" INTEGER,
  "mainTeacherId" UUID
);
CREATE UNIQUE INDEX "Classroom_tenantId_id_key" ON "Classroom"("tenantId", "id");
CREATE UNIQUE INDEX "Classroom_tenantId_academicYearId_name_key" ON "Classroom"("tenantId", "academicYearId", "name");
CREATE TABLE "Room" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "campusId" UUID,
  "name" TEXT NOT NULL,
  "capacity" INTEGER
);
CREATE UNIQUE INDEX "Room_tenantId_id_key" ON "Room"("tenantId", "id");
CREATE UNIQUE INDEX "Room_tenantId_name_key" ON "Room"("tenantId", "name");
CREATE TABLE "Subject" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL
);
CREATE UNIQUE INDEX "Subject_tenantId_id_key" ON "Subject"("tenantId", "id");
CREATE UNIQUE INDEX "Subject_tenantId_code_key" ON "Subject"("tenantId", "code");
CREATE TABLE "SubjectCoefficient" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "levelId" UUID NOT NULL,
  "subjectId" UUID NOT NULL,
  "trackId" UUID,
  "coefficient" INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX "SubjectCoefficient_tenantId_levelId_subjectId_trackId_key" ON "SubjectCoefficient"("tenantId", "levelId", "subjectId", "trackId");
CREATE TABLE "GradingPolicy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "levelId" UUID,
  "absentPolicy" "AbsentPolicy" NOT NULL DEFAULT 'NON_COMPTE',
  "decimals" INTEGER NOT NULL DEFAULT 2,
  "typeWeights" JSONB NOT NULL DEFAULT '{"INTERROGATION":1,"DEVOIR":1,"COMPOSITION":2,"EXAMEN":2}'::jsonb,
  "mentions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "annualRule" JSONB NOT NULL DEFAULT '"MOYENNE_DES_PERIODES"'::jsonb,
  "passingAverage" DECIMAL(5, 2) NOT NULL DEFAULT 10
);
CREATE UNIQUE INDEX "GradingPolicy_tenantId_levelId_key" ON "GradingPolicy"("tenantId", "levelId");
CREATE TABLE "StaffMember" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "userId" UUID,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "phone" TEXT,
  "position" TEXT,
  "hiredOn" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StaffMember_tenantId_id_key" ON "StaffMember"("tenantId", "id");
CREATE UNIQUE INDEX "StaffMember_tenantId_userId_key" ON "StaffMember"("tenantId", "userId");
CREATE TABLE "TeachingAssignment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "classroomId" UUID NOT NULL,
  "subjectId" UUID NOT NULL,
  "staffId" UUID NOT NULL
);
CREATE UNIQUE INDEX "TeachingAssignment_tenantId_classroomId_subjectId_key" ON "TeachingAssignment"("tenantId", "classroomId", "subjectId");
CREATE INDEX "TeachingAssignment_tenantId_staffId_idx" ON "TeachingAssignment"("tenantId", "staffId");
CREATE TABLE "Student" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "matricule" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "gender" "Gender" NOT NULL,
  "birthDate" DATE,
  "birthPlace" TEXT,
  "nationality" TEXT NOT NULL DEFAULT 'GN',
  "photoKey" TEXT,
  "medicalNotes" TEXT,
  "userId" UUID,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Student_tenantId_id_key" ON "Student"("tenantId", "id");
CREATE UNIQUE INDEX "Student_tenantId_matricule_key" ON "Student"("tenantId", "matricule");
CREATE INDEX "Student_tenantId_lastName_firstName_idx" ON "Student"("tenantId", "lastName", "firstName");
CREATE TABLE "Guardian" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "userId" UUID,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "phone2" TEXT,
  "profession" TEXT,
  "address" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Guardian_tenantId_id_key" ON "Guardian"("tenantId", "id");
CREATE UNIQUE INDEX "Guardian_tenantId_phone_key" ON "Guardian"("tenantId", "phone");
CREATE TABLE "StudentGuardian" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "guardianId" UUID NOT NULL,
  "relationship" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "receivesSms" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "StudentGuardian_tenantId_studentId_guardianId_key" ON "StudentGuardian"("tenantId", "studentId", "guardianId");
CREATE INDEX "StudentGuardian_tenantId_guardianId_idx" ON "StudentGuardian"("tenantId", "guardianId");
CREATE TABLE "Enrollment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "classroomId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "status" "EnrollmentStatus" NOT NULL DEFAULT 'PREINSCRIT',
  "enrolledOn" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftOn" DATE,
  "isRepeating" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT
);
CREATE UNIQUE INDEX "Enrollment_tenantId_id_key" ON "Enrollment"("tenantId", "id");
CREATE UNIQUE INDEX "Enrollment_tenantId_studentId_academicYearId_key" ON "Enrollment"("tenantId", "studentId", "academicYearId");
CREATE INDEX "Enrollment_tenantId_classroomId_idx" ON "Enrollment"("tenantId", "classroomId");
CREATE TABLE "Assessment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "classroomId" UUID NOT NULL,
  "subjectId" UUID NOT NULL,
  "termId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "type" "AssessmentType" NOT NULL,
  "title" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "maxScore" DECIMAL(5, 2) NOT NULL DEFAULT 20,
  "weight" DECIMAL(5, 2) NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Assessment_tenantId_id_key" ON "Assessment"("tenantId", "id");
CREATE INDEX "Assessment_tenantId_classroomId_termId_idx" ON "Assessment"("tenantId", "classroomId", "termId");
CREATE TABLE "Grade" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "status" "GradeStatus" NOT NULL DEFAULT 'NOTE',
  "score" DECIMAL(5, 2),
  "comment" TEXT,
  "updatedById" UUID,
  "clientUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Grade_tenantId_assessmentId_studentId_key" ON "Grade"("tenantId", "assessmentId", "studentId");
CREATE TABLE "ReportCard" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "termId" UUID NOT NULL,
  "average" DECIMAL(5, 2),
  "rank" INTEGER,
  "classSize" INTEGER,
  "mention" TEXT,
  "decision" "ReportDecision",
  "teacherRemark" TEXT,
  "directorRemark" TEXT,
  "validatedAt" TIMESTAMP(3),
  "validatedById" UUID,
  "pdfKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ReportCard_tenantId_studentId_termId_key" ON "ReportCard"("tenantId", "studentId", "termId");
CREATE TABLE "AttendanceSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "classroomId" UUID NOT NULL,
  "takenById" UUID NOT NULL,
  "timetableEntryId" UUID,
  "date" DATE NOT NULL,
  "startTime" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AttendanceSession_tenantId_id_key" ON "AttendanceSession"("tenantId", "id");
CREATE INDEX "AttendanceSession_tenantId_classroomId_date_idx" ON "AttendanceSession"("tenantId", "classroomId", "date");
CREATE TABLE "AttendanceRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "minutesLate" INTEGER,
  "justified" BOOLEAN NOT NULL DEFAULT false,
  "justification" TEXT,
  "smsSentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "AttendanceRecord_tenantId_sessionId_studentId_key" ON "AttendanceRecord"("tenantId", "sessionId", "studentId");
CREATE INDEX "AttendanceRecord_tenantId_studentId_idx" ON "AttendanceRecord"("tenantId", "studentId");
CREATE TABLE "TimetableEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "classroomId" UUID NOT NULL,
  "subjectId" UUID NOT NULL,
  "staffId" UUID,
  "roomId" UUID,
  "dayOfWeek" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL
);
CREATE UNIQUE INDEX "TimetableEntry_tenantId_id_key" ON "TimetableEntry"("tenantId", "id");
CREATE INDEX "TimetableEntry_tenantId_classroomId_dayOfWeek_idx" ON "TimetableEntry"("tenantId", "classroomId", "dayOfWeek");
CREATE TABLE "FeeType" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "category" "FeeCategory" NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "FeeType_tenantId_id_key" ON "FeeType"("tenantId", "id");
CREATE UNIQUE INDEX "FeeType_tenantId_name_key" ON "FeeType"("tenantId", "name");
CREATE TABLE "FeeRate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "feeTypeId" UUID NOT NULL,
  "levelId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "amountGnf" INTEGER NOT NULL,
  "installments" INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX "FeeRate_tenantId_feeTypeId_levelId_academicYearId_key" ON "FeeRate"("tenantId", "feeTypeId", "levelId", "academicYearId");
CREATE TABLE "Invoice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "studentId" UUID NOT NULL,
  "enrollmentId" UUID,
  "academicYearId" UUID NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'EMISE',
  "issuedOn" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalGnf" INTEGER NOT NULL,
  "paidGnf" INTEGER NOT NULL DEFAULT 0,
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Invoice_tenantId_id_key" ON "Invoice"("tenantId", "id");
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");
CREATE INDEX "Invoice_tenantId_studentId_idx" ON "Invoice"("tenantId", "studentId");
CREATE TABLE "InvoiceLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "feeTypeId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "amountGnf" INTEGER NOT NULL,
  "discountGnf" INTEGER NOT NULL DEFAULT 0,
  "discountReason" TEXT
);
CREATE TABLE "Installment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "dueOn" DATE NOT NULL,
  "amountGnf" INTEGER NOT NULL,
  "paidGnf" INTEGER NOT NULL DEFAULT 0,
  "lastReminderAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "Installment_tenantId_id_key" ON "Installment"("tenantId", "id");
CREATE UNIQUE INDEX "Installment_tenantId_invoiceId_position_key" ON "Installment"("tenantId", "invoiceId", "position");
CREATE INDEX "Installment_tenantId_dueOn_idx" ON "Installment"("tenantId", "dueOn");
CREATE TABLE "CashSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "cashierId" UUID NOT NULL,
  "status" "CashSessionStatus" NOT NULL DEFAULT 'OUVERTE',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingFloatGnf" INTEGER NOT NULL DEFAULT 0,
  "closedAt" TIMESTAMP(3),
  "expectedGnf" INTEGER,
  "countedGnf" INTEGER,
  "discrepancyNote" TEXT
);
CREATE UNIQUE INDEX "CashSession_tenantId_id_key" ON "CashSession"("tenantId", "id");
CREATE INDEX "CashSession_tenantId_cashierId_status_idx" ON "CashSession"("tenantId", "cashierId", "status");
CREATE TABLE "ReceiptCounter" (
  "tenantId" UUID NOT NULL PRIMARY KEY,
  "nextNumber" INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE "Payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "receiptNumber" INTEGER,
  "studentId" UUID NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'EN_ATTENTE',
  "amountGnf" INTEGER NOT NULL,
  "payerName" TEXT,
  "payerPhone" TEXT,
  "cashSessionId" UUID,
  "receivedById" UUID,
  "idempotencyKey" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelledById" UUID,
  "cancelApprovedById" UUID,
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Payment_tenantId_id_key" ON "Payment"("tenantId", "id");
CREATE UNIQUE INDEX "Payment_tenantId_receiptNumber_key" ON "Payment"("tenantId", "receiptNumber");
CREATE UNIQUE INDEX "Payment_tenantId_idempotencyKey_key" ON "Payment"("tenantId", "idempotencyKey");
CREATE INDEX "Payment_tenantId_studentId_idx" ON "Payment"("tenantId", "studentId");
CREATE INDEX "Payment_tenantId_createdAt_idx" ON "Payment"("tenantId", "createdAt");
CREATE TABLE "PaymentAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "installmentId" UUID NOT NULL,
  "amountGnf" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "PaymentAllocation_tenantId_paymentId_installmentId_key" ON "PaymentAllocation"("tenantId", "paymentId", "installmentId");
CREATE TABLE "MobileMoneyTransaction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "provider" "PaymentMethod" NOT NULL,
  "providerTxId" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'EN_ATTENTE',
  "amountGnf" INTEGER NOT NULL,
  "payerPhone" TEXT NOT NULL,
  "lastCheckedAt" TIMESTAMP(3),
  "rawCallback" JSONB,
  "reconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MobileMoneyTransaction_provider_providerTxId_key" ON "MobileMoneyTransaction"("provider", "providerTxId");
CREATE INDEX "MobileMoneyTransaction_tenantId_status_idx" ON "MobileMoneyTransaction"("tenantId", "status");
CREATE TABLE "Announcement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "sendSms" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SmsMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "toPhone" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "segments" INTEGER NOT NULL DEFAULT 1,
  "purpose" TEXT NOT NULL,
  "status" "SmsStatus" NOT NULL DEFAULT 'EN_ATTENTE',
  "provider" TEXT,
  "providerRef" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SmsMessage_tenantId_createdAt_idx" ON "SmsMessage"("tenantId", "createdAt");
CREATE TABLE "ImportJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'ANALYSE',
  "fileKey" TEXT NOT NULL,
  "report" JSONB,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID,
  "actorUserId" UUID,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_plan_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAccessGrant" ADD CONSTRAINT "SupportAccessGrant_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAccessGrant" ADD CONSTRAINT "SupportAccessGrant_grantee_fkey" FOREIGN KEY ("granteeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAccessGrant" ADD CONSTRAINT "SupportAccessGrant_approvedBy_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Term" ADD CONSTRAINT "Term_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Term" ADD CONSTRAINT "Term_academicYear_fkey" FOREIGN KEY ("tenantId", "academicYearId") REFERENCES "AcademicYear"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Level" ADD CONSTRAINT "Level_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Track" ADD CONSTRAINT "Track_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_academicYear_fkey" FOREIGN KEY ("tenantId", "academicYearId") REFERENCES "AcademicYear"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_level_fkey" FOREIGN KEY ("tenantId", "levelId") REFERENCES "Level"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_track_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_campus_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_mainTeacher_fkey" FOREIGN KEY ("mainTeacherId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_campus_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectCoefficient" ADD CONSTRAINT "SubjectCoefficient_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectCoefficient" ADD CONSTRAINT "SubjectCoefficient_level_fkey" FOREIGN KEY ("tenantId", "levelId") REFERENCES "Level"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectCoefficient" ADD CONSTRAINT "SubjectCoefficient_subject_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES "Subject"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectCoefficient" ADD CONSTRAINT "SubjectCoefficient_track_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GradingPolicy" ADD CONSTRAINT "GradingPolicy_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradingPolicy" ADD CONSTRAINT "GradingPolicy_level_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_classroom_fkey" FOREIGN KEY ("tenantId", "classroomId") REFERENCES "Classroom"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_subject_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES "Subject"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_staff_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "StaffMember"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Student" ADD CONSTRAINT "Student_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_student_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "Student"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_guardian_fkey" FOREIGN KEY ("tenantId", "guardianId") REFERENCES "Guardian"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_student_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "Student"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classroom_fkey" FOREIGN KEY ("tenantId", "classroomId") REFERENCES "Classroom"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_academicYear_fkey" FOREIGN KEY ("tenantId", "academicYearId") REFERENCES "AcademicYear"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_classroom_fkey" FOREIGN KEY ("tenantId", "classroomId") REFERENCES "Classroom"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_subject_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES "Subject"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_term_fkey" FOREIGN KEY ("tenantId", "termId") REFERENCES "Term"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_createdBy_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "StaffMember"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_assessment_fkey" FOREIGN KEY ("tenantId", "assessmentId") REFERENCES "Assessment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_student_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "Student"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_student_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "Student"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_term_fkey" FOREIGN KEY ("tenantId", "termId") REFERENCES "Term"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_classroom_fkey" FOREIGN KEY ("tenantId", "classroomId") REFERENCES "Classroom"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_takenBy_fkey" FOREIGN KEY ("tenantId", "takenById") REFERENCES "StaffMember"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_timetableEntry_fkey" FOREIGN KEY ("timetableEntryId") REFERENCES "TimetableEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_session_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES "AttendanceSession"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_student_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "Student"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_classroom_fkey" FOREIGN KEY ("tenantId", "classroomId") REFERENCES "Classroom"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subject_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES "Subject"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_staff_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_room_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeeType" ADD CONSTRAINT "FeeType_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeRate" ADD CONSTRAINT "FeeRate_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeRate" ADD CONSTRAINT "FeeRate_feeType_fkey" FOREIGN KEY ("tenantId", "feeTypeId") REFERENCES "FeeType"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeRate" ADD CONSTRAINT "FeeRate_level_fkey" FOREIGN KEY ("tenantId", "levelId") REFERENCES "Level"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeRate" ADD CONSTRAINT "FeeRate_academicYear_fkey" FOREIGN KEY ("tenantId", "academicYearId") REFERENCES "AcademicYear"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_student_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "Student"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_enrollment_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_academicYear_fkey" FOREIGN KEY ("tenantId", "academicYearId") REFERENCES "AcademicYear"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoice_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Invoice"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_feeType_fkey" FOREIGN KEY ("tenantId", "feeTypeId") REFERENCES "FeeType"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_invoice_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Invoice"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_cashier_fkey" FOREIGN KEY ("tenantId", "cashierId") REFERENCES "StaffMember"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceiptCounter" ADD CONSTRAINT "ReceiptCounter_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_student_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "Student"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashSession_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_payment_fkey" FOREIGN KEY ("tenantId", "paymentId") REFERENCES "Payment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_installment_fkey" FOREIGN KEY ("tenantId", "installmentId") REFERENCES "Installment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MobileMoneyTransaction" ADD CONSTRAINT "MobileMoneyTransaction_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MobileMoneyTransaction" ADD CONSTRAINT "MobileMoneyTransaction_payment_fkey" FOREIGN KEY ("tenantId", "paymentId") REFERENCES "Payment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 3. ÉCOLE DE DÉMONSTRATION (fictive) ---------------------------------------
-- Comptes : +224620000001 (directrice) à +224620000004 (parent), mot de passe Demo-Fati-2027
-- À supprimer ou désactiver avant l'arrivée des vraies écoles.
INSERT INTO "Plan"(id, code, name, "maxStudents", "monthlyPriceGnf", "yearlyPriceGnf", "monthlySmsCredit", features) VALUES
 ('d0000000-0000-4000-8000-0000000000a1', 'ETABLISSEMENT', 'Établissement', 300, 0, 0, 500, '{}'),
 ('d0000000-0000-4000-8000-0000000000a2', 'PROFESSIONNELLE', 'Professionnelle', 1500, 0, 0, 2000, '{DISCIPLINE,EXAMENS,MESSAGERIE,WHATSAPP,MULTI_CAISSES}'),
 ('d0000000-0000-4000-8000-0000000000a3', 'PREMIUM', 'Premium', NULL, 0, 0, 6000, '{DISCIPLINE,EXAMENS,MESSAGERIE,WHATSAPP,MULTI_CAISSES,LMD,MULTI_CAMPUS}');
INSERT INTO "Tenant"(id, slug, name, "shortName", status, city, address, phone, cycles, "updatedAt") VALUES
 ('d0000000-0000-4000-8000-000000000001', 'demo-kaloum', 'Groupe Scolaire Démo FATI', 'GS DEMO', 'ACTIF', 'Conakry', 'Kaloum', '+224620000000', '{PRIMAIRE,COLLEGE,LYCEE}', now());
INSERT INTO "Subscription"("tenantId", "planId", status, "startsAt", "endsAt", "updatedAt") VALUES
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a2', 'ESSAI', '2027-09-01', '2028-08-31', now());
INSERT INTO "User"(id, phone, "firstName", "lastName", "passwordHash", "updatedAt") VALUES
 ('d0000000-0000-4000-8000-000000000101', '+224620000001', 'Mariama', 'Bah', 'scrypt$17$8$1$/hsH7ZMZTvELtQdBaziRfw==$fZkTj/MxbOOZV0Dxx1lfEQuGV10nLJ0Oi6B+SKauKjI=', now()),
 ('d0000000-0000-4000-8000-000000000102', '+224620000002', 'Ibrahima', 'Sow', 'scrypt$17$8$1$gwNWYXrnFjYYHT581AbZHw==$hN1CCKAVSI37cukDldJbUEsEHmoxn+zEkViaZbBKC9s=', now()),
 ('d0000000-0000-4000-8000-000000000103', '+224620000003', 'Kadiatou', 'Condé', 'scrypt$17$8$1$HR6knCG2ob09SSNa5CBPnQ==$WIrkp066E6DerH+45H7UwPu+FgPk3Ecve+sUeXceYlA=', now()),
 ('d0000000-0000-4000-8000-000000000104', '+224620000004', 'Alpha', 'Diallo', 'scrypt$17$8$1$SNHI0P95omnxBOzt7GA74A==$p3kdI0Ia6tgdJaKK5XXlET3GsZi16xqQFjQrnYhtc34=', now());
INSERT INTO "Membership"("tenantId", "userId", roles, "updatedAt") VALUES
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000101', '{DIRECTEUR}', now()),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000102', '{ENSEIGNANT}', now()),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000103', '{CAISSIER}', now()),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000104', '{PARENT}', now());
INSERT INTO "AcademicYear"(id, "tenantId", label, "startsOn", "endsOn", "isCurrent") VALUES
 ('d0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000001', '2027-2028', '2027-10-01', '2028-06-30', true);
INSERT INTO "Term"("tenantId", "academicYearId", name, position, "startsOn", "endsOn") VALUES
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000010', '1er trimestre', 1, '2027-10-01', '2027-12-20'),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000010', '2e trimestre', 2, '2028-01-05', '2028-03-31'),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000010', '3e trimestre', 3, '2028-04-10', '2028-06-30');
INSERT INTO "Level"(id, "tenantId", cycle, name, position, "gradeScale") VALUES
 ('d0000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000001', 'PRIMAIRE', 'CP1', 1, 10),
 ('d0000000-0000-4000-8000-000000000202', 'd0000000-0000-4000-8000-000000000001', 'PRIMAIRE', 'CP2', 2, 10),
 ('d0000000-0000-4000-8000-000000000203', 'd0000000-0000-4000-8000-000000000001', 'PRIMAIRE', 'CE1', 3, 10),
 ('d0000000-0000-4000-8000-000000000204', 'd0000000-0000-4000-8000-000000000001', 'PRIMAIRE', 'CE2', 4, 10),
 ('d0000000-0000-4000-8000-000000000205', 'd0000000-0000-4000-8000-000000000001', 'PRIMAIRE', 'CM1', 5, 10),
 ('d0000000-0000-4000-8000-000000000206', 'd0000000-0000-4000-8000-000000000001', 'PRIMAIRE', 'CM2', 6, 10),
 ('d0000000-0000-4000-8000-000000000207', 'd0000000-0000-4000-8000-000000000001', 'COLLEGE', '7e année', 7, 20),
 ('d0000000-0000-4000-8000-000000000208', 'd0000000-0000-4000-8000-000000000001', 'COLLEGE', '8e année', 8, 20),
 ('d0000000-0000-4000-8000-000000000209', 'd0000000-0000-4000-8000-000000000001', 'COLLEGE', '9e année', 9, 20),
 ('d0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000001', 'COLLEGE', '10e année', 10, 20),
 ('d0000000-0000-4000-8000-000000000211', 'd0000000-0000-4000-8000-000000000001', 'LYCEE', '11e année', 11, 20),
 ('d0000000-0000-4000-8000-000000000212', 'd0000000-0000-4000-8000-000000000001', 'LYCEE', '12e année', 12, 20),
 ('d0000000-0000-4000-8000-000000000213', 'd0000000-0000-4000-8000-000000000001', 'LYCEE', 'Terminale', 13, 20);
INSERT INTO "Track"("tenantId", code, name) VALUES
 ('d0000000-0000-4000-8000-000000000001', 'SS', 'Sciences sociales'), ('d0000000-0000-4000-8000-000000000001', 'SE', 'Sciences expérimentales'), ('d0000000-0000-4000-8000-000000000001', 'SM', 'Sciences mathématiques');
INSERT INTO "Subject"(id, "tenantId", code, name) VALUES
 ('d0000000-0000-4000-8000-000000000301', 'd0000000-0000-4000-8000-000000000001', 'FR', 'Français'),
 ('d0000000-0000-4000-8000-000000000302', 'd0000000-0000-4000-8000-000000000001', 'MATH', 'Mathématiques'),
 ('d0000000-0000-4000-8000-000000000303', 'd0000000-0000-4000-8000-000000000001', 'PC', 'Physique-Chimie'),
 ('d0000000-0000-4000-8000-000000000304', 'd0000000-0000-4000-8000-000000000001', 'SVT', 'Sciences de la vie et de la Terre'),
 ('d0000000-0000-4000-8000-000000000305', 'd0000000-0000-4000-8000-000000000001', 'HG', 'Histoire-Géographie'),
 ('d0000000-0000-4000-8000-000000000306', 'd0000000-0000-4000-8000-000000000001', 'ANG', 'Anglais'),
 ('d0000000-0000-4000-8000-000000000307', 'd0000000-0000-4000-8000-000000000001', 'ECM', 'Éducation civique et morale'),
 ('d0000000-0000-4000-8000-000000000308', 'd0000000-0000-4000-8000-000000000001', 'EPS', 'Éducation physique');
INSERT INTO "SubjectCoefficient"("tenantId", "levelId", "subjectId", coefficient) VALUES
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000301', 4),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000302', 4),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000303', 3),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000304', 3),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000305', 2),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000306', 2),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000307', 1),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000308', 1);
INSERT INTO "GradingPolicy"("tenantId", mentions) VALUES
 ('d0000000-0000-4000-8000-000000000001', '[{"min":16,"label":"Très bien"},{"min":14,"label":"Bien"},{"min":12,"label":"Assez bien"},{"min":10,"label":"Passable"},{"min":0,"label":"Insuffisant"}]');
INSERT INTO "StaffMember"(id, "tenantId", "userId", "firstName", "lastName", phone, position) VALUES
 ('d0000000-0000-4000-8000-000000000030', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000102', 'Ibrahima', 'Sow', '+224620000002', 'Professeur de mathématiques'),
 ('d0000000-0000-4000-8000-000000000031', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000103', 'Kadiatou', 'Condé', '+224620000003', 'Caissière');
INSERT INTO "Classroom"(id, "tenantId", "academicYearId", "levelId", name, capacity, "mainTeacherId") VALUES
 ('d0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000210', '10e A', 60, 'd0000000-0000-4000-8000-000000000030');
INSERT INTO "TeachingAssignment"("tenantId", "classroomId", "subjectId", "staffId") VALUES
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000302', 'd0000000-0000-4000-8000-000000000030');
INSERT INTO "Guardian"(id, "tenantId", "userId", "firstName", "lastName", phone, profession) VALUES
 ('d0000000-0000-4000-8000-000000000040', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000104', 'Alpha', 'Diallo', '+224620000004', 'Commerçant');
INSERT INTO "Student"(id, "tenantId", matricule, "firstName", "lastName", gender, "updatedAt") VALUES
 ('d0000000-0000-4000-8000-000000000401', 'd0000000-0000-4000-8000-000000000001', '2027-0001', 'Aïssatou', 'Diallo', 'F', now()),
 ('d0000000-0000-4000-8000-000000000402', 'd0000000-0000-4000-8000-000000000001', '2027-0002', 'Mamadou', 'Diallo', 'M', now()),
 ('d0000000-0000-4000-8000-000000000403', 'd0000000-0000-4000-8000-000000000001', '2027-0003', 'Fatoumata', 'Camara', 'F', now()),
 ('d0000000-0000-4000-8000-000000000404', 'd0000000-0000-4000-8000-000000000001', '2027-0004', 'Ousmane', 'Barry', 'M', now()),
 ('d0000000-0000-4000-8000-000000000405', 'd0000000-0000-4000-8000-000000000001', '2027-0005', 'Hawa', 'Keïta', 'F', now()),
 ('d0000000-0000-4000-8000-000000000406', 'd0000000-0000-4000-8000-000000000001', '2027-0006', 'Sékou', 'Touré', 'M', now());
INSERT INTO "Enrollment"("tenantId", "studentId", "classroomId", "academicYearId", status) VALUES
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000401', 'd0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000010', 'INSCRIT'),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000402', 'd0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000010', 'INSCRIT'),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000403', 'd0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000010', 'INSCRIT'),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000404', 'd0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000010', 'INSCRIT'),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000405', 'd0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000010', 'INSCRIT'),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000406', 'd0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000010', 'INSCRIT');
INSERT INTO "StudentGuardian"("tenantId", "studentId", "guardianId", relationship, "isPrimary") VALUES
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000401', 'd0000000-0000-4000-8000-000000000040', 'PERE', true),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000402', 'd0000000-0000-4000-8000-000000000040', 'PERE', true);
INSERT INTO "FeeType"(id, "tenantId", category, name) VALUES
 ('d0000000-0000-4000-8000-000000000501', 'd0000000-0000-4000-8000-000000000001', 'SCOLARITE', 'Scolarité annuelle'),
 ('d0000000-0000-4000-8000-000000000502', 'd0000000-0000-4000-8000-000000000001', 'INSCRIPTION', 'Inscription');
INSERT INTO "FeeRate"("tenantId", "feeTypeId", "levelId", "academicYearId", "amountGnf", installments) VALUES
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000501', 'd0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000010', 3600000, 3),
 ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000502', 'd0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000010', 250000, 1);

-- 4. SÉCURITÉ ---------------------------------------------------------------
-- >>> 001_rls.sql
-- =============================================================================
-- FATI UNIVERS — Isolation des établissements par Row-Level Security
-- =============================================================================
-- À exécuter APRÈS chaque `prisma migrate deploy` (script : npm run db:secure dans apps/api).
-- Le script est idempotent et couvre automatiquement toute nouvelle table
-- qui possède une colonne "tenantId" : impossible d'oublier une table.
--
-- Principe : l'API ouvre une transaction, puis fixe l'école active avec
--   SELECT set_config('app.tenant_id', '<uuid>', true);
--   SELECT set_config('app.user_id',   '<uuid>', true);
-- La base ne montre et n'accepte ensuite QUE les lignes de cette école.
-- Sans école active, aucune ligne n'est visible.
-- Seul le rôle fati_platform (super-administration) voit toutes les écoles,
-- grâce aux politiques « platform_all » limitées à ce rôle.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- 1. Toutes les tables d'école : isolation stricte sur "tenantId".
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenantId'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'Membership'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', r.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("tenantId" = app_current_tenant())
         WITH CHECK ("tenantId" = app_current_tenant())',
      r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS platform_all ON %I', r.table_name);
    EXECUTE format('CREATE POLICY platform_all ON %I TO fati_platform USING (true) WITH CHECK (true)', r.table_name);
  END LOOP;
END $$;

-- 2. Membership : visible pour l'école active OU pour le compte connecté
--    (nécessaire pour afficher « mes écoles » juste après la connexion).
--    L'écriture reste limitée à l'école active.
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_read ON "Membership";
DROP POLICY IF EXISTS membership_write ON "Membership";
DROP POLICY IF EXISTS membership_update ON "Membership";
DROP POLICY IF EXISTS membership_delete ON "Membership";
CREATE POLICY membership_read ON "Membership" FOR SELECT
  USING ("tenantId" = app_current_tenant() OR "userId" = app_current_user());
CREATE POLICY membership_write ON "Membership" FOR INSERT
  WITH CHECK ("tenantId" = app_current_tenant());
CREATE POLICY membership_update ON "Membership" FOR UPDATE
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
CREATE POLICY membership_delete ON "Membership" FOR DELETE
  USING ("tenantId" = app_current_tenant());
DROP POLICY IF EXISTS platform_all ON "Membership";
CREATE POLICY platform_all ON "Membership" TO fati_platform USING (true) WITH CHECK (true);

-- 3. Tenant (l'établissement lui-même) : on voit son école active et les
--    écoles où l'on a un rôle ; on ne modifie que l'école active. La création
--    et la suspension d'écoles passent par le rôle plateforme (fati_platform).
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON "Tenant";
DROP POLICY IF EXISTS tenant_update ON "Tenant";
CREATE POLICY tenant_read ON "Tenant" FOR SELECT
  USING (
    id = app_current_tenant()
    OR EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."tenantId" = "Tenant".id AND m."userId" = app_current_user() AND m."isActive"
    )
  );
CREATE POLICY tenant_update ON "Tenant" FOR UPDATE
  USING (id = app_current_tenant())
  WITH CHECK (id = app_current_tenant());
DROP POLICY IF EXISTS platform_all ON "Tenant";
CREATE POLICY platform_all ON "Tenant" TO fati_platform USING (true) WITH CHECK (true);

-- >>> 002_audit_append_only.sql
-- =============================================================================
-- Journal d'audit en AJOUT SEUL : aucune ligne ne peut être modifiée ou
-- supprimée, même par un bug de l'application.
-- =============================================================================

CREATE OR REPLACE FUNCTION fati_forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FATI: la table % est en ajout seul (% interdit)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS audit_append_only ON "AuditLog";
CREATE TRIGGER audit_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION fati_forbid_change();

-- >>> 003_finance_guards.sql
-- =============================================================================
-- Garde-fous financiers appliqués par la base elle-même.
-- =============================================================================

-- 1. Un paiement ne se supprime jamais (on l'annule avec un motif).
DROP TRIGGER IF EXISTS payment_no_delete ON "Payment";
CREATE TRIGGER payment_no_delete
  BEFORE DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION fati_forbid_change();

DROP TRIGGER IF EXISTS allocation_no_delete ON "PaymentAllocation";
CREATE TRIGGER allocation_no_delete
  BEFORE DELETE ON "PaymentAllocation"
  FOR EACH ROW EXECUTE FUNCTION fati_forbid_change();

-- 2. Un paiement confirmé est figé : seul le passage à ANNULE est permis,
--    avec un motif et l'identité de la personne qui annule.
CREATE OR REPLACE FUNCTION fati_payment_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'ANNULE' THEN
    RAISE EXCEPTION 'FATI: un paiement annulé ne peut plus être modifié';
  END IF;

  IF OLD.status = 'CONFIRME' THEN
    IF NEW."amountGnf" <> OLD."amountGnf"
       OR NEW."studentId" <> OLD."studentId"
       OR NEW.method <> OLD.method
       OR NEW."receiptNumber" IS DISTINCT FROM OLD."receiptNumber"
       OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" THEN
      RAISE EXCEPTION 'FATI: un paiement confirmé ne peut pas être modifié, seulement annulé';
    END IF;
    IF NEW.status NOT IN ('CONFIRME', 'ANNULE') THEN
      RAISE EXCEPTION 'FATI: transition de statut interdite % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF NEW.status = 'ANNULE' AND OLD.status <> 'ANNULE' THEN
    IF NEW."cancelReason" IS NULL OR length(trim(NEW."cancelReason")) < 5
       OR NEW."cancelledById" IS NULL OR NEW."cancelledAt" IS NULL THEN
      RAISE EXCEPTION 'FATI: annulation sans motif, sans auteur ou sans date';
    END IF;
  END IF;

  IF NEW.status = 'CONFIRME' AND NEW."receiptNumber" IS NULL THEN
    RAISE EXCEPTION 'FATI: un paiement confirmé doit avoir un numéro de reçu';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payment_guard ON "Payment";
CREATE TRIGGER payment_guard
  BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION fati_payment_guard();

-- 3. Montants toujours positifs.
ALTER TABLE "Payment"           DROP CONSTRAINT IF EXISTS payment_amount_positive;
ALTER TABLE "Payment"           ADD  CONSTRAINT payment_amount_positive CHECK ("amountGnf" > 0);
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT IF EXISTS allocation_amount_positive;
ALTER TABLE "PaymentAllocation" ADD  CONSTRAINT allocation_amount_positive CHECK ("amountGnf" > 0);
ALTER TABLE "Installment"       DROP CONSTRAINT IF EXISTS installment_amounts_valid;
ALTER TABLE "Installment"       ADD  CONSTRAINT installment_amounts_valid
  CHECK ("amountGnf" >= 0 AND "paidGnf" >= 0 AND "paidGnf" <= "amountGnf");
ALTER TABLE "InvoiceLine"       DROP CONSTRAINT IF EXISTS line_amounts_valid;
ALTER TABLE "InvoiceLine"       ADD  CONSTRAINT line_amounts_valid
  CHECK ("amountGnf" >= 0 AND "discountGnf" >= 0 AND "discountGnf" <= "amountGnf");

-- 4. Attribution atomique du prochain numéro de reçu (sans trou, sans
--    doublon, même avec plusieurs caisses en parallèle).
CREATE OR REPLACE FUNCTION fati_next_receipt_number() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  INSERT INTO "ReceiptCounter" ("tenantId", "nextNumber")
  VALUES (app_current_tenant(), 2)
  ON CONFLICT ("tenantId") DO UPDATE SET "nextNumber" = "ReceiptCounter"."nextNumber" + 1
  RETURNING "nextNumber" - 1 INTO n;
  RETURN n;
END $$;

-- >>> 004_grants.sql
-- =============================================================================
-- Droits des rôles applicatifs (idempotent, à relancer après chaque migration).
-- =============================================================================

GRANT USAGE ON SCHEMA public TO fati_app, fati_platform;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fati_app, fati_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fati_app, fati_platform;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO fati_app, fati_platform;

-- Le journal d'audit : lecture et ajout seulement.
REVOKE UPDATE, DELETE ON "AuditLog" FROM fati_app, fati_platform;

-- Les formules commerciales sont gérées par la plateforme uniquement.
REVOKE INSERT, UPDATE, DELETE ON "Plan" FROM fati_app;
-- Les écoles sont créées et supprimées par la plateforme uniquement.
REVOKE INSERT, DELETE ON "Tenant" FROM fati_app;

COMMIT;
-- Installation terminée. Vérification : SELECT count(*) FROM pg_tables WHERE schemaname = 'public'; doit renvoyer 44.
-- Les données des écoles sont masquées au propriétaire des tables : c'est la sécurité qui fonctionne.