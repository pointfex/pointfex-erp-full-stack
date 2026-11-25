-- Pointfex CFO Finance Suite (Additive Only Migration)
-- Creates FinanceConfig, FinanceAccount, LedgerTransaction, MoneyRequest,
-- SprintRanking, PayrollRun, BonusAward, PenaltyRecord, CommissionRecord, SprintLock
-- plus CHECK (balance >= 0) and append-only triggers on ledger_transactions.

-- 1. Create Enums Idempotently
DO $$ BEGIN
  CREATE TYPE "FinanceAccountType" AS ENUM ('COMPANY_FUND', 'SQUAD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LedgerRefKind" AS ENUM ('FINANCE_ACCOUNT', 'PERSONAL_WALLET', 'EXTERNAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LedgerTxStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED', 'REVERSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LedgerTxType" AS ENUM (
    'ADD_MONEY',
    'POOL_CREDIT',
    'TRANSFER',
    'EXECUTIVE_PAYROLL',
    'SQUAD_PAYROLL',
    'BONUS_AWARD',
    'PENALTY_SPLIT',
    'PENALTY_RESIDUAL',
    'CFO_COMMISSION',
    'REVERSAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MoneyRequestType" AS ENUM ('ADD_MONEY', 'POOL_CREDIT', 'TRANSFER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MoneyRequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PayrollRunKind" AS ENUM ('EXECUTIVE', 'SQUAD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BonusAwardStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PenaltyCategory" AS ENUM (
    'CODE_SMELL',
    'CTO_CONSULTANCY',
    'SLACKER',
    'SWAP_FIRE',
    'DEADLINE',
    'BLIND_QA'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PenaltyStatus" AS ENUM (
    'RECORDED',
    'PENDING_CEO_APPROVAL',
    'APPROVED',
    'REJECTED',
    'POSTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SprintRankingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SprintLockStatus" AS ENUM ('OPEN', 'PENDING_APPROVAL', 'LOCKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create Tables
CREATE TABLE IF NOT EXISTS "finance_configs" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "payrollRateBDT" DECIMAL(14,2) NOT NULL DEFAULT 2500,
    "commissionRatePct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "sprintPoolTotalBDT" DECIMAL(14,2) NOT NULL DEFAULT 150000,
    "squadOpeningSeedBDT" DECIMAL(14,2) NOT NULL DEFAULT 100000,
    "executivePayrollRoles" TEXT[] NOT NULL DEFAULT ARRAY['cto', 'cpo', 'cfo', 'chro']::TEXT[],
    "rankWeights" JSONB NOT NULL,
    "bonusTiers" JSONB NOT NULL,
    "penaltyTable" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "finance_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceAccountType" NOT NULL,
    "teamId" TEXT,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_accounts_balance_non_negative" CHECK ("balance" >= 0)
);

CREATE TABLE IF NOT EXISTS "ledger_transactions" (
    "id" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "type" "LedgerTxType" NOT NULL,
    "sourceKind" "LedgerRefKind" NOT NULL,
    "sourceRefId" TEXT NOT NULL,
    "destKind" "LedgerRefKind" NOT NULL,
    "destRefId" TEXT NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "teamId" TEXT,
    "employeeId" TEXT,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalRef" TEXT,
    "status" "LedgerTxStatus" NOT NULL DEFAULT 'PAID',
    "reversalOfId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "money_requests" (
    "id" TEXT NOT NULL,
    "type" "MoneyRequestType" NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "sourceKind" "LedgerRefKind" NOT NULL,
    "sourceRefId" TEXT NOT NULL,
    "destKind" "LedgerRefKind" NOT NULL,
    "destRefId" TEXT NOT NULL,
    "teamId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "purpose" TEXT,
    "status" "MoneyRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "requesterId" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "ledgerTransactionId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "money_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sprint_rankings" (
    "id" TEXT NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "entries" JSONB NOT NULL,
    "status" "SprintRankingStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "poolPostedAt" TIMESTAMP(3),
    "poolPostedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sprint_rankings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payroll_runs" (
    "id" TEXT NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "kind" "PayrollRunKind" NOT NULL,
    "teamId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "ratePerPerson" DECIMAL(14,2) NOT NULL,
    "headcount" INTEGER NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "rosterSnapshot" JSONB NOT NULL,
    "rosterChangeFlagConsumed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "executedById" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "bonus_awards" (
    "id" TEXT NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "teamId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "criteriaScores" JSONB NOT NULL,
    "totalScore" DECIMAL(5,2) NOT NULL,
    "evidence" TEXT NOT NULL,
    "tierAmount" DECIMAL(14,2) NOT NULL,
    "status" "BonusAwardStatus" NOT NULL DEFAULT 'SUBMITTED',
    "scoredById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "disbursedById" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "ledgerTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonus_awards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "penalty_records" (
    "id" TEXT NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "teamId" TEXT NOT NULL,
    "category" "PenaltyCategory" NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "recipientEmployeeId" TEXT,
    "recipientShare" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "companyFundShare" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PenaltyStatus" NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "triggersRosterChange" BOOLEAN NOT NULL DEFAULT false,
    "rosterChangeConsumedByRunId" TEXT,
    "ledgerTxIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "penalty_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "commission_records" (
    "id" TEXT NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "poolBaseAmount" DECIMAL(14,2) NOT NULL,
    "ratePct" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "cfoEmployeeId" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "ledgerTransactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sprint_locks" (
    "id" TEXT NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "status" "SprintLockStatus" NOT NULL DEFAULT 'OPEN',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sprint_locks_pkey" PRIMARY KEY ("id")
);

-- 3. Unique & Query Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "finance_accounts_code_key" ON "finance_accounts"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "finance_accounts_teamId_key" ON "finance_accounts"("teamId");
CREATE INDEX IF NOT EXISTS "finance_accounts_type_idx" ON "finance_accounts"("type");

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_referenceNo_key" ON "ledger_transactions"("referenceNo");
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_idempotencyKey_key" ON "ledger_transactions"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_reversalOfId_key" ON "ledger_transactions"("reversalOfId");
CREATE INDEX IF NOT EXISTS "ledger_transactions_sprintNumber_idx" ON "ledger_transactions"("sprintNumber");
CREATE INDEX IF NOT EXISTS "ledger_transactions_sourceKind_sourceRefId_idx" ON "ledger_transactions"("sourceKind", "sourceRefId");
CREATE INDEX IF NOT EXISTS "ledger_transactions_destKind_destRefId_idx" ON "ledger_transactions"("destKind", "destRefId");
CREATE INDEX IF NOT EXISTS "ledger_transactions_teamId_idx" ON "ledger_transactions"("teamId");
CREATE INDEX IF NOT EXISTS "ledger_transactions_employeeId_idx" ON "ledger_transactions"("employeeId");
CREATE INDEX IF NOT EXISTS "ledger_transactions_type_idx" ON "ledger_transactions"("type");
CREATE INDEX IF NOT EXISTS "ledger_transactions_status_idx" ON "ledger_transactions"("status");
CREATE INDEX IF NOT EXISTS "ledger_transactions_createdAt_idx" ON "ledger_transactions"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "money_requests_idempotencyKey_key" ON "money_requests"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "money_requests_type_sprintNumber_teamId_idx" ON "money_requests"("type", "sprintNumber", "teamId");
CREATE INDEX IF NOT EXISTS "money_requests_status_idx" ON "money_requests"("status");
CREATE INDEX IF NOT EXISTS "money_requests_requesterId_idx" ON "money_requests"("requesterId");

CREATE UNIQUE INDEX IF NOT EXISTS "sprint_rankings_sprintNumber_key" ON "sprint_rankings"("sprintNumber");
CREATE INDEX IF NOT EXISTS "sprint_rankings_status_idx" ON "sprint_rankings"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_runs_scopeKey_key" ON "payroll_runs"("scopeKey");
CREATE INDEX IF NOT EXISTS "payroll_runs_sprintNumber_kind_idx" ON "payroll_runs"("sprintNumber", "kind");
CREATE INDEX IF NOT EXISTS "payroll_runs_teamId_idx" ON "payroll_runs"("teamId");

CREATE UNIQUE INDEX IF NOT EXISTS "bonus_awards_sprintNumber_teamId_employeeId_key" ON "bonus_awards"("sprintNumber", "teamId", "employeeId");
CREATE INDEX IF NOT EXISTS "bonus_awards_sprintNumber_teamId_status_idx" ON "bonus_awards"("sprintNumber", "teamId", "status");
CREATE INDEX IF NOT EXISTS "bonus_awards_employeeId_idx" ON "bonus_awards"("employeeId");

CREATE INDEX IF NOT EXISTS "penalty_records_teamId_triggersRosterChange_idx" ON "penalty_records"("teamId", "triggersRosterChange");
CREATE INDEX IF NOT EXISTS "penalty_records_sprintNumber_teamId_idx" ON "penalty_records"("sprintNumber", "teamId");
CREATE INDEX IF NOT EXISTS "penalty_records_status_idx" ON "penalty_records"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "commission_records_sprintNumber_key" ON "commission_records"("sprintNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "sprint_locks_sprintNumber_key" ON "sprint_locks"("sprintNumber");

-- 4. Foreign Keys
DO $$ BEGIN
  ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reversalOfId_fkey"
    FOREIGN KEY ("reversalOfId") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 5. Append-Only Immutability Triggers on ledger_transactions
CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table "%" is strictly append-only and tamper-evident; UPDATE and DELETE operations are prohibited.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_transactions_immutable ON "ledger_transactions";
CREATE TRIGGER trg_ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS trg_ledger_transactions_no_truncate ON "ledger_transactions";
CREATE TRIGGER trg_ledger_transactions_no_truncate
BEFORE TRUNCATE ON "ledger_transactions"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_mutation();

REVOKE TRUNCATE ON "ledger_transactions" FROM PUBLIC;

-- Sync missing tasks.projectPercentage column for clean DB deployments
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "projectPercentage" DECIMAL(5,2) DEFAULT 0;
