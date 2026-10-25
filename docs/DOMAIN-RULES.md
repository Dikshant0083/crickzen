# Criczen — Domain Rules

The cricket rules the reducer must get right, and the decisions taken where the rules are ambiguous or vary by competition. This is the specification `packages/engine` is tested against.

Scope: limited-overs (T10/T20/ODI/custom). Test-specific rules are marked DEFERRED.

## 1. Ball legality and over progression

| Event | Counts as a legal ball | Charged to the bowler's over |
|---|---|---|
| Normal delivery | yes | yes |
| Wide | no | no |
| No-ball | no | no |
| Bye / leg-bye | yes | yes |
| Dead ball | no | no |

An over completes at 6 legal balls. The over then increments, and **strike rotates** — composed with any rotation the final ball itself caused, so an odd number of runs on the last ball of an over means the striker does *not* change ends on net.

**Balls faced** by the striker counts legal deliveries **and no-balls**, but never wides. So a batter can face a ball that did not count toward the over — which is why `legal` and `batterFacedBall` are separate flags in the engine rather than one.

A bowler may not bowl consecutive overs. Max overs per bowler defaults to `ceil(totalOvers / 5)` and is overridable per match (§2 "bowler limits").

## 2. Extras

| Extra | Runs to team | To batter | Legal ball | Notes |
|---|---|---|---|---|
| Wide | 1 + runs run | 0 | no | runs run are added as wides, not byes |
| No-ball | 1 + runs off bat | runs off bat | no | the 1 is the penalty; bat runs credit the batter |
| Bye | runs run | 0 | yes | ball passed the bat, no contact |
| Leg-bye | runs run | 0 | yes | contact with the body |
| Penalty | as awarded | 0 | no | 5-run awards, etc. (§3) |

**Overthrows** add to whatever the ball already was. Runs off bat plus overthrow credit the batter; overthrows on a bye credit the team as byes. Boundary from an overthrow is still 4 or 6 runs, not a "boundary" for the batter's four/six count unless struck to the fence — the engine stores `overthrowRuns` separately so the stats layer can make this call rather than losing the information.

**Tennis-ball variants** (§2) differ on whether a wide/no-ball re-bowl applies and on the wide penalty. These live in `MatchConfig`, not in reducer branches.

## 3. Dismissals

### Bowler credit

| Dismissal | Credited to the bowler | Legal ball |
|---|---|---|
| bowled | yes | yes |
| caught | yes | yes |
| caught and bowled | yes | yes |
| lbw | yes | yes |
| stumped | yes | yes |
| hit wicket | yes | yes |
| hit the ball twice | yes | yes |
| run out | **no** | yes |
| obstructing the field | **no** | yes |
| timed out | **no** | n/a, no ball bowled |
| retired out | **no** | n/a |

Every dismissal counts as a ball faced by the striker **except** run out off a no-ball or wide (not a legal ball), timed out, and retired out.

**Timed out is DEFERRED.** It happens without a delivery being bowled, so it does not fit the delivery event and is not accepted by `validate` in Phase 0. Retired out is handled by `batter.replaced`.

### Who is out

`playerOutId` is explicit in the payload and must never be inferred. On a run out it is frequently the non-striker. On a stumping it is always the striker.

### Strike after a dismissal

The engine resolves this in a fixed order, and the order is the source of several classic bugs:

1. odd runs **run** swap the ends (penalties never move anybody)
2. `battersCrossed` swaps them again
3. the dismissed batter is replaced at whichever end they now occupy
4. the end-of-over swap applies **last**, composing with all of the above

`battersCrossed` is not guessable, so the UI must ask for it on a run out — `validate` rejects a run out without it.

**Catches and law 18.11 (2022).** The incoming batter takes strike on a catch whether or not the batters crossed. This overrides step 3 above. The pre-2022 behaviour — the incomer going to the far end when they crossed — is still reachable via `rules.newBatterTakesStrikeOnCatch: false`, because local tennis-ball competitions often score the old way.

Runs completed before a run out **do count**, except the run in progress when the dismissal occurred.

### What can happen off a no-ball

Only run out, obstructing the field, and hit the ball twice. Bowled, caught, lbw and stumped are impossible — `validate` must reject them, which is what makes free-hit scoring trustworthy.

## 4. Free hit

A no-ball sets a free hit on the **next** delivery. On a free hit the batter cannot be dismissed except by run out, obstruction, or hitting the ball twice.

If the free-hit delivery is itself a wide or no-ball, the free hit **persists** to the following delivery. Derived state, never stored on the payload.

## 5. Innings end conditions

An innings closes on the first of:

1. **overs complete** — `legalBalls === totalOvers * 6`
2. **all out** — `wickets === battingXI.length - 1`, adjusted downward if players are absent or already retired out; capped by `config.wicketsPerInnings` when set (a super over is all out at 2)
3. **target reached** — chasing side passes the target (second innings only)
4. **declared** — DEFERRED, Test only
5. **abandoned** — interruption with no resumption

Edge case the engine must handle: the winning run arriving as an extra, or off a no-ball, still ends the innings mid-delivery. The delivery is recorded in full, then the innings closes.

## 6. Results

- **Chasing side wins** by `(battingXI.length - 1) - wickets` wickets remaining.
- **Defending side wins** by `theirScore - chaseScore` runs.
- **Tie** — scores level with the chasing innings complete. Then super over if `config.superOver` is on; otherwise the result stands as a tie.
- **No result** — abandoned before the minimum overs set in `MatchConfig`.

**Super over** is modelled as a nested match with `totalOvers: 1` and its own event log, linked by `parentMatchId`. Not special-cased inside the main reducer.

## 7. Net run rate (§7)

```
NRR = (runs scored / overs faced) − (runs conceded / overs bowled)
```

Two rules that are routinely implemented wrong:

- A side **bowled out** counts as having faced its **full quota** of overs, not the overs actually faced.
- Overs are counted in balls and converted, so 19.3 overs is 19.5, never 19.3, in the division.

Abandoned and no-result matches are excluded from NRR entirely but may still award points.

## 8. Powerplay and fielding restrictions (§2)

Stored as over ranges in `MatchConfig`. The engine exposes which phase a delivery fell in so §6's powerplay/middle/death analysis is a projection, not a re-derivation at query time.

## 9. Interruptions and revised targets (§2)

`interruption.started` / `interruption.ended` bracket the stoppage and record overs lost. Overs lost reduce `totalOvers` for the affected innings.

Revised targets are **manually entered** by the scorer — see ARCHITECTURE §6.2 for why no DLS. The UI must label a revised target as scorer-entered and show the stated source.

## 10. Retirements and substitutes (§3)

- **Retired hurt** — the batter may return later. Not a wicket. The innings does not lose a wicket and the batter's dismissal field stays open.
- **Retired out** — counts as a wicket, no bowler credit, and the batter cannot return.
- **Substitute** — a `batter.replaced` with reason `substitute`, subject to competition rules held in `MatchConfig`.

## 11. Deferred: Test and multi-day

Needed before Test matches ship, and explicitly out of scope until then: four innings with the follow-on, declarations, two new balls after 80 overs, sessions and intervals, bad light, over-rate penalties, and the draw as a result type.

## 12. Known-wrong-elsewhere checklist

Bugs that are common in scoring apps and that the golden-match tests exist to catch:

1. Strike not rotating correctly when an odd number of runs comes off the final ball of an over
2. Wide + runs run recorded as byes
3. Bowler credited with a run out
4. Free hit lost after a wide on the free-hit delivery
5. A bowled-out side's NRR computed on overs faced instead of the full quota
6. Overs treated as a decimal (19.3 ÷ as 19.3)
7. Ball faced credited to the batter on a run out off a wide
8. Maiden still counted when the over contained a wide or no-ball but no runs off the bat
9. New batter put on the wrong end after a run out where the batters crossed
10. The winning run arriving as a leg-bye not ending the innings
