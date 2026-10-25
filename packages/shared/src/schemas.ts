import { z } from 'zod';

/**
 * Wire schemas shared by the app and the API.
 *
 * These validate the SHAPE of an event at the transport boundary. They say
 * nothing about whether it is a legal cricket event — that is the engine's
 * `validate`, and the server runs both: shape here, rules there.
 */

export const playerIdSchema = z.string().min(1).max(64);
export const teamIdSchema = z.string().min(1).max(64);
export const inningsNoSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const extraSchema = z.object({
  type: z.enum(['wide', 'noball', 'bye', 'legbye']),
  runs: z.number().int().min(0).max(10),
});

export const dismissalKindSchema = z.enum([
  'bowled',
  'caught',
  'caught_and_bowled',
  'lbw',
  'run_out',
  'stumped',
  'hit_wicket',
  'obstructing',
  'hit_twice',
]);

export const wicketSchema = z.object({
  kind: dismissalKindSchema,
  playerOutId: playerIdSchema,
  fielderIds: z.array(playerIdSchema).max(11).optional(),
  battersCrossed: z.boolean().optional(),
  incomingBatterId: playerIdSchema.optional(),
});

export const deliverySchema = z.object({
  runsOffBat: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  extra: extraSchema.optional(),
  overthrowRuns: z.number().int().min(0).max(10).optional(),
  wicket: wicketSchema.optional(),
});

export const overRangeSchema = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(0),
});

export const matchRulesSchema = z.object({
  widePenalty: z.number().int().min(0).max(5),
  noBallPenalty: z.number().int().min(0).max(5),
  freeHitOnNoBall: z.boolean(),
  maxOversPerBowler: z.number().int().min(1).nullable(),
  newBatterTakesStrikeOnCatch: z.boolean(),
  superOverOnTie: z.boolean(),
});

export const matchConfigSchema = z.object({
  matchId: z.string().min(1),
  format: z.enum(['T10', 'T20', 'ODI', 'TEST', 'CUSTOM']),
  ballType: z.enum(['leather', 'tennis']),
  totalOvers: z.number().int().min(0).max(450),
  playersPerSide: z.number().int().min(2).max(15),
  wicketsPerInnings: z.number().int().min(1).max(14).optional(),
  teams: z.tuple([teamIdSchema, teamIdSchema]),
  powerplays: z.array(overRangeSchema).max(5),
  rules: matchRulesSchema,
});

export const payloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('match.created'), config: matchConfigSchema }),
  z.object({
    kind: z.literal('squad.set'),
    teamId: teamIdSchema,
    playingXI: z.array(playerIdSchema).min(2).max(15),
    captainId: playerIdSchema,
    keeperId: playerIdSchema,
  }),
  z.object({
    kind: z.literal('toss.recorded'),
    winnerTeamId: teamIdSchema,
    choice: z.enum(['bat', 'bowl']),
  }),
  z.object({
    kind: z.literal('innings.opened'),
    inningsNo: inningsNoSchema,
    battingTeamId: teamIdSchema,
    strikerId: playerIdSchema,
    nonStrikerId: playerIdSchema,
    bowlerId: playerIdSchema,
  }),
  z.object({ kind: z.literal('delivery.recorded'), delivery: deliverySchema }),
  z.object({
    kind: z.literal('delivery.corrected'),
    targetEventId: z.string().min(1),
    delivery: deliverySchema,
  }),
  z.object({
    kind: z.literal('delivery.voided'),
    targetEventId: z.string().min(1),
    reason: z.string().max(280).optional(),
  }),
  z.object({ kind: z.literal('bowler.changed'), bowlerId: playerIdSchema }),
  z.object({ kind: z.literal('strike.swapped'), reason: z.string().max(280).optional() }),
  z.object({
    kind: z.literal('batter.replaced'),
    outgoingId: playerIdSchema,
    incomingId: playerIdSchema,
    reason: z.enum(['retired_hurt', 'retired_out', 'substitute']),
  }),
  z.object({
    kind: z.literal('penalty.awarded'),
    teamId: teamIdSchema,
    runs: z.number().int().min(1).max(25),
    reason: z.string().min(1).max(280),
  }),
  z.object({
    kind: z.literal('interruption.started'),
    reason: z.enum(['rain', 'light', 'other']),
  }),
  z.object({ kind: z.literal('interruption.ended'), oversLost: z.number().int().min(0).max(450) }),
  z.object({
    kind: z.literal('target.revised'),
    runs: z.number().int().min(1),
    overs: z.number().min(0.1),
    method: z.literal('manual'),
  }),
  z.object({
    kind: z.literal('innings.closed'),
    reason: z.enum(['overs', 'all_out', 'target_reached', 'declared', 'abandoned']),
  }),
  z.object({
    kind: z.literal('match.status.changed'),
    status: z.enum(['paused', 'resumed', 'abandoned', 'cancelled']),
  }),
]);

/** UUIDv7 is what the device generates; accept any UUID shape on the wire. */
export const eventIdSchema = z.string().uuid();

export const matchEventSchema = z.object({
  id: eventIdSchema,
  matchId: z.string().min(1),
  localSeq: z.number().int().min(0),
  serverSeq: z.number().int().min(0).nullable(),
  actorId: z.string().min(1),
  deviceId: z.string().min(1),
  at: z.string().datetime(),
  payload: payloadSchema,
});

/** POST /matches/:id/events — ARCHITECTURE §4.4. */
export const pushEventsRequestSchema = z.object({
  events: z.array(matchEventSchema).min(1).max(200),
  afterServerSeq: z.number().int().min(0),
});

export const pushEventsResponseSchema = z.object({
  accepted: z.array(z.object({ id: eventIdSchema, serverSeq: z.number().int().min(0) })),
  rejected: z.array(z.object({ id: eventIdSchema, code: z.string(), detail: z.string() })),
});

export const divergedResponseSchema = z.object({
  code: z.literal('DIVERGED'),
  serverSeq: z.number().int().min(0),
  events: z.array(matchEventSchema),
});

export type PushEventsRequest = z.infer<typeof pushEventsRequestSchema>;
export type PushEventsResponse = z.infer<typeof pushEventsResponseSchema>;
export type DivergedResponse = z.infer<typeof divergedResponseSchema>;
