# Pointfex ERP (`v4.0.0`)

Production-grade, Zero-Trust Enterprise Resource Planning (ERP) platform built with **NestJS + TypeScript + Prisma + PostgreSQL (Neon)** and **React 19 + TypeScript + Vite + Tailwind CSS**.

Engineered for strict organizational governance, server-enforced role tiers, executive voting consensus, maker-checker segregation of duties (SoD), time-boxed authority delegations, tamper-evident audit logging, hierarchical KPI & XP gamification suite, and resilient serverless deployment on Vercel.

---

## 1. System Architecture

```text
                               ┌───────────────────────────────────────────────┐
                               │           Client Browser (React 19 SPA)      │
                               │  - Cross-Tab BroadcastChannel Logout Sync     │
                               │  - 30-min Idle Timeout with 60s Warning Modal │
                               │  - Unified Design System & Reactive States   │
                               │  - Live Password Strength Meter (Policy Rules)│
                               └──────────────────────┬────────────────────────┘
                                                      │ HTTPS / HttpOnly SameSite=Strict Cookies
                                                      │ X-MFA-Code, X-MFA-Action, X-MFA-Target
                                                      ▼
                               ┌───────────────────────────────────────────────┐
                               │            Vercel Edge / SPA Router           │
                               │  - SPA Fallback: /index.html (no-cache)       │
                               │  - Static Assets: /assets/* (immutable 1 yr)  │
                               │  - API Rewrites: /api/(.*) -> Backend Origin  │
                               └──────────────────────┬────────────────────────┘
                                                      │
                                                      ▼
                               ┌───────────────────────────────────────────────┐
                               │         NestJS Serverless API Engine          │
                               │  ├── Authentication Guards:                   │
                               │  │   ├── JwtAuthGuard (Family Refresh Token)  │
                               │  │   ├── FreshMfaGuard (±1 step TOTP & Replay)│
                               │  │   └── PermissionsGuard (Dynamic PBAC)      │
                               │  ├── Performance & Gamification (v4.0.0):     │
                               │  │   ├── Pure KPI Engine (Mathematical Parity)│
                               │  │   ├── Event-Sourced XP Ledger (ADR-001 A)  │
                               │  │   ├── Advisory Lock Concurrency (pg_lock)  │
                               │  │   ├── Frozen-XP Consensus Quorum (>50% C)  │
                               │  │   ├── PM Milestone XP Invariant            │
                               │  │   └── Idempotent Weekly Sweep (Dhaka Time) │
                               │  ├── Governance & Authorization:              │
                               │  │   ├── Tier Ceiling (CEO > EXEC > MGR > STF)│
                               │  │   ├── CEO Direct Power (Instant Apply)     │
                               │  │   ├── Executive Voting Engine (50%+ Pass)  │
                               │  │   ├── Strict Permission-View Sync (PBAC)   │
                               │  │   └── Disciplinary Deductions (1-100 Pts)  │
                               │  ├── Security & Automation:                   │
                               │  │   ├── Automated Sweeper (/api/cron/sweep)  │
                               │  │   ├── Allowlist Engine (CEO Exact Emails)  │
                               │  │   └── Hash-Chained Audit Trail (SHA-256)   │
                               └──────────────────────┬────────────────────────┘
                                                      │
                                                      ▼
                               ┌───────────────────────────────────────────────┐
                               │          PostgreSQL (Neon Serverless)         │
                               │  - Runtime Pool: PgBouncer (pointfex_app)     │
                               │  - Direct Owner URL: Prisma additive migrates │
                               └───────────────────────────────────────────────┘
```

---

## 2. Key Capabilities (`v4.0.0`)

### A. Pointfex KPI & XP Governance Suite (Core Engine)
- **Top Priority Hero Placement:** Dynamic KPI Trend Line Graph and Career XP Stacked Bar Chart in the top priority hero segment for all roles (Developer, PM, C-Level, CEO).
- **Pure Mathematical Engine (`backend/src/performance/kpi-engine/`):**
  - Completely decoupled, dependency-free TypeScript engine operating with deterministic precision and verified mathematical parity across legacy formulas.
  - **Level 1 (Developers):** 50% PM Score, 15% CTO, 15% CPO, 10% CFO, 10% CHRO with auto-drafted C-Level score requiring read-receipt confirmation. Context multipliers: Main Squad (100%), Outside Squad (70%), Isolated Executive Task (50%).
  - **Level 2 (Project Managers):** 30% CTO, 30% CPO, 20% CFO, 20% CHRO based on squad outcomes. PMs receive XP strictly from macro project milestones upon C-Level sign-off, bypassing self-assigned micro-tasks.
  - **Level 3 (C-Level):** 40% Macro Goals, 30% Domain Execution (squad average), 20% CEO Review, 10% Peer Synergy.
  - **Level 4 (CEO):** 60% Company Performance, 40% C-Level Aggregate.
- **Event-Sourced XP Ledger (`xp_ledger_entries`, ADR-001 Option A):**
  - Ledger rows are strictly immutable events (`AWARD_PENDING`, `VERIFY_RELEASE`, `FREEZE`, `RELEASE_FROZEN`, `REVERSAL`, `ADJUSTMENT`).
  - High-concurrency write protection via PostgreSQL transactional advisory locks (`pg_advisory_xact_lock(hash(userId))`), guaranteeing gap-free sequences and SHA-256 hash chains per employee.
  - Materialized projections cached in mutable `xp_balances` with drift verification.
- **Frozen-XP Consensus Quorum (`FrozenXpConsensusService`):**
  - Massive XP threshold ($\ge 200\text{ XP}$) automatically opens a 7-day executive consensus request.
  - Quorum rule: strictly more than half ($> 50\%$) of active eligible C-Suite seats (`CTO`, `CPO`, `CFO`, `CHRO`), excluding proposer and beneficiary. Double-voting prevented; fresh MFA required.
- **CHRO Task Weight Gate & Disciplinary Governance:**
  - Tasks with proposed weights require formal pre-verification by CHRO (`2023200000066@seu.edu.bd`) prior to XP release.
  - Formal disciplinary deductions ($1 \le p \le 100$) require legal/HR reference documentation and produce compensatory reversal entries if contested.
  - Discretionary cash inputs (`MoneyInput`, BDT cash bonuses/penalties) removed from CHRO consoles in favor of Commendation XP (+10, +25, +50, +100 XP) and KPI percentage points.
- **Automated Idempotent Weekly Sweep (`/api/cron/sweep`):**
  - Evaluates Asia/Dhaka calendar weeks (Monday 00:00 to Sunday 23:59:59.999 Dhaka time / UTC+6).
  - Automatically flags zero-deliverable staff as `NA` (`INACTIVE`) and enqueues exactly one FIFO inactivity penalty (10% deduction on next deliverable upon return).
  - Audits hash-chain integrity, runs balance drift reconciliation, and closes backfill windows.
- **Public Company Leaderboard (`/leaderboard`):**
  - Universal public read access granted across all employee tiers (`@RequireAnyPermission('leaderboards:read', 'tasks:read_own', ...)`).
  - Data minimization strips sensitive financial data while normalizing unrecorded or inactive states cleanly to `0.00` and `0 XP`.

### B. Permission-View Synchronization & Access Control
- **Strict Role-View Synchronization:**
  - Scoped `access-control` strictly to CEO and root administrators (`roles:read`, `roles:create`, `system:root`).
  - Non-root users (including CHRO) cannot access or trigger errors from the CEO Role Capability Matrix.
  - CEO Role Creator MFA aligned with target equivalence (`'new'` and `'global'`) for smooth entity generation.
- **Real Institutional Staff Roster (`@seu.edu.bd`):**
  - 33 legacy dummy `@pointfex.internal` accounts suspended (`isSuspended: true`).
  - Strict institutional domain filtering enforces that only real verified university staff accounts are loaded across directories, squads, and leaderboards.

### C. Role Authority Tiers & Server-Enforced Ceiling
- **Four Standard Tiers:** `CEO` (implicit for `system:root`), `EXECUTIVE` (C-level: CTO, CFO, CHRO, COO, CPO, CRO), `MANAGER` (PM, Squad Lead), and `STAFF` (Developers, Designers, Operations).
- **Strict Tier Ceiling Law:** Implemented server-side in guards and domain services. An actor may only inspect access details or modify personnel in a **strictly lower tier** (`isStrictlyLowerTier`).
- **Executive Restrictions:**
  - Executives cannot change or request changes for peers (`EXECUTIVE`), the `CEO`, or themselves (403 Forbidden).
  - Executives can only submit requests for `MANAGER` and `STAFF` users, routing directly to the CEO.

### D. Fixed CEO & Zero-Trust Governance
- **Immutable CEO Anchor:** Exactly one active holder of `system:root` matching `CEO_EMAIL` (`noor@seu.edu.bd`), verified at startup. The `system:root` user cannot be deleted, suspended, demoted, or edited via application endpoints.
- **CEO Transfer Disabled:** Governed by `CEO_TRANSFER_ENABLED=false` (default). In-app CEO transfer cards, modals, and succession endpoints return `404 Not Found`.
- **CEO Direct Authority:** Actions taken by the CEO (role creation, permission edits, user assignments, suspensions, team updates) take effect **immediately**. No approval requests are spawned for the CEO. Mandatory: fresh 6-digit MFA, audit log, and history entry.
- **CEO Identity Update (`PATCH /api/employees/:id/identity`):** CEO can update any user's legal name and email. Requires fresh MFA; auto-adds email to allowlist, revokes active sessions, unlinks external Google accounts, and notifies both addresses.
- **Offline Emergency Recovery:** Database-level CLI procedure `npm run ceo:reset-mfa` documented in [docs/security-runbook.md](docs/security-runbook.md).

### E. Executive Voting Engine & Project Lifecycle
- **Voting Engine (`VoteEngineService`):**
  - Eligible voters = active holders of `votes:cast` excluding the requester.
  - Finalizes as `APPROVED` when strictly more than half of all eligible voters approve (`> Math.floor(N/2)`).
  - Finalizes as `REJECTED` early when approval is mathematically unreachable.
  - Automatic expiration on `voteDeadline` (default 7 days).
  - Executives verify votes via fresh MFA (`votes:cast` bound to request ID).
  - CEO holds direct override authority (approve/reject with MFA + reason).
- **Project Creation Stepper (`/project-requests`):**
  - 5-step wizard: Details & Scope, Deliverables & Timeline, Team Staffing, Risks & Success Criteria, Budget & Justification.
  - **Single Source of Truth for Budget:** This stepper is the ONLY place where an initial project budget in BDT is set. Upon approval, automatically provisions the project in Planning.
- **Developer Proposals & Confidential Grievances (`/proposals`):**
  - Any developer can submit ideas (problem, solution, benefits) to their PM.
  - PM triage: Forward to Executive Vote (crediting developer), Return for revisions, or Decline.
  - **Confidential Grievance Mode:** Bypasses PM and squad entirely, routing confidentially to HR leadership.

### F. Unified Inbox, Session Security & Design System
- **Shared `MfaConfirmModal`:** Standardized across button clicks and keyboard shortcuts (`a` approve, `r` reject). Auto-focuses 6-digit input, supports clipboard paste, auto-submits, and enforces written justification.
- **TOTP Tolerance:** Accepts ±1 step clock tolerance (±30s skew) with single-use replay protection.
- **30-Minute Idle Timeout:** Global activity monitor with 1-minute countdown warning modal.
- **Cross-Tab Logout:** Connected `BroadcastChannel('pointfex-auth')` so logging out in one window instantly signs out all other open tabs.
- **Modern Design System Tokens:** 100% token-based colors (light & dark mode), unified component library (`DataTable`, `Modal`, `Tabs`, `StatCard`, `EmptyState`, `ErrorState`), global error boundaries, and mobile responsiveness.

---

## 3. Role & Access Matrix (Tier Hierarchy)

| Function | CEO (`system:root`) | Executive (CTO, CFO, CHRO, etc.) | Manager (PM, Squad Lead) | Staff (Developer, Designer) |
| --- | :---: | :---: | :---: | :---: |
| **Authority Tier** | `CEO` | `EXECUTIVE` | `MANAGER` | `STAFF` |
| **People Directory** | Full Profile & History | Full Profile & History | Minimal DTO + Squad Access | Minimal Public DTO |
| **Inspect Access Details** | Anyone | Lower Tiers (Read-Only) | Assigned Squad Devs (Read-Only) | Self Only |
| **Access History Ledger** | Full Read & Export | Full Read & Export | ❌ Hidden (403) | ❌ Hidden (403) |
| **Role Assignment / Revoke** | Direct (Immediate) | Request-Only (for Lower Tiers) | ❌ None | ❌ None |
| **Role Capability Matrix** | Full Management | ❌ None | ❌ None | ❌ None |
| **Delegation Controls** | See All & Revoke Any | Delegate Held & Revoke Own | Receive Only | Receive Only |
| **Edit Name & Work Email** | Direct (MFA + Audit) | ❌ None | ❌ None | ❌ None |
| **Teams & Squads** | Manage Mode | Manage Mode | Read-Only (Assigned Squad) | Read-Only (Assigned Squad) |
| **Project Creation** | Direct / Stepper | Stepper & Cast Vote | Request-Only | Submit Proposals |
| **Executive Voting Engine** | Override (Approve/Reject)| Cast Vote (`votes:cast`) | ❌ None | ❌ None |
| **Company Leaderboard** | Public Read (`0.00`/XP) | Public Read (`0.00`/XP) | Public Read (`0.00`/XP) | Public Read (`0.00`/XP) |

---

## 4. Environment Variables Checklist

### Backend (`backend/.env`)
```bash
# --- Application ---
NODE_ENV="production"
PORT=3000
FRONTEND_URL="https://your-frontend.vercel.app"

# --- Database (Neon) ---
DATABASE_URL="postgresql://pointfex_app:PASSWORD@ep-xyz-pooler.neon.tech/pointfex_erp?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://db_owner:PASSWORD@ep-xyz.neon.tech/pointfex_erp?sslmode=require"

# --- Authentication & Session Hardening ---
JWT_SECRET="<generate-random-64-character-string>"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_DAYS="7"
COOKIE_SECURE="true"
COOKIE_SAME_SITE="strict"

# --- Governance & Security Invariants ---
CEO_EMAIL="noor@seu.edu.bd"
CEO_TRANSFER_ENABLED="false"
CRON_SECRET="<generate-random-32-character-secret>"
VOTE_DEADLINE_DAYS="7"
AUTHZ_MODE="enforce"
PBAC_MODE="enforce"
CORS_ORIGIN="https://your-frontend.vercel.app"

# --- Email & OAuth ---
RESEND_API_KEY="re_..."
MAIL_FROM="Pointfex ERP <no-reply@pointfex.com>"
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
GOOGLE_CALLBACK_URL="https://your-backend.vercel.app/api/auth/google/callback"
```

### Frontend (`frontend/.env`)
```bash
VITE_API_BASE_URL="/api"
```

---

## 5. Deployment & Production Operations

### A. Deploy Database Migrations to Neon (Additive Only)
Run this single command from your terminal:
```bash
cd backend && npx prisma migrate deploy
```
*(Never run `prisma migrate reset` or `prisma migrate dev` against production).*

### B. Google Cloud Console Redirect URI
Register the exact redirect URI in **Google Cloud Console > Credentials > OAuth 2.0 Web Client**:
```
https://backend-erp-pointfex.vercel.app/api/auth/google/callback
```

### C. Verification Test Suite
Run comprehensive verification across both packages:
```bash
# Backend unit, integration, and governance test suites (30 suites, 615 passed)
npm --prefix backend test -- --runInBand

# Backend production build (0 errors)
npm --prefix backend run build

# Frontend verification (typecheck, lint, 27 tests, and Vite build)
npm --prefix frontend run verify
```

---

## 6. Complete Documentation Catalog

- [docs/README.md](docs/README.md) — Master Documentation Portal & Architecture Index
- [docs/KPI_XP_SYSTEM_MANUAL.md](docs/KPI_XP_SYSTEM_MANUAL.md) — Master KPI & XP Engine Manual (Formulas, Sweeps, Consensus)
- [docs/kpi-xp/](docs/kpi-xp/) — Core Engine Specs: ADR-001 (Ledger), Architecture, SRS, Parity Analysis & Migration Notes
- [docs/authorization.md](docs/authorization.md) — PBAC Architecture, Dynamic Roles, MFA Guards, and Delegations
- [docs/permissions_master.md](docs/permissions_master.md) — Complete 606+ granular permission catalog across 21 modules
- [docs/api.md](docs/api.md) — Backend REST API endpoints and payload reference
- [docs/security-runbook.md](docs/security-runbook.md) — Key rotation, emergency CEO MFA reset CLI, and incident response
- [docs/vercel-deployment.md](docs/vercel-deployment.md) — Detailed Vercel deployment, Cron sweep, and OAuth guide
- [docs/archive/](docs/archive/) — Historical phase audits, legacy discovery reports, and migration notes

---

## License
Proprietary & Confidential — Pointfex Engineering. All Rights Reserved.
