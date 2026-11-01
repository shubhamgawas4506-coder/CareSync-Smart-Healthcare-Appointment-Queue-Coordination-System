# ADR-001: Persistence Strategy — Atomic Snapshot Repository over Browser LocalStorage

- **Status:** Accepted
- **Date:** 2026-11-01

## Context
CareSync requires durable persistence across browser refreshes and restarts for a single-device hackathon prototype without introducing external cloud database dependencies, while preventing partial/inconsistent writes across `appointments`, `timeSlots`, `patients`, `bookingRequests`, and `events`.

## Alternatives Considered
1. **In-Memory React State Only:** Fast to build, but loses all appointments and interrupted booking records on page refresh (violating persistence and recovery requirements).
2. **Separate `localStorage` Keys per Entity Collection (`caresync_slots`, `caresync_appointments`, etc.):** Susceptible to partial-write corruption if `setItem()` succeeds on `appointments` but throws a quota error before updating `timeSlots` or `events`.
3. **IndexedDB Multi-Store Transactions:** Supports larger payloads and asynchronous object-store transactions, but introduces async callback complexity across a lightweight prototype dataset (<100 KB).
4. **Single Versioned Atomic Snapshot behind `ICareSyncRepository` + `IStorageAdapter` (Chosen):** Clones state via `structuredClone()`, executes all mutations inside `transact(draft)`, and commits the entire `CareSyncStateSnapshot` in one atomic `localStorage.setItem()` call.

## Decision
Implement `LocalStorageCareSyncRepository` (`src/repositories/localStorageRepository.ts`) conforming to `ICareSyncRepository`, backed by an injectable `IStorageAdapter` (`BrowserLocalStorageAdapter` in browser, `InMemoryStorageAdapter` in `node:test`). Store all domain collections in a single versioned key (`caresync_mal4_snapshot_v1`).

## Consequences
- **Positive:** All-or-nothing transactional semantics on a single browser tab—if a domain invariant or storage write fails, the isolated `draft` is discarded and zero partial state leaks into memory or disk. Unit tests run in ~1.1s with deterministic fault injection.
- **Negative / Limitations:** Serializing the full snapshot is $O(N)$ in total records (well within budget up to several thousand records, ~5 MB `localStorage` cap) and applies strictly to a single browser profile without multi-device concurrency control.

## When to Revisit
Revisit immediately when transitioning from a single-device prototype to a multi-user clinic deployment, or if audit event volume exceeds 5,000 records. At that threshold, replace `LocalStorageCareSyncRepository` with an API-backed PostgreSQL repository implementing the same use-case contracts with server-side ACID transactions.
