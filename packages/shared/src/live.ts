import { z } from 'zod';

const label = z.string().max(60);

/**
 * What a spectator sees of a live match: display-ready numbers and names, no
 * event log. The scorer's phone sends a fresh one after every ball.
 */
export const liveSnapshotSchema = z.object({
  title: z.string().min(1).max(130),
  totalOvers: z.number().int().min(1).max(100),
  result: z.string().max(200).nullable(),
  innings: z
    .array(
      z.object({
        team: label,
        runs: z.number().int().min(0),
        wickets: z.number().int().min(0).max(10),
        overs: z.string().max(8),
        target: z.number().int().min(1).nullable(),
        batters: z
          .array(
            z.object({
              name: label,
              runs: z.number().int().min(0),
              balls: z.number().int().min(0),
              fours: z.number().int().min(0),
              sixes: z.number().int().min(0),
              /** "c Rahul b Arjun"; null while batting. */
              out: z.string().max(120).nullable(),
              striker: z.boolean(),
            }),
          )
          .max(12),
        bowlers: z
          .array(
            z.object({
              name: label,
              overs: z.string().max(8),
              runs: z.number().int().min(0),
              wickets: z.number().int().min(0).max(10),
              /** Bowling the over in progress (or the last one, between overs). */
              current: z.boolean().default(false),
            }),
          )
          .max(12),
        /** Ball labels of the over in progress: "1", "4", "W", "wd". */
        thisOver: z.array(z.string().max(6)).max(30),
      }),
    )
    .max(4),
  /** The latest balls of the current innings, newest first. Older app versions send none. */
  commentary: z
    .array(
      z.object({
        /** "14.3" */
        over: z.string().max(8),
        /** The ball's label, as in thisOver. */
        ball: z.string().max(6),
        text: z.string().max(200),
      }),
    )
    .max(30)
    .default([]),
  /** A milestone the latest ball reached ("FIFTY! Rahul 50 (31)"); screens show each id once. */
  highlight: z
    .object({
      id: z.string().max(80),
      kind: z.enum(['bat', 'bowl', 'team']),
      text: z.string().max(100),
    })
    .nullable()
    .default(null),
});

export type LiveSnapshot = z.infer<typeof liveSnapshotSchema>;
