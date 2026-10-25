import type { SQLiteDatabase } from 'expo-sqlite';
import {
  createMatch,
  createTournament,
  loadAllMatches,
  type Player,
  type Role,
  savePlayer,
  saveTeam,
  setMatchMeta,
} from './db';
import { setupPayloads } from './match';
import { rng, simulate } from './simulate';
import { type Fixture, firstFixtures, suggestPlayerOfMatch, type Tournament } from './tournament';

const TEAMS: readonly [string, string[]][] = [
  [
    'Royal Strikers',
    [
      'Aarav Sharma',
      'Rohan Mehta',
      'Vikram Singh',
      'Karan Patel',
      'Arjun Nair',
      'Siddharth Rao',
      'Manish Yadav',
      'Pranav Joshi',
      'Harsh Gupta',
      'Nikhil Verma',
      'Deepak Chauhan',
    ],
  ],
  [
    'Thunder Kings',
    [
      'Ishaan Reddy',
      'Aditya Kulkarni',
      'Rahul Desai',
      'Varun Iyer',
      'Kunal Shah',
      'Yash Malhotra',
      'Gaurav Pandey',
      'Sameer Khan',
      'Abhishek Mishra',
      'Tarun Bhatt',
      'Mohit Saini',
    ],
  ],
  [
    'Coastal Warriors',
    [
      'Dev Menon',
      'Akash Pillai',
      'Rajat Jain',
      'Sahil Kapoor',
      'Ankit Tiwari',
      'Ritesh Dubey',
      'Vivek Sinha',
      'Naveen Kumar',
      'Sunil Rawat',
      'Imran Qureshi',
      'Ajay Thakur',
    ],
  ],
  [
    'Desert Eagles',
    [
      'Kabir Bhatia',
      'Om Prakash',
      'Lakshya Sen',
      'Parth Agarwal',
      'Ravi Bishnoi',
      'Hemant Rathore',
      'Jatin Saxena',
      'Uday Chopra',
      'Bharat Meena',
      'Firoz Ali',
      'Chetan Gehlot',
    ],
  ],
];

/** Position in the XI decides the role: openers bat, the last five bowl. */
function roleFor(i: number): Role {
  if (i === 2) return 'keeper';
  if (i < 5) return 'batter';
  if (i < 7) return 'allrounder';
  return 'bowler';
}

export async function hasDemoData(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM teams WHERE id LIKE 'demo-%'",
  );
  return (row?.n ?? 0) > 0;
}

/**
 * Four teams of 11, one friendly and a 6-over league with four of its six
 * matches already played, so every screen has something to show.
 * Mobile numbers are fake (90000 000xx).
 */
export async function loadDemoData(db: SQLiteDatabase): Promise<string | null> {
  const clash = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM teams WHERE name IN (${TEAMS.map(() => '?').join(', ')})`,
    ...TEAMS.map(([name]) => name),
  );
  if (clash !== null) return `You already have a team called ${clash.name}.`;
  const random = rng(2026);
  const teams: { id: string; name: string; players: Player[] }[] = [];

  for (const [t, [teamName, names]] of TEAMS.entries()) {
    const players = names.map(
      (name, i): Player => ({
        id: `demo-p${t}-${i}`,
        name,
        mobile: `90000${String(t * 11 + i + 1).padStart(5, '0')}`,
        role: roleFor(i),
      }),
    );
    for (const p of players) await savePlayer(db, p);
    const team = { id: `demo-t${t}`, name: teamName, players };
    await saveTeam(db, { id: team.id, name: teamName, playerIds: players.map((p) => p.id) });
    teams.push(team);
  }

  const names = Object.fromEntries(teams.flatMap((t) => t.players.map((p) => [p.id, p.name])));
  const squad = (t: (typeof teams)[number]) => ({
    ids: t.players.map((p) => p.id),
    names: {},
    captainId: t.players[0]?.id ?? '',
    keeperId: t.players[2]?.id ?? '',
  });

  const play = async (
    matchId: string,
    home: (typeof teams)[number],
    away: (typeof teams)[number],
    overs: number,
  ) => {
    const payloads = simulate(
      setupPayloads({
        matchId,
        teams: [home.name, away.name],
        squads: [squad(home), squad(away)],
        overs,
        tennisBall: true,
        tossWinner: random() < 0.5 ? 0 : 1,
        tossChoice: random() < 0.5 ? 'bat' : 'bowl',
      }),
      random,
    );
    const error = await createMatch(db, matchId, { names }, payloads);
    if (error !== null) throw new Error(error);
  };

  const [a, b, c, d] = teams as [
    (typeof teams)[number],
    (typeof teams)[number],
    (typeof teams)[number],
    (typeof teams)[number],
  ];
  await play('demo-m-friendly', a, c, 10);

  const t: Tournament = {
    id: 'demo-cup',
    name: 'Demo Premier League',
    format: 'league',
    legs: 1,
    playoffs: 'final',
    overs: 6,
    ball: 'tennis',
    teams: [a, b, c, d].map((x) => ({ id: x.id, name: x.name })),
    createdAt: new Date().toISOString(),
  };
  const byName = new Map(teams.map((x) => [x.name, x]));
  const fixtures: Fixture[] = [];
  for (const [seq, f] of firstFixtures(t).entries()) {
    const matchId = seq < 4 ? `demo-m-cup-${seq}` : null;
    const home = byName.get(f.home);
    const away = f.away === null ? undefined : byName.get(f.away);
    if (matchId !== null && home !== undefined && away !== undefined)
      await play(matchId, home, away, t.overs);
    fixtures.push({ ...f, id: `demo-f${seq}`, tournamentId: t.id, seq, matchId });
  }
  await createTournament(db, t, fixtures);

  // Award Player of the Match on the finished games.
  for (const m of await loadAllMatches(db)) {
    const best = m.id.startsWith('demo-') ? suggestPlayerOfMatch(m.state) : null;
    if (best !== null && m.state.result !== null)
      await setMatchMeta(db, m.id, { ...m.meta, playerOfMatch: best });
  }
  return null;
}

/** Deletes only what loadDemoData created: every id it uses starts with "demo-". */
export async function removeDemoData(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM fixtures WHERE tournament_id LIKE 'demo-%'");
    await db.runAsync("DELETE FROM tournaments WHERE id LIKE 'demo-%'");
    await db.runAsync("DELETE FROM events WHERE match_id LIKE 'demo-%'");
    await db.runAsync("DELETE FROM matches WHERE id LIKE 'demo-%'");
    await db.runAsync("DELETE FROM teams WHERE id LIKE 'demo-%'");
    await db.runAsync("DELETE FROM players WHERE id LIKE 'demo-%'");
  });
}
