# Criczen — Deployment and Hosting

Free-tier first, with named triggers for when to pay. Last updated 2026-10-18.

> **Verify limits before you sign up.** Free-tier quotas move every few months and my information has a cutoff. The *shape* of this plan is stable; the exact numbers need a check against each provider's current pricing page. One specific item to check is flagged in §3.

## 1. The constraint that decides everything

Two requirements fight the free tier:

1. **WebSockets need a warm, long-lived process.** Serverless request/response platforms either cannot hold them or bill badly for them.
2. **Free tiers sleep.** Render free spins down after ~15 minutes idle and cold-starts in 30–60 seconds.

Here is why that is survivable, and it is a direct payoff from the architecture: **the app is offline-first.** The scorer taps a ball, it lands in SQLite, and the UI updates — with the server asleep, unreachable, or on fire. A cold start delays *sync and spectators*, never scoring.

So the honest rule: **free hosting is fine until live spectators matter.** Paying starts when someone shares a link and expects the score to move.

## 2. Stack

| Layer | Pick | Free tier | When it stops being free |
|---|---|---|---|
| Mobile app | **Expo / EAS** | local builds always free; cloud builds limited per month | $19/mo Production plan only if you want cloud build concurrency |
| Database | **Neon Postgres** | **1GB storage**, scale-to-zero, branching | $19/mo Launch at ~3,700 matches |
| API + WebSockets | **Fly.io** | no true free tier; smallest machine ≈ **$2–4/mo** | scales with instances, not users, for a long while |
| Auth | **our own** (see ARCHITECTURE §5.3) | free | free — it's our code |
| Transactional email | **Resend** or **Brevo** | ~3k/mo (Resend) or ~300/day (Brevo) | $20/mo well past launch |
| Images (logos/photos) | **Cloudflare R2** | 10GB storage, **zero egress fees** | ~$0.015/GB/mo past 10GB — effectively never |
| Push notifications | **Expo Push** | free, unlimited | free |
| Error tracking | **Sentry** | 5k errors/mo | $26/mo if you outgrow it, which means something is wrong |
| CI | **GitHub Actions** | 2,000 min/mo private, unlimited public | raise only if CI gets slow |
| Cache / pub-sub | **none in Phase 2** | — | add Upstash Redis free tier when you run a second API instance |

**Realistic total: $2–4/month to start**, or $0 while developing on Render free. The only unavoidable spend up front is app store registration — Google Play **$25 one-time**, Apple **$99/year** — and neither is needed until you distribute outside internal testing.

## 3. Why these, specifically

### Neon for Postgres

Plain Postgres with no platform wrapped around it, which suits a design where the database is the boring part and `packages/engine` holds the value. Four things it does better than the alternatives:

- **1GB free** — roughly double what Supabase and most others give.
- **Scale-to-zero with a sub-second wake.** It idles down after a few minutes and comes back on the next query. Unlike a free tier that *pauses the project* after a week of inactivity, nothing needs un-pausing by hand.
- **Database branching.** A branch per pull request means migrations get tested against a real copy of production data in CI, then thrown away. This is the feature that will quietly save you the most pain, given the projection-rebuild work in ARCHITECTURE §5.1.
- **No lock-in.** Moving to RDS or a plain Postgres box later is a `pg_dump` and a connection-string change.

Two operational notes:

- **Use the pooled connection endpoint** (the `-pooler` host). Neon's free tier caps direct connections, and even a single persistent Fly process with a connection pool should go through PgBouncer. Getting this wrong surfaces as random connection exhaustion under load, not as a clear error.
- **⚠️ Check the compute-hour allowance on the current free plan.** Neon bills compute time, and scale-to-zero means a *live match keeps the database awake for its whole duration*. A busy Saturday of six simultaneous matches is six hours of compute. This is the one axis where Neon free can bite in a way a storage-capped competitor would not, and it is worth knowing the exact cap before launch rather than discovering it mid-tournament.

### What we give up, and what it costs

Neon is a database, not a platform. Two things it does not do:

**Auth (§1) is now ours to build.** Email/password, Google sign-in, password reset, account recovery, email verification, account deletion, data export. This is real security-sensitive work — a few weeks in Phase 2 — and it is the price of the gains above. ARCHITECTURE §5.3 specifies exactly how, with concrete parameters, so it is not improvised later. Upside: no vendor owns your user table, and `users`/`profiles` are ordinary rows you can join against.

**Transactional email needs a provider.** Password resets and verification have to go somewhere. Resend's free tier (~3,000/month) or Brevo's (~300/day) covers launch comfortably. Budget an afternoon for domain verification — SPF and DKIM records — because unverified senders land in spam, and a password reset in spam reads as a broken app.

### Fly.io for the API

The WS server needs to stay warm, in a region near your users. For an India-first product that means Mumbai or Singapore — a scorer in Pune talking to a US-East box feels broken regardless of how good the code is. Not free, but a `shared-cpu-1x` 256MB machine is a couple of dollars a month, which beats fighting a free tier that sleeps.

**Free alternative for Phase 2 development: Render free.** Spin-down is genuinely tolerable while building, precisely because scoring is local-first. Move to Fly before the first match with real spectators.

### Cloudflare R2 for images

Zero egress fees is the whole reason. Player photos and team logos get hit on every scorecard view, and egress is what makes image hosting expensive everywhere else. 10GB free is thousands of photos. Pair it with a signed-upload endpoint on the API so the app never holds R2 credentials.

**Never put images in Postgres.** 1GB of database is either ~3,700 matches of scoring data or ~5,000 player photos. Spending the quota on JPEGs would be the fastest way to a paid tier for no reason.

## 4. Sizing math — when does 1GB actually run out?

Per T20 match, against the schema in ARCHITECTURE §5.1:

| What | Rows | Approx. size |
|---|---|---|
| `match_events` (the log) | ~310 | ~190 KB |
| `deliveries` projection | ~270 | ~55 KB |
| `innings_batting` / `innings_bowling` | ~34 | ~5 KB |
| `match_state` snapshot | 1 | ~30 KB |
| **Total** | | **~280 KB** |

**1GB ≈ 3,700 T20 matches.** ODIs are roughly 2.5× that, so ~1,500. Users, teams and players are rounding errors beside the match data.

### The escape hatch

When you approach the limit you are not forced onto a paid plan, and this is a deliberate property of the design: **everything except `match_events` is derived.** You can drop `deliveries`, `innings_*` and `match_state` for matches older than a season and rebuild any of them on demand from the log.

That takes per-match storage from ~280KB to ~190KB — call it **5,500 matches** on the free tier — at the cost of a one-second replay the first time someone opens an old scorecard. Worth knowing the lever exists; don't pull it before you need to.

## 5. Upgrade ladder

| Stage | Trigger | Monthly |
|---|---|---|
| **Development** | — | **~$0** (Render free + Neon free) |
| **First real matches** | spectators share links and expect live updates | **~$4** (Fly machine) |
| **Growing** | 3,700 matches stored, or the compute-hour cap bites | **~$23** (+ Neon Launch $19) |
| **Multi-instance** | one API box saturates, or you want zero-downtime deploys | **~$35** (2 Fly machines + Upstash Redis) |
| **Scale** | sustained thousands of concurrent spectators | **$100+** (read replicas, CDN in front of public scoreboards) |

Two notes on that ladder. The second API instance is the step that **requires** Redis — in-process caching and WS rooms stop working the moment there are two boxes, which is why ARCHITECTURE §5.4 puts Redis there and not earlier. And public scoreboards are the thing most likely to spike: one viral local final is thousands of reads against a single cached snapshot, which is cheap, versus thousands of Postgres queries, which is not.

## 6. What not to use, and why

- **Vercel / Netlify for the API.** Excellent for the Next.js public site in Phase 4. Wrong for this API — serverless functions can't hold the WebSocket connections the live scoreboard depends on.
- **SQLite on the server (Turso/LiteFS).** Generous free tiers, but event ingestion wants real `SELECT ... FOR UPDATE` and JSONB. Not worth the friction.
- **Firebase/Firestore.** Its offline support is good, but the scoring core needs transactional multi-row projection writes and relational queries for statistics. We'd be fighting the document model from Phase 3 onward.
- **Rolling your own password hashing, token format, or crypto.** The one place in this project to use boring, audited libraries exactly as documented. ARCHITECTURE §5.3 names them.

## 7. Worth revisiting later: Cloudflare Workers + Durable Objects

One genuinely interesting fit for a future rewrite of ingestion. A Durable Object is a single-threaded stateful actor with its own storage — almost exactly "one match room": it serialises writes (making the §6.1 lease unnecessary), holds WS connections with hibernation support, and keeps match state locally. Free-tier Durable Objects exist as of 2025.

Not now. It would mean a different persistence model for the log and a split from the Postgres projections that statistics depend on. Noted so the option isn't forgotten around Phase 6, when WS cost becomes a line item worth optimising.

## 8. Environments

Three, per §15, and cheaply — this is where Neon's branching earns its place:

- **development** — local Postgres in Docker (not a Neon branch; offline dev matters), local API, Expo dev client
- **staging** — a **Neon branch** off production, a second Fly app, deployed from `main`
- **production** — the Neon default branch, deployed from tagged releases only

Per-pull-request CI gets its own ephemeral Neon branch: migrate it, run the integration suite and the projection-rebuild command against real-shaped data, then delete it. Keep migrations forward-only, and test the restore rather than just the backup (ROADMAP Phase 6). Neon's point-in-time restore covers the "someone truncated a table" case; it does not cover "the reducer wrote wrong numbers for a week", which is what the rebuild command is for.
