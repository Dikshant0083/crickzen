# Criczen — Build Order

Phases are ordered by dependency, not by appeal. Each one ends at something demonstrable.

Estimates assume one developer working steadily, and are for relative sizing — not commitments.

## Phase 0 — Foundations and the engine — ✅ DONE

The engine was built first, standalone, with no UI and no database. It is the only part of the system that is expensive to get wrong late.

- [x] pnpm workspaces, Turborepo, strict TS, Biome, Vitest, CI running lint + typecheck + test
- [x] `packages/engine`: types, `reduce`, `replay`, `validate`, `legalInputs`, format presets
- [x] Every limited-overs rule in [DOMAIN-RULES.md](DOMAIN-RULES.md), including all ten entries on the §12 commonly-wrong checklist
- [x] Property-test suite with the invariants from ARCHITECTURE §8
- [x] `packages/shared`: zod wire schemas for the sync protocol
- [x] A hand-computed golden fixture, asserted figure by figure
- [ ] **Carried forward:** golden fixtures transcribed from real published scorecards (at least 5). The hand-computed fixture proves the arithmetic is self-consistent; only real scorecards catch a rule we have modelled plausibly but wrongly.

**Done when:** a full scorecard can be produced by a test, with no app and no server, and corrections replay consistently. — *154 tests, 94% lines / 89% branches.*

Covers: §3 scoring logic, §15 automated scoring-rule tests.

## Phase 1 — Scorer app, local only (~3–4 weeks)

Still no server. A scorer can run a real match on one phone, offline, start to finish.

- Expo app, expo-router, theming (dark/light), i18n scaffolding
- `expo-sqlite` event log + snapshots, durable write path (ARCHITECTURE §4.2)
- Match setup: teams, XI, roles, toss, format, overs, conditions — §2
- Scoring screen: large one-tap controls, one-handed layout, haptics — §14
- Wickets, extras, free hit, bowler change, undo, edit a previous ball
- Live scoreboard and full scorecard, over timeline, partnerships — §4
- Resume an interrupted match after app kill
- Local teams and players, no accounts yet — §5

**Done when:** you score a complete real match on a phone in airplane mode and the scorecard is correct.

Covers: §2, §3, §4, part of §5, §9 local half, §14.

## Phase 2 — Server, sync, sharing (~5–6 weeks)

The point at which this becomes a product rather than an app. Longer than the other phases because it contains two separable bodies of work — auth, and the sync pipeline. Build **auth first**; everything else needs an authenticated actor to attribute events to.

### 2a. Auth (~2 weeks) — §1

Our own, because Neon is a database and brings none (DEPLOYMENT §3). Full specification with concrete parameters in ARCHITECTURE §5.3 — follow it rather than improvising.

- Fastify + Drizzle + Neon, migrations, seeds, pooled connection endpoint
- Register / login with argon2id; 15-minute access JWTs
- Rotating refresh tokens with **reuse detection** — rotation without it is theatre
- Google sign-in, verified server-side against Google's JWKS
- Password reset and email verification via Resend/Brevo, with SPF and DKIM set up
- Strict per-endpoint rate limits on the auth routes
- Account deletion and data export — preserving historical scorecards

### 2b. Sync and sharing (~3–4 weeks)

- Event ingestion with idempotency and lease authorisation — ARCHITECTURE §5.2
- Projections: `match_state`, `deliveries`, `innings_*`, plus the rebuild command in CI
- Sync worker in the app: outbox, retry with backoff, pending/synced indicators — §9
- WS realtime; spectator snapshot throttling
- Share codes, public read-only scoreboard, no login required — §8
- **In-process** snapshot cache for public reads — Redis only once there is a second API instance (DEPLOYMENT §5)
- Sentry, structured logs

**Done when:** two phones and a browser follow the same live match, one of them having been offline for ten overs.

Covers: §1, §8, §9, §15 core.

## Phase 3 — Identity, history, statistics (~3 weeks)

- Server-side teams and players, jersey numbers, batting/bowling styles — §5
- Image uploads to Cloudflare R2 via signed URLs issued by the API, so the app never holds R2 credentials — team logos, player and profile photos (§1, §5)
- Match history, career records, head-to-head, win percentage
- Batting/bowling aggregates at finalization; `player_career_stats`
- Charts: run rate, worm, Manhattan, phase analysis — §6
- CSV/Excel export; PDF scorecard — §6, §13
- Search and discovery: live, upcoming, recent, directories — §11

**Done when:** a player's career page is correct across every match they have played.

Covers: §5, §6, §11, part of §13.

## Phase 4 — Tournaments and the public web (~3–4 weeks)

- Tournament creation, registration, invitations — §7
- League, round-robin and knockout; automatic fixture generation; manual editing
- Points table, NRR and tie-breakers (DOMAIN-RULES §7)
- Leaderboards, Player of the Match, tournament reports
- `apps/web` — Next.js public scoreboards and share pages, properly SEO-able
- Social share cards, result cards

**Done when:** a 12-team league runs end to end without manual intervention.

Covers: §7, remainder of §8, §13 reporting.

## Phase 5 — Collaboration and notifications (~2–3 weeks)

- Scoring leases, heartbeat, explicit handover — ARCHITECTURE §6.1
- Assistant scorers, proposed corrections, umpire and organizer roles — §10
- `409 DIVERGED` reconciliation UI
- Per-delivery audit view: who recorded what, and every correction
- Score approval and match finalization
- Expo push: match start, toss, wicket, fifty, century, result, fixtures — §12
- Notification preferences and quiet hours

**Done when:** two scorers hand a match back and forth, one of them offline across the handover, and the log tells the truth afterwards.

Covers: §10, §12.

## Phase 6 — Hardening (~2 weeks, and continuous after)

- Rate limiting, API validation at every boundary, RBAC audit
- Automated backups plus a **tested** restore — untested backups are not backups
- Load test a high-traffic match: 5k concurrent spectators on one share link
- Performance budgets and alerting
- Privacy: data export, account deletion, retention policy — §1, §15
- Admin: user and role management, moderation, disputed results — §13

Covers: §13 admin, remainder of §15.

## Phase 7+ — Deferred by decision

Each of these needs its own go/no-go, not an automatic slot.

| Item | Why it waits |
|---|---|
| Test / multi-day matches | large rule surface (DOMAIN-RULES §11); needs real demand first |
| Official DLS | requires an ICC licence (ARCHITECTURE §6.2) |
| AI match summaries, win probability | cost per match, and both need their basis shown; honesty constraints in ARCHITECTURE §6.2 |
| Live audio commentary, video highlights | storage and moderation cost far above the rest of the product |
| Public API, white-label scoreboards | needs a stable schema first — do not promise one before Phase 4 |
| External data providers, ground scoreboards | paid integrations and hardware; sales-led, not engineering-led |
| Academy/club management, subscriptions, sponsors | separate product surfaces, not extensions of scoring |
| Phone OTP | has a per-message cost; Google sign-in covers most of the need |

## The critical path

```
engine  →  local scoring  →  sync  →  everything else
```

Phases 0–2 are strictly sequential, and roughly 60% of the risk in the whole product. Phases 3–6 can be reordered to suit who is asking for what; nothing in them is a dependency of anything else in them.
