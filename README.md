# Criczen

Cricket scoring: offline-first ball-by-ball scoring, live scoreboards, statistics and tournaments.

## Status

**Phase 0 complete** — the scoring engine, with no UI and no database. A full
scorecard can be produced from the event log by tests alone.

See [docs/ROADMAP.md](docs/ROADMAP.md) for what comes next.

## Documentation

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The event-sourced core, engine API, offline write path, sync protocol, schema, auth |
| [docs/DOMAIN-RULES.md](docs/DOMAIN-RULES.md) | The cricket rules the engine implements, and the decisions taken where they vary |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Build order, phase by phase |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting, free tiers, and what triggers each cost step |

## Layout

```
packages/
  engine/     the scoring core — pure TS, no I/O, no clock, no React
  shared/     zod wire schemas shared by app and API
apps/         (Phase 1+) mobile, api, web
```

## Getting started

```bash
pnpm install
pnpm verify        # lint + typecheck + test
```

Run the scorer app on your phone (install **Expo Go** from the App Store / Play Store,
same Wi-Fi as the PC):

```bash
pnpm --filter @criczen/mobile start   # scan the QR code with the camera (iOS) or Expo Go (Android)
```

Other tasks:

```bash
pnpm test                                  # all packages
pnpm test:watch                            # engine, in watch mode
pnpm --filter @criczen/engine test:coverage # with thresholds enforced
pnpm lint:fix                              # format and autofix
```

## The one thing to understand first

Scoring is an **append-only event log**, and all visible state is **derived by
replaying it through a pure reducer**. Undo, edit-any-past-ball, the audit
trail, offline scoring, duplicate-proof sync and idempotent APIs all fall out
of that single decision — see [ARCHITECTURE §1](docs/ARCHITECTURE.md).

Two consequences worth knowing before you touch `packages/engine`:

1. **The engine is pure.** No I/O, no `Date.now()`, no randomness. Time comes
   from `event.at`; ids come from the caller. This is what lets the same code
   run on the device and on the server and agree.

2. **Corrections go through `replay()`, not `reduce()`.** Changing a past ball
   changes every downstream striker assignment, so the only consistent answer
   is to substitute the delivery and fold the log again. `reduce()` rejects
   corrections with `REQUIRES_REPLAY` rather than quietly getting it wrong.

```ts
import { createMatchConfig, replay, legalInputs } from '@criczen/engine';

const state = replay(events);          // Result<MatchState, RuleViolation>
if (state.ok) {
  const inputs = legalInputs(state.value);  // what the scorer may tap right now
}
```

## Testing

The reducer is the product, so it carries most of the test budget:

- **golden fixtures** — ball-by-ball scripts with hand-computed figures
- **property tests** — invariants that hold after any valid event sequence
  (the total reconciles, balls sum across bowlers, wickets never exceed the XI,
  `replay` agrees with chained `reduce`, void-then-re-record is a no-op)
- **rule tests** — one per entry in the DOMAIN-RULES §12 "commonly wrong"
  checklist

Coverage thresholds are enforced in CI: 90% lines/functions, 85% branches on
the engine. The apps are not held to that.
