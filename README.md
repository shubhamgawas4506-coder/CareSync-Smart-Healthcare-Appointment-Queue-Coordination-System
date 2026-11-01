# Jiva — Smart Healthcare Appointment & Queue Coordination System

**Jiva** is an architecture-focused outpatient healthcare appointment scheduling, live check-in queue coordination, idempotent booking recovery, and clinical audit prototype built for **Mobile Architecture Lab 4 (MAL 4)**.

> **Scope & Safety Disclosure:** Jiva is an appointment and queue coordination prototype—**not** a medical diagnosis, clinical decision-support, or emergency triage application. Demo role switching is provided for architectural workflow verification and is **not** real authentication or authorization.

---

## 1. Quick Start, Verification & Build Commands

### Prerequisites
- Node.js `>= 20` (tested on Node 22 with `tsx` and Vite 8)

### Install Dependencies
```bash
npm install
```

### Start Development Server (Port 3000)
```bash
npm run dev
```
Open `http://localhost:3000` in your browser (append `?autostart=1` or `?role=patient|doctor|coordinator` to jump directly into a specific role workspace).

### Run Type Checks
```bash
npm run lint
```

### Run Automated Unit & Integration Tests (`node:test`)
```bash
npm test
# or directly:
npx --yes tsx --test src/tests/coordination.test.ts
```

### Build Production Bundle
```bash
npm run build
```

---

## 2. Core Features & Architectural Capabilities

1. **Three Tailored Role Workspaces (10 Screens Total):**
   - **Welcome & Role Selection:** Live clinic snapshot, non-diagnostic scope notice, and persona-aware entry into Patient, Doctor, or Clinic Coordinator workspaces.
   - **Patient Portal (5 Views):** Dashboard Overview, Specialist Directory & Intelligent Slot Booking, Booking Confirmation Receipt, Appointment History (with atomic Rescheduling & Cancellation), and Live Queue Tracking.
   - **Doctor Workstation:** Split-pane clinical roster, patient visit dossier, valid state-machine transition controls (`Check In`, `Start Consultation`, `Complete`, `Cancel with Reason`), and per-appointment audit trail.
   - **Clinic Coordinator Command (3 Views):** Multi-suite live queue supervision, Specialist Slot Manager (`Available` / `Blocked` / custom slot creation), configurable Clinic Policy (`allowCheckedInCancellation`), **Interactive Failure, Retry & Conflict Lab**, Clinic Appointment Ledger, and **Audit Logs & Diagnostics**.
2. **Deterministic Lifecycle State Machine (`src/domain/stateMachine.ts`):**
   - Enforces `Available → Booked → Checked In → In Consultation → Completed`, `Booked → Cancelled` (releases slot), `Booked → Rescheduled` (atomic slot swap), and policy-gated `Checked In → Cancelled`.
3. **Safe Idempotent Booking & Interrupted Request Recovery (`src/application/coordinationService.ts`):**
   - Assigns a stable client `requestId` (`req_<epoch>_<nonce>`).
   - Simulates mid-flight network drops (`UNCERTAIN_INTERRUPTED`), clearly distinguishing uncertain outcomes from confirmed domain rejections (`SLOT_CONFLICT`, `PAST_SLOT`).
   - Persists interrupted requests across full browser reloads (`recoverInterruptedRequests()`) and guarantees **strictly one** confirmed appointment across retries.
4. **Smart Patient Queue (`src/domain/queueEngine.ts`):**
   - Derives live waiting position and formula-backed wait-time estimates (`activeRemaining + (position - 1) × avgConsultMinutes`) directly from canonical appointment states, explicitly labeled as operational estimates rather than guarantees.

---

## 3. Repository & Module Structure

```text
/
├── docs/                                         # MAL 4 Architecture Deliverables
│   ├── 01-solution-brief.md                      # One-page solution brief
│   ├── 02-high-level-design.md                   # HLD, layered diagram, data flow & source of truth
│   ├── 03-low-level-design.md                    # LLD, interfaces, state machine & queue math
│   ├── 04-verification-and-demo-guide.md         # Walkthroughs & actual automated test outcomes
│   ├── 05-future-multi-branch-evolution.md       # Multi-branch & cross-location evolution analysis
│   └── adr/
│       ├── ADR-001-persistence-strategy.md
│       ├── ADR-002-appointment-state-management.md
│       ├── ADR-003-idempotent-booking-and-retry.md
│       ├── ADR-004-slot-conflict-prevention.md
│       └── ADR-005-audit-logging-and-diagnostics.md
├── src/
│   ├── domain/                                   # Pure business logic (zero UI/storage imports)
│   │   ├── models.ts                             # Entities, enums & DomainRuleError
│   │   ├── stateMachine.ts                       # Lifecycle transitions & clinic policy enforcement
│   │   ├── schedulingRules.ts                    # Double-defense slot & patient conflict checks
│   │   ├── queueEngine.ts                        # Deterministic check-in queue & wait-time math
│   │   └── timeUtils.ts                          # Integer UTC epoch <-> IANA timezone utilities
│   ├── diagnostics/
│   │   └── diagnosticsLogger.ts                  # Structured operational & fault telemetry
│   ├── repositories/
│   │   ├── interfaces.ts                         # ICareSyncRepository & IStorageAdapter contracts
│   │   ├── localStorageRepository.ts             # Atomic draft-clone persistence & fault rollback
│   │   └── seedData.ts                           # Deterministic fictional clinical seed dataset
│   ├── application/
│   │   └── coordinationService.ts                # Use cases, idempotency reconciliation & recovery
│   ├── presentation/                             # Role-tailored React UI (Light & Dark themes)
│   │   ├── CareSyncContext.tsx
│   │   ├── assets.tsx
│   │   ├── components/StatusPrimitives.tsx
│   │   └── screens/
│   └── tests/
│       └── coordination.test.ts                  # Automated node:test verification suite (10 tests)
└── README.md
```

---

## 4. Simulated Behaviours & Honest Prototype Limitations

| Area | Prototype Implementation | Production Multi-User Requirement |
| :--- | :--- | :--- |
| **Persistence** | Browser `localStorage` atomic JSON snapshot (`LocalStorageCareSyncRepository`). Survives refresh/restart on **one browser/device**. | Server-side relational database (PostgreSQL) with `SELECT ... FOR UPDATE` locks and GiST exclusion constraints. |
| **Multi-User Sync** | Instant role-switching within the same browser profile; **no** cross-device synchronization claimed. | Backend REST/gRPC API + WebSockets / SSE for live multi-terminal queue updates. |
| **Authentication** | Unauthenticated Demo Role & Persona Selector for rapid evaluation. | OIDC / OAuth2 JWT sessions with server-enforced RBAC and patient MRN scoping. |
| **Network & Storage Faults** | Deterministic opt-in toggles (*Simulate network interruption* in Booking/Lab; *Inject Storage Write Failure* in Diagnostics). | Real HTTP timeout/retry exponential backoff + distributed idempotency key store + cloud observability. |
