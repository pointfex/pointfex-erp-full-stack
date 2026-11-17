# Pointfex ERP Documentation Portal

> **Release Version**: `4.0.0` (Production Ready)  
> **Target Deployment**: Vercel (Frontend & Serverless API) + Neon PostgreSQL (Database)  
> **Core Architecture**: NestJS (TypeScript) + React 19 (Vite + Tailwind) + Prisma ORM  

Welcome to the authoritative documentation portal for **Pointfex ERP v4.0.0**. This directory contains the master specifications, system manuals, API contracts, and deployment runbooks for the enterprise platform.

---

## 📚 Master Documentation Index

### 1. KPI & Career XP Governance Suite (Core Engine)
The heart of Pointfex ERP is an append-only, cryptographically verified performance governance system governed by the CHRO Memorandum and executive consensus protocols:
- [KPI & XP System Manual](file:///home/udnfahim/Downloads/pointfex/docs/KPI_XP_SYSTEM_MANUAL.md): Complete guide to formulas, score calculation, Asia/Dhaka week boundaries, 4-tier score scaling, consensus quorum, and automated idempotent weekly sweeps.
- [KPI/XP Architecture & Engine Design](file:///home/udnfahim/Downloads/pointfex/docs/kpi-xp/ARCHITECTURE.md): Service boundaries, pure calculation pipeline (`kpi-engine/`), and transaction orchestration.
- [ADR-001: Event-Sourced XP Ledger](file:///home/udnfahim/Downloads/pointfex/docs/kpi-xp/ADR-001-xp-ledger-state.md): Architectural decision record approving Option A (immutable event log with advisory locking and cached balance projections).
- [Software Requirements Specification (SRS)](file:///home/udnfahim/Downloads/pointfex/docs/kpi-xp/SRS.md): Formal requirement specifications for tasks, weight verification, executive read-receipts, and consensus release.
- [Engine Mathematical Parity Analysis](file:///home/udnfahim/Downloads/pointfex/docs/kpi-xp/ENGINE_PARITY.md): Proof of exact parity across legacy calculations and the modernized pure TypeScript engine.
- [Additive Migration Notes](file:///home/udnfahim/Downloads/pointfex/docs/kpi-xp/MIGRATION_NOTES.md): Database schema delta notes with zero-downtime, non-destructive migration rules.

### 2. Authorization, PBAC & Security
Pointfex utilizes Permission-Based Access Control (PBAC) with scope resolution, horizontal C-level barriers, and strict separation of duties:
- [Authorization & Security Architecture](file:///home/udnfahim/Downloads/pointfex/docs/authorization.md): PBAC engine, dynamic custom roles, hierarchical scope resolution (`SELF` $\to$ `SQUAD` $\to$ `ORG` $\to$ `GLOBAL`), and delegation mechanics.
- [Master Permissions Catalog](file:///home/udnfahim/Downloads/pointfex/docs/permissions_master.md): Authoritative catalog of all 606+ granular capability codes organized into modules `00` through `20`.
- [Security Runbook & Operations](file:///home/udnfahim/Downloads/pointfex/docs/security-runbook.md): Administrative SOPs for 6-digit MFA enforcement, session invalidation, and CEO succession protocols.

### 3. API & Deployment
- [REST API Reference](file:///home/udnfahim/Downloads/pointfex/docs/api.md): Exhaustive endpoint contracts covering authentication, tasks, performance, wallets, budgets, and executive governance.
- [Vercel & Neon Production Deployment](file:///home/udnfahim/Downloads/pointfex/docs/vercel-deployment.md): Infrastructure guide for environment variables, Neon PostgreSQL connection pooling, and Vercel edge build pipelines.

### 4. Historical Archive
- [Documentation Archive](file:///home/udnfahim/Downloads/pointfex/docs/archive): Historical phase audits, initial legacy gap analyses, and preliminary implementation notes preserved for audit compliance.

---

## 🏛️ Core Governance Invariants

Every change made to this repository must honor the following invariants:
1. **CEO Sovereignty & Immutable Anchor**: The CEO (`noor@seu.edu.bd`, `emp_ceo_01`) holds permanent `system:root` authority and cannot be suspended, demoted, or deleted via software.
2. **Append-Only Immutability**: The KPI ledger, XP events, and audit logs are append-only. Rows are never mutated or deleted; adjustments and reversals are handled via compensatory entries.
3. **MFA Guarded Sensitive Actions**: Critical operations (financial transfers, disciplinary deductions, consensus voting, role modifications) strictly enforce 6-digit TOTP verification via `FreshMfaGuard`.
4. **Institutional Integrity**: All real employee accounts are restricted to the institutional domain (`@seu.edu.bd`). Dummy seed accounts (`@pointfex.internal`) remain suspended from active business operations.
5. **Universal Transparency**: The public leaderboard is accessible to all verified employees with sensitive financial fields stripped, normalizing unrecorded states to `0.00` and `0 XP`.

