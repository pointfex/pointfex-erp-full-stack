# CHRO KPI & XP System Audit & Gap Analysis Report (Pointfex ERP v4.2.0)

**Document Reference:** `docs/kpi-xp/CHRO_Requirements.pdf` (12 November 2026)  
**Branch:** `fix/kpi-xp-system-audit`  
**Date of Audit:** 25 November 2026 (02:00 AM Dispatch Checkpoint)  
**Assigned Lead:** Hamza (Team Lead) & Md. Shahriar Mahmud  
**Reviewer:** @udnfahim  

---

## 1. Executive Summary & Audit Overview

Following the engineering dispatch instructions, we audited the Pointfex ERP codebase against the official **Business Requirements & HR Policy for the KPI & XP System** memorandum from Soyebuzaman Naim (CHRO).

Our audit revealed that while an initial performance and gamification infrastructure exists, substantial portions of the backend math engine, API services, database assumptions, and frontend components were implemented against an earlier draft or legacy requirements (`Ismail/Business Requirements...` and `docs/kpi-xp/SRS.md`) rather than the mandatory policies established in `CHRO_Requirements.pdf`.

Below is the complete itemization of verified gaps, functional defects, and policy contradictions, categorized by section.

---

## 2. Comprehensive Gap Analysis by Requirement

### §1. Core Performance Philosophy & Task Weighting
| Requirement | `CHRO_Requirements.pdf` Specification | Current Codebase Implementation | Discrepancy & Severity |
|---|---|---|---|
| **Task Weights** | **Small = 1**, **Medium = 3**, **Large = 5**, **Critical = 7**, **Custom = CHRO-approved weight** | Hardcodes **Small = 1, Medium = 2, Large = 3, Critical = 5** in `schema.prisma`, `seed.ts`, `tasks.service.ts`, `kpi-engine.service.ts`, and frontend modals. | **CRITICAL:** Missing Medium=3, Large=5, Critical=7 standard. |
| **XP Allocation** | Exactly **10 × approved task weight** (Small=10 XP, Medium=30 XP, Large=50 XP, Critical=70 XP, Custom=10×weight) | `PerformanceXpLogsPage.tsx:55` calculates `(weightPoints) * 25`. `TasksService:1123` defaults to fallback points `2`. | **HIGH:** Discrepant XP multiplier in UI, inconsistent defaults. |
| **Massive XP Freeze** | Not part of `CHRO_Requirements.pdf` core task table (which mandates 10× approved weight). | `xp-engine.ts:24,31` freezes tasks $\ge 200\text{ XP}$ awaiting executive quorum. | **MEDIUM:** Unconfirmed freeze threshold blocks standard XP awards without explicit HR policy backing. |

---

### §2. Mandatory HR Controls & Penalties
| Requirement | `CHRO_Requirements.pdf` Specification | Current Codebase Implementation | Discrepancy & Severity |
|---|---|---|---|
| **§2.1 Inactivity Penalty** | Weekly KPI is recorded as `"N/A"` with a **red inactivity indicator**. N/A is a status, not a numerical zero. | Recorded as `status: 'NA', value: null`. However, `inactivity-engine.ts:11`, `kpi-formulas.ts:83-92`, and `weekly-sweep.service.ts` apply a **10% carry-forward deduction** to the employee's next deliverable. | **CRITICAL VIOLATION:** §2.4 explicitly mandates: *"No KPI deduction shall be applied to an N/A week, and no deduction shall carry forward from that week."* The 10% return penalty must be eliminated. |
| **§2.2 Performance Audit Log** | Immutable log tracking metric, previous & updated values, exact increase/decrease, timestamp, triggering event/task, authorizing executive/system rule. | `KpiEngineService.appendKpiAuditLog` sets `valueBefore = null, valueAfter = null`. `PerformanceReadService.getLedger` drops `resultingTotal`, `taskId`, and `authorizedBy.name`. | **HIGH:** Audit transactions lack complete before/after values and authorizer details. |
| **§2.3 Cross-Functional Evaluation (Multi-Squad)** | Overall weekly KPI = **arithmetic mean of numerical squad KPIs** for that week. Exclude all N/A squad results. If all squads are N/A, overall KPI is N/A. | Missing entirely. `kpi-formulas.ts:126` and `kpi-engine.service.ts:157` apply legacy context multipliers (`100% Main Squad, 70% Outside Squad, 50% Isolated Executive`) across pooled tasks. `WeeklyKpiRecord` has no squad partition. | **CRITICAL:** Replaced mandated squad mean with unapproved task multipliers. |
| **§2.4 Executive Disciplinary Authority** | CHRO and CEO each have **independent authority** to directly deduct **percentage points** from any numerical weekly KPI (e.g., 82 - 10 = 72). Neither requires approval from the other. Blocked on N/A weeks, no carry-forward, clamped 0–100. | `applyDisciplinaryDeduction` clamps with `Math.max(0, val)` (missing 100 upper clamp). `DisciplinaryService:84-141` creates disciplinary records even on N/A weeks! `ExecScoresService` and `WeeklySweepService` score recalculations wipe out active disciplinary deductions. | **CRITICAL:** N/A weeks receive deductions; subsequent task recalculations overwrite disciplinary adjustments. |

---

### §3. Task Approval & CHRO Verification Gate
| Requirement | `CHRO_Requirements.pdf` Specification | Current Codebase Implementation | Discrepancy & Severity |
|---|---|---|---|
| **§3.1 Weight Verification** | PM proposes weight on task creation/assignment; proposed weight **remains pending until verified by CHRO**. PM may revise before finalization but cannot approve or lock. | `TasksService:370-375` grants auto-approval if caller has `projects:read_all`. PM role template includes `projects:read_all`, so PM task creation auto-approves `TaskWeightVerification`! PMs can also edit `Task.weightPoints` directly via `PATCH /api/tasks/:id`. | **CRITICAL SECURITY BUG:** PMs can unilaterally approve and lock task weights on creation. |
| **§3.2 CHRO Override** | CHRO retains final authority to approve, modify, or reject proposed and previously finalized weights. | `PATCH /api/performance/chro/verify-weight/:id` cannot reject (hardcoded `APPROVED`). If weight is modified on an already approved task, it never recalculates XP. `POST /api/tasks/:id/verify-weight` is dead at runtime because `TasksService.xpLedger` is undefined (missing NestJS module DI). | **CRITICAL BUG:** CHRO verification throws runtime errors or fails to adjust XP for modified finalized weights. |
| **§3.3 XP Integrity & Adjustments** | XP derived strictly from CHRO-approved weight. For rewarded tasks: $\text{Adjustment} = 10 \times (\text{new approved weight} - \text{previous approved weight})$. Post signed difference as separate immutable audit transaction; do not overwrite or award twice. | `PATCH /api/tasks/:id/weight` appends full `newPoints * 10` XP without subtracting prior award (double-awarding). `WeeklySweepService:263-285` re-emits `VERIFY_RELEASE` every Sunday in an infinite loop. `xp-ledger.service.ts:203` reversal decrements only `postedXp`, leaking `pendingXp`. | **CRITICAL BUG:** Double-awarding XP and infinite sweep award loop. |

---

### §4. Organizational Evaluation Framework
| Requirement | `CHRO_Requirements.pdf` Specification | Current Codebase Implementation | Discrepancy & Severity |
|---|---|---|---|
| **§4.1 Developers & PM Evaluator Weights** | **40% PM + 15% CTO + 15% CPO + 15% CFO + 15% CHRO**. PM evaluates own performance (40% self-eval). Prepopulated executive scores are provisional and excluded until "Read/Approve". | Code uses **50% PM, 15% CTO, 15% CPO, 10% CFO, 10% CHRO** for Developers, and **30% CTO, 30% CPO, 20% CFO, 20% CHRO** for PMs (zero PM self-evaluation). Unapproved executive scores are included in calculation (`rawBase`). | **CRITICAL:** Wrong weights, missing PM self-eval, unapproved scores incorrectly count towards numerical KPI. |
| **§4.2 C-Level Executives** | **60% CEO + 10% CTO + 10% CFO + 10% CHRO + 10% CPO**. Each C-Level evaluates their own 10% component. | Code uses **40% CompanyGoal + 30% DomainExecution + 20% CEOReview + 10% PeerSynergy**. `ExecWeeklyKpiService:234` explicitly throws `ForbiddenException('Self-evaluation is strictly prohibited')`. | **CRITICAL:** Entire C-Level formula is obsolete; self-eval is mistakenly forbidden. |
| **Missing Evaluation Components (§4.1–§4.2)** | $\text{KPI} = \frac{\sum (\text{score} \times \text{weight})}{\sum (\text{included weights})}$. Do not treat unapproved scores as zero. If 0 official scores exist, show result as **pending** (inactivity rule takes precedence). | `taskScoreDeveloper` includes `UNREAD` scores. `weeklyKpiPm` defaults unread scores to `85`. Neither computes dynamic normalized mean of official scores. | **CRITICAL:** Missing components produce fake scores rather than normalized mean or `pending`. |

---

### §5. UI/UX Requirements
| Requirement | `CHRO_Requirements.pdf` Specification | Current Codebase Implementation | Discrepancy & Severity |
|---|---|---|---|
| **§5.1 Weekly KPI Trend** | Trend line with distinct **red markers for N/A inactivity weeks**. N/A must not be represented as numerical zero. | Markers render, but hover tooltip claims a "-10% inactivity penalty" will trigger on next deliverable. `kpiTrendSeries` converts all `score === null` weeks to `N/A`, confusing `pending` weeks with inactivity. | **MEDIUM:** Misleading tooltip text and status conflation. |
| **§5.2 Lifetime XP Progression** | Cumulative lifetime XP displayed via a **stacked bar chart color-coded by task weight category** (Small, Medium, Large, Critical, Custom) showing contribution over time. | `LifetimeXpStackedChart` renders only by status balance (Posted, Pending, Frozen). `breakdown` prop by category is completely ignored. | **HIGH:** Missing mandated category-based color-coded stacked bar visualization. |
| **§5.3 Audit Log Interface** | User-facing transaction history showing changes, timestamps, triggers, and authorizations per §2.2. | Exists in `MyPerformancePage.tsx` and `PerformanceLedgerPage.tsx`, but missing delta values for before/after and authorizer names due to backend DTO stripping. | **MEDIUM:** Data fidelity gap in displayed audit table. |

---

## 3. Runtime Architectural & Security Defects

1. **Broken Dependency Injection in `TasksModule`:**
   - `TasksModule` does not import `PerformanceModule`, leaving `TasksService.xpLedger` as `undefined`. Every task completion and weight verification silently fails to post ledger events.
2. **CPO Authentication Identity Collapse:**
   - `jwt.strategy.ts:30` and `employees.service.ts:85` collapse `'cpo'` into `'chro'`, preventing CPO from evaluating and erroneously granting CPO full CHRO authority.
3. **Missing `KPI_ENGINE_V2` Environment Configuration:**
   - Code falls back to unmaintained v1 pathways that bypass ledger and audit logging.

---

## 4. Remediation Plan & Execution Sequence

1. **Step 1: Fix Core Mathematical Engine (`backend/src/performance/kpi-engine/`)**
   - Align task weight scale: `SMALL=1, MEDIUM=3, LARGE=5, CRITICAL=7, CUSTOM`.
   - Update evaluator weights: Dev & PM to `40/15/15/15/15`; C-Level to `60/10/10/10/10` with authorized 10% self-eval.
   - Implement normalized partial scoring: $\text{KPI} = \frac{\sum (\text{score} \times \text{weight})}{\sum (\text{included weights})}$, returning `'PENDING'` if 0 official scores exist.
   - Implement multi-squad arithmetic mean rollup (excluding N/A squads).
   - Eliminate the 10% carry-forward inactivity penalty.
2. **Step 2: Fix Backend Services & Runtime Wiring**
   - Import `PerformanceModule` into `TasksModule`.
   - Prevent PM auto-approval of task weights on task creation (`isExecutive` check).
   - Correct CPO canonical role mapping.
   - Implement §3.3 signed adjustment $10 \times (\text{new} - \text{prev})$ for CHRO weight overrides.
   - Guard against duplicate `VERIFY_RELEASE` in weekly sweep.
   - Enforce §2.4 independent CHRO & CEO disciplinary deductions with N/A week rejection.
3. **Step 3: Fix Frontend UI & Visualizations**
   - Implement category-based stacked bar chart in `LifetimeXpStackedChart` (§5.2).
   - Update task weight dropdowns across PM, CTO, and CHRO consoles (`1/3/5/7`).
   - Clean up KPI trend line tooltips to remove references to the 10% carry-forward penalty.
4. **Step 4: Update Tests & Verification**
   - Update `kpi-engine.pure.spec.ts` and `kpi-engine.parity.spec.ts` to assert the verified formulas.
   - Run full gate verification (`lint`, `typecheck`, `test`, `build`).

---

## 5. Checkpoint 1 Progress Update (Ready for Email Dispatch)

**Subject:** Progress Update: CHRO KPI & XP System Audit & Verification (v4.2.0)  
**To:** Fahim Uddin (Project Manager — ERP Team | Pointfex)  
**From:** Hamza (Team Lead) & Md. Shahriar Mahmud  
**Branch:** `fix/kpi-xp-system-audit`  

> Hi Fahim,
>
> We have completed the full audit of the codebase against `CHRO_Requirements.pdf` (12 Nov 2026).
>
> **Key Findings:**
> 1. **Mathematical Engine:** Evaluator weights in the current code (50/15/15/10/10 for Dev, 30/30/20/20 for PM, 40/30/20/10 for C-Level) deviate from the memorandum requirements (40/15/15/15/15 for Dev/PM and 60/10/10/10/10 for C-Level).
> 2. **Task Weighting & XP:** Task weight categories were mapped as 1/2/3/5 instead of 1/3/5/7 (Custom = 10×weight).
> 3. **Inactivity Policy:** Code retained a legacy 10% carry-forward penalty on subsequent deliverables, which contradicts §2.1 and §2.4 (N/A status and red indicator only; no carry-forward).
> 4. **Runtime & Wiring:** Identified and traced a DI binding issue in `TasksService` (`xpLedger`), a CPO role mapping collapse, and PM task creation auto-approval.
> 5. **UI Requirements:** `LifetimeXpStackedChart` requires category-based color-coding (Small, Medium, Large, Critical, Custom) to satisfy §5.2.
>
> **Remaining Scope for 10:00 AM Final Delivery:**
> - Applying the mathematical formula and evaluator weight updates.
> - Adjusting the task weight verification and signed delta adjustment workflows.
> - Updating the category stacked bar chart in the frontend.
> - Re-verifying all backend and frontend test suites and ensuring green CI.
>
> We will proceed with the implementations on `fix/kpi-xp-system-audit` and keep you updated.
>
> Best regards,  
> Hamza & Shahriar
