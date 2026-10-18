# Criczen — Architecture

Status: proposal, awaiting sign-off. Last updated 2026-10-18.

See also: [DOMAIN-RULES.md](DOMAIN-RULES.md) for the cricket rules the engine implements, [ROADMAP.md](ROADMAP.md) for build order, [DEPLOYMENT.md](DEPLOYMENT.md) for hosting and cost.

## 1. The one decision everything else follows from

Scoring is an **append-only event log**, and all visible state is **derived by replaying it through a pure function**.

The feature list demands, independently, all of these:

- undo the last delivery (§3)
- edit previous deliveries and correct mistakes (§3)
- ball-by-ball event history and audit trail (§3)
- track who recorded each delivery (§10)
- score with no internet, resume after app restart, sync later, never double-submit (§9)
- idempotent APIs and event identifiers, transactional score updates (§15)

A mutable `match` row with running totals cannot satisfy that set. An event log satisfies all six at once, and makes the rest cheap: commentary is a rendering of the log, the worm and Manhattan charts are a fold over it, "last six balls" is a window on it, and a disputed result is settled by reading it.

The cost is real and worth naming: every read path needs a projection, and the reducer becomes the single most critical and most heavily tested piece of code in the product.

## 2. Monorepo layout

pnpm workspaces. The engine is a package, not a folder inside the app, because the server must run the exact same code.

```
criczen/
  packages/
    engine/     pure TS: types, reducer, rule validators, format presets.
                No I/O, no React, no Date.now().
    shared/     zod schemas, DTOs, error codes, constants shared by app + api
    ui/         (later) shared RN components
  apps/
    mobile/     Expo + expo-router — the scorer app, also the Expo-web build
    api/        Fastify + Drizzle + ws
    web/        (Phase 4) Next.js — public scoreboards, share links, SEO
  docs/
```

Tooling: TypeScript strict everywhere, Biome (lint + format in one tool), Vitest, Turborepo for the task graph and caching.

## 3. packages/engine — the scoring core

### 3.1 Event envelope

```ts
interface MatchEvent {
  id: string;               // UUIDv7, generated on the device → the idempotency key
  matchId: string;
  localSeq: number;         // device-monotonic, orders the offline queue
  serverSeq: number | null; // assigned by Postgres on accept; null while pending
  actorId: UserId;          // who recorded it  (§10 audit)
  deviceId: string;
  at: string;               // ISO timestamp from the recording device
  payload: Payload;
}
```

### 3.2 Payload kinds

```ts
type Payload =
  | { kind: 'match.created';        config: MatchConfig }
  | { kind: 'squad.set';            teamId: TeamId; playingXI: PlayerId[]; captain: PlayerId; keeper: PlayerId }
  | { kind: 'toss.recorded';        winnerTeamId: TeamId; choice: 'bat' | 'bowl' }
  | { kind: 'innings.opened';       inningsNo: 1|2|3|4; battingTeamId: TeamId;
                                    strikerId: PlayerId; nonStrikerId: PlayerId; bowlerId: PlayerId }
  | { kind: 'delivery.recorded';    delivery: Delivery }
  | { kind: 'delivery.corrected';   targetEventId: string; delivery: Delivery }   // §3 edit previous deliveries
  | { kind: 'delivery.voided';      targetEventId: string; reason?: string }
  | { kind: 'bowler.changed';       bowlerId: PlayerId }
  | { kind: 'strike.swapped';       reason?: string }                             // manual override of derived strike
  | { kind: 'batter.replaced';      outgoingId: PlayerId; incomingId: PlayerId;
                                    reason: 'retired_hurt' | 'retired_out' | 'substitute' }
  | { kind: 'penalty.awarded';      teamId: TeamId; runs: number; reason: string }
  | { kind: 'interruption.started'; reason: 'rain' | 'light' | 'other' }
  | { kind: 'interruption.ended';   oversLost: number }
  | { kind: 'target.revised';       runs: number; overs: number; method: 'manual' }
  | { kind: 'innings.closed';       reason: 'overs' | 'all_out' | 'target_reached' | 'declared' | 'abandoned' }
  | { kind: 'match.concluded';      result: MatchResult }
  | { kind: 'match.status.changed'; status: 'paused' | 'resumed' | 'abandoned' | 'cancelled' };
```

### 3.3 Delivery — observed facts only

```ts
interface Delivery {
  runsOffBat: 0|1|2|3|4|5|6;
  extra?: { type: 'wide' | 'noball' | 'bye' | 'legbye'; runs: number };
  overthrowRuns?: number;
  wicket?: {
    kind: DismissalKind;      // bowled | caught | caught_and_bowled | lbw | run_out | stumped
                              // | hit_wicket | obstructing | hit_twice | timed_out | retired_out
    playerOutId: PlayerId;    // explicit — may be the non-striker on a run out
    fielderIds?: PlayerId[];
    battersCrossed?: boolean; // decides who is on strike after a run out
  };
}
```

**Design rule: the payload carries only what the scorer saw.** No `strikerId`, no `isFreeHit`, no `overNumber`, no ball-in-over index. Those are *derived* by the reducer.

This matters for edits. If ball 3.2 is corrected from 1 run to 2, every downstream striker assignment changes. Had we stored the striker on each ball, replay would produce a log that contradicts itself. Deriving it means one correction event replays into a fully consistent innings. The derived values *are* written to the projection tables, where queries need them.

### 3.4 Public API

```ts
function reduce(state: MatchState, event: MatchEvent): Result<MatchState, RuleViolation>;
function replay(events: MatchEvent[]): Result<MatchState, RuleViolation>;
function validate(state: MatchState, payload: Payload): RuleViolation[];
function legalInputs(state: MatchState): InputAffordances;  // drives button enable/disable in the UI
```

Hard constraints on this package:

- **pure** — no clock, no randomness, no network, no storage
- **total** — never throws on bad input; returns a `Result`
- **deterministic** — `replay(events)` produces identical state on device and server

`validate` is called twice for every ball: by the app to grey out impossible taps, and by the server to reject a stale or malicious write. One implementation, two callers — the only way those two stay in agreement.

### 3.5 Replay cost

A T20 innings is roughly 130 events, an ODI 320, a long Test innings a few thousand. Full replay from zero is sub-millisecond work.

**Do not build incremental-edit optimisation.** Correct an old ball, replay the innings, done. Snapshots exist to avoid re-reading the log out of the database, not to avoid the arithmetic.

## 4. apps/mobile — offline-first scorer

### 4.1 Storage

`expo-sqlite`, not AsyncStorage. Two tables mirror the server — `events` (the log) and `snapshots` — plus `outbox` for sync state.

### 4.2 The write path, in this order

1. `validate(state, payload)` — reject in the UI, no event created
2. `INSERT` the event into SQLite **inside a transaction, awaited**
3. `reduce` into the in-memory store; the UI updates
4. enqueue in `outbox`; the sync worker picks it up when online

Durability precedes visibility. A ball shown on screen but not yet on disk is a ball lost to an OS kill mid-over, which is §9's entire concern.

### 4.3 State management

- `zustand` holds the replayed `MatchState`. Scoring screens read it synchronously; no async render on the ball-by-ball path.
- `@tanstack/react-query` for data that is genuinely server-owned: teams, tournaments, discovery, career stats.

These do not overlap. Live match state is local-authoritative while you hold the lease; everything else is server-authoritative.

### 4.4 Sync protocol

```
POST /matches/:id/events   { events: MatchEvent[], afterServerSeq: number }
  202 { accepted: [{ id, serverSeq }], rejected: [{ id, code, detail }] }
  409 { code: 'DIVERGED', serverSeq, events: [...] }

GET  /matches/:id/events?sinceSeq=N  →  { events, serverSeq }
```

- **Idempotency:** `UNIQUE (match_id, event_id)`. A retried push inserts nothing and returns the original `serverSeq`. That single constraint is §9's "prevent duplicate delivery submissions" and §15's "idempotent APIs" — one mechanism, both requirements.
- **Ordering:** the server assigns `server_seq` from a sequence and its order is canonical. `localSeq` only orders the outbox.
- `409 DIVERGED` is the hard case — see §6.1.

## 5. apps/api — server

Fastify + Drizzle + Postgres + `ws`. Redis from Phase 2 for pub/sub and public-scoreboard caching.

**ORM note:** I recommend **Drizzle over Prisma** here. This schema is JSONB-heavy, needs `INSERT ... ON CONFLICT DO NOTHING RETURNING` for idempotent event writes, and needs hand-written projection SQL. Drizzle is a thin typed layer over SQL and stays out of the way; with Prisma we would be dropping into `$queryRaw` for exactly the parts that matter. Cheap to flip now, expensive later — worth an explicit yes or no before Phase 0.

### 5.1 Schema, abbreviated

```sql
-- identity (§1)
users(id, email unique, password_hash, created_at, deleted_at)
profiles(user_id pk, display_name, photo_url, city, role, visibility)

-- entities (§5)
teams(id, name, logo_url, colors jsonb, home_venue, owner_user_id)
players(id, user_id nullable, name, photo_url, batting_style, bowling_style)
team_players(team_id, player_id, jersey_no, active, primary key (team_id, player_id))

-- match
matches(id, config jsonb, status, tournament_id nullable, starts_at, venue,
        visibility, share_code unique, created_by)
match_roles(match_id, user_id, role)   -- scorer | assistant | umpire | organizer (§10)

-- the source of truth (§3, §15)
match_events(
  match_id, server_seq bigserial, event_id uuid, actor_id, device_id,
  payload jsonb, recorded_at, received_at,
  primary key (match_id, server_seq),
  unique (match_id, event_id)
)

-- derived, rebuildable, never written by hand
match_state(match_id pk, state jsonb, last_seq, updated_at)
deliveries(match_id, innings_no, over_no, ball_in_over, legal, striker_id, bowler_id,
           runs_off_bat, extras jsonb, wicket jsonb, source_event_id)
innings_batting(match_id, innings_no, player_id, runs, balls, fours, sixes, dismissal jsonb, position)
innings_bowling(match_id, innings_no, player_id, balls, maidens, runs, wickets, dots, wides, noballs)

-- aggregates, written only at match finalization
player_career_stats(player_id, format, ...)
team_records(team_id, format, ...)

-- concurrency control (§10)
scoring_leases(match_id pk, innings_no, holder_user_id, device_id, expires_at, generation)

-- tournaments (§7)
tournaments(...)  fixtures(...)  points_table(...)   -- points_table is a projection
```

`match_state`, `deliveries`, `innings_*`, `points_table`, `player_career_stats` and `team_records` are **all derived**. A rebuild command that truncates them and replays every match must exist from Phase 1 and run in CI. The day a reducer bug ships, that command is the fix.

### 5.2 Event ingestion

One transaction per push:

1. `SELECT ... FOR UPDATE` the lease row, to authorise this device
2. load the `match_state` snapshot
3. for each event: `validate`, then `reduce` — stop at the first violation
4. `INSERT ... ON CONFLICT (match_id, event_id) DO NOTHING RETURNING server_seq`
5. write back `match_state`; update the `deliveries` and `innings_*` projections
6. commit, then publish to the match's WS room

Rejected events come back with a code the app can act on, not a 500.

### 5.3 Auth — ours to build

We host Postgres on Neon, which means no auth platform comes with it (DEPLOYMENT §3). §1 of the feature list is therefore our code. Written down concretely here so it is not improvised under deadline, because this is the one area where a plausible-looking implementation can be badly wrong.

**Use audited libraries exactly as documented. Invent nothing.**

**Passwords.** `@node-rs/argon2`, argon2id, OWASP parameters: memory 19 MiB, iterations 2, parallelism 1. Never SHA-anything, never bcrypt with a low cost. Compare with the library's verify function, not with `===`.

**Access tokens.** JWT, HS256 with a single server-side secret, **15-minute** expiry. Claims: `sub`, `iat`, `exp`, and nothing security-relevant that can go stale. Authorisation decisions read from the database, not from claims, because a revoked scorer role must stop working within seconds rather than on the next token refresh.

**Refresh tokens.** Opaque 256-bit random, **stored only as a SHA-256 hash**, 60-day expiry, and **rotated on every use**. Rotation needs reuse detection: each token carries a `family_id`, and presenting an already-consumed token means it was stolen — revoke the entire family and force re-login. Without reuse detection, rotation provides no real protection.

```sql
refresh_tokens(id, user_id, token_hash unique, family_id, consumed_at,
               expires_at, created_ip, created_ua)
```

Stored on the device in `expo-secure-store` (Keychain / Keystore), never `AsyncStorage`.

**Google sign-in.** `expo-auth-session` on the device; the server verifies the Google ID token against Google's JWKS and checks `aud` and `iss` itself. Link to an existing user only on a Google-verified email address — trusting an unverified `email` claim is an account-takeover path.

**Password reset and email verification.** Single-use token, stored hashed, **30-minute** TTL, consumed on first use. The reset endpoint returns the same response for a known and unknown address, so it cannot enumerate accounts. Sent via Resend or Brevo from a domain with SPF and DKIM configured.

**Rate limits.** `@fastify/rate-limit`, strict and per-identifier on `/login`, `/register`, `/forgot-password` and `/refresh` — tighter than the general API limit in §15. Lock an account's login attempts progressively rather than permanently.

**Account deletion and data export (§1).** Deletion anonymises the `players` row and clears `profiles`, but **preserves match events and scorecards** — a historical scorecard is other people's record too, and §5 explicitly requires preserving historical records. Export is a JSON dump of profile, matches, and per-match contributions, generated by a worker and delivered as a signed download link.

**Phone OTP** is deferred: it costs money per message and Google sign-in covers most of the need (ROADMAP Phase 7+).

### 5.4 Realtime, and the viral-link problem

- **Scorers and assistants:** a WS room per match, receiving raw events and applying the same reducer locally.
- **Spectators:** a **throttled state snapshot**, coalesced to at most once a second — not the event stream. They have no use for the log and no reducer in their bundle.
- **Public scoreboard reads** (`GET /s/:shareCode`) are served from a cached snapshot written on each commit, with a short TTL and stale-while-revalidate. One popular local final must not become Postgres load per page view (§15, load testing).

  The cache is **in-process** while there is a single API instance, and moves to Redis at the point a second instance appears — which is the same moment the WS rooms need Redis pub/sub anyway. Write it behind a two-method interface (`get`/`set`) in Phase 2 so that swap is an afternoon, not a refactor.

## 6. The two genuinely hard problems

Everything else on the list is work. These two are design risk, and are worth settling now rather than discovering in Phase 4.

### 6.1 Concurrent scorers (§10)

"Resolve conflicting edits from multiple scorers" is, in the general case, a consensus problem over a domain where two readings of the same ball cannot be merged. There is no correct automatic merge of "A recorded a wide" and "B recorded a leg-bye" for the same delivery.

**Decision: a single writer at a time, enforced by a lease, with explicit handover.** The feature list already asks for "scorer handover", which is the honest version of this feature.

- `scoring_leases` holds one writer per match, TTL about 90 seconds, renewed by heartbeat.
- The holder scores. Assistants get live read access and may *propose* corrections, which surface to the holder as a one-tap accept.
- Handover is explicit, or by takeover once the lease expires, which increments `generation`.
- An offline holder keeps scoring against the lease they hold. If it lapsed and someone took over, their push gets `409 DIVERGED`.

On `409 DIVERGED` the app does **not** auto-merge. It shows both branches ball by ball and asks the scorer to keep one, discard theirs, or re-enter. Rare by construction, and the one path where a silent wrong guess corrupts a scorecard.

### 6.2 DLS and revised targets (§2)

The Duckworth–Lewis–Stern method is proprietary and its resource tables are licensed by the ICC. We cannot ship official DLS.

**Decision: `target.revised` takes a manually entered target and overs, labelled in the UI as entered by the scorer, with the source named.** No home-grown approximation presented as DLS — a wrong target decides matches, and an unlicensed lookalike is both a legal and a credibility problem. Revisit only with a licence.

The same honesty rule applies to two items the list already flags correctly: projected score is labelled an estimate (§4), and win probability (§16) ships only with its basis stated.

### 6.3 Noted but deferred

**Test matches** (§2) need four innings, the follow-on, declarations, two new balls, sessions and bad-light rules. The event model handles it — `inningsNo: 1|2|3|4` is there deliberately — but the rule surface is large. Limited-overs first; Test gets its own phase.

## 7. Where the rest of the feature list lands

| Spec section | Mechanism |
|---|---|
| §4 live scoreboard, commentary, worm/Manhattan | renderings and folds over the event log; no new storage |
| §6 statistics | `deliveries` + `innings_*` for a single match; `player_career_stats` aggregated at finalization only, never per ball, to avoid hot-row contention |
| §7 tournaments | `points_table` is a projection over completed fixtures; NRR and tie-breakers are pure functions in `packages/engine` |
| §8 sharing | `share_code` on the match; the public read path is the Redis snapshot |
| §11 search | Postgres full-text plus trigram to start; a search service only once that stops being enough |
| §12 notifications | the ingestion commit publishes domain facts (wicket, fifty, result); a worker fans out to Expo push |
| §13 reports | PDF rendered server-side from the same projections; CSV straight from them |
| §14 accessibility | one-tap targets at least 56dp, one-handed layout, `expo-haptics`, i18n scaffolded from Phase 0 so strings are never hardcoded |
| §15 reliability | as above, plus structured logs, Sentry, and the projection-rebuild command in CI |
| §16 advanced | strictly post-core; each needs its own decision on cost and honesty |

## 8. Testing the engine

The reducer is the product, and it gets a disproportionate share of the test budget.

1. **Golden matches** — real published scorecards encoded as event logs, asserting final batting and bowling figures to the run. These catch the rotation, extras and bowler-credit bugs that unit tests miss.
2. **Property tests** (fast-check) — invariants that hold after *any* valid event sequence:
   - team total === sum of batter runs + extras + penalties
   - legal balls bowled === sum over bowlers
   - wickets ≤ playing XI − 1
   - `replay(events)` equals incremental `reduce` chaining
   - voiding then re-adding an identical ball returns to the same state
3. **Edit/replay tests** — correct an arbitrary mid-innings ball; assert downstream strike and bowler assignments stay consistent.
4. **Determinism** — the same log replayed under the api's Node build and the app's Hermes build yields identical state hashes.

Target: the engine stays above 90% branch coverage. The apps are not held to that.
