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
Repository Interface →  Data access contract (no DB specifics, strictly CRUD apis)
   ↓
Repository Impl     →  MongoDB/Mongoose implementation
```

Use the current **interface-driven repository + service with inline domain logic** is the right level of abstraction.
