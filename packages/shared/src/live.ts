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
            }),
          )
          .max(12),
        /** Ball labels of the over in progress: "1", "4", "W", "wd". */
        thisOver: z.array(z.string().max(6)).max(30),
      }),
    )
    .max(4),
});

export type LiveSnapshot = z.infer<typeof liveSnapshotSchema>;
