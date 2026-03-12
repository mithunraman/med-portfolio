# DDD Rearchitecture

## Current State

The codebase already follows a simplified DDD pattern:

- **Repository layer** — Pure data access. Knows about MongoDB, Mongoose, aggregation pipelines, sessions. Returns `Result<T, DBError>`. Accepts `ClientSession` for transactions. No business logic.
- **Service layer** — Orchestration and domain logic. Enforces business rules, orchestrates multiple repo calls, maps domain objects to DTOs, translates `Result` errors into HTTP exceptions.
- **Interface-driven repos** — Services depend on `IPdpGoalsRepository` (injected via symbol), never on Mongoose directly. Enables swapping storage and easy test mocking.

### Key Boundary

```
Controller          →  Parse HTTP params/body, delegate to service
   ↓
Service             →  Apply business rules, orchestrate repo calls
   ↓
Repository Interface →  Data access contract (no DB specifics)
   ↓
Repository Impl     →  MongoDB/Mongoose implementation
```

## What Full DDD Would Add

| Concept | What It Adds | Trade-off |
|---|---|---|
| **Domain Entity classes** | e.g. `PdpGoal` class with methods like `goal.complete()` | Encapsulates logic but adds ceremony; inline service logic is clear at current scale |
| **Value Objects** | e.g. `PdpGoalStatus` as immutable class with validation | Enum + DTO validation covers this today |
| **Domain Events** | e.g. `GoalCompletedEvent` emitted after completion | Useful at scale for decoupling side effects; overkill now |
| **Aggregate Root** | `PdpGoal` owns `PdpGoalAction[]`, enforces all invariants | Already treated this way implicitly — actions always saved through the goal |

## Modules to Consider

- `pdp-goals` — already follows the pattern well
- `artefacts` — candidate for same interface-driven repo + service split
- Any new modules should follow this pattern from the start

## Decision

Revisit when:
- Business logic in services grows complex enough that domain entity methods would reduce duplication
- Side effects on state changes (e.g. notifications, audit logs) warrant domain events
- A second storage backend becomes a real possibility

Until then, the current **interface-driven repository + service with inline domain logic** is the right level of abstraction.
