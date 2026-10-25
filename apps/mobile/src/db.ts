import { type MatchEvent, type MatchState, type Payload, replay } from '@criczen/engine';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { type SQLiteDatabase, useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchMeta } from './match';
import type { Fixture, Tournament } from './tournament';

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY NOT NULL,
      meta TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      match_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      body TEXT NOT NULL,
      UNIQUE (match_id, seq)
    );
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      mobile TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'batter',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fixtures (
      id TEXT PRIMARY KEY NOT NULL,
      tournament_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      body TEXT NOT NULL,
      match_id TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      player_ids TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export type Role = 'batter' | 'bowler' | 'allrounder' | 'keeper';

export interface Player {
  id: string;
  name: string;
  mobile: string | null;
  role: Role;
}

export interface Team {
  id: string;
  name: string;
  playerIds: string[];
}

export function listPlayers(db: SQLiteDatabase): Promise<Player[]> {
  return db.getAllAsync<Player>(
    'SELECT id, name, mobile, role FROM players ORDER BY name COLLATE NOCASE',
  );
}

export function getPlayer(db: SQLiteDatabase, id: string): Promise<Player | null> {
  return db.getFirstAsync<Player>('SELECT id, name, mobile, role FROM players WHERE id = ?', id);
}

/** Inserts or updates. Returns an error message when the mobile number belongs to someone else. */
export async function savePlayer(db: SQLiteDatabase, player: Player): Promise<string | null> {
  if (player.mobile !== null) {
    const owner = await db.getFirstAsync<{ id: string; name: string }>(
      'SELECT id, name FROM players WHERE mobile = ?',
      player.mobile,
    );
    if (owner !== null && owner.id !== player.id) {
      return `${player.mobile} already belongs to ${owner.name}`;
    }
  }
  await db.runAsync(
    `INSERT INTO players (id, name, mobile, role, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, mobile = excluded.mobile, role = excluded.role`,
    player.id,
    player.name,
    player.mobile,
    player.role,
    new Date().toISOString(),
  );
  return null;
}

export async function listTeams(db: SQLiteDatabase): Promise<Team[]> {
  const rows = await db.getAllAsync<{ id: string; name: string; player_ids: string }>(
    'SELECT id, name, player_ids FROM teams ORDER BY name COLLATE NOCASE',
  );
  return rows.map((r) => ({ id: r.id, name: r.name, playerIds: JSON.parse(r.player_ids) }));
}

/** Inserts or updates. Returns an error message when another team has the name. */
export async function saveTeam(db: SQLiteDatabase, team: Team): Promise<string | null> {
  const clash = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM teams WHERE name = ? AND id != ?',
    team.name,
    team.id,
  );
  if (clash !== null) return `A team called ${team.name} already exists`;
  await db.runAsync(
    `INSERT INTO teams (id, name, player_ids, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, player_ids = excluded.player_ids`,
    team.id,
    team.name,
    JSON.stringify(team.playerIds),
    new Date().toISOString(),
  );
  return null;
}

export interface StoredMatch {
  id: string;
  meta: MatchMeta;
  state: MatchState;
  createdAt: string;
}

/** Every match, replayed, newest first. A T20 replays in well under a millisecond. */
export async function loadAllMatches(db: SQLiteDatabase): Promise<StoredMatch[]> {
  const rows = await db.getAllAsync<{ id: string; meta: string; created_at: string }>(
    'SELECT id, meta, created_at FROM matches ORDER BY created_at DESC',
  );
  const out: StoredMatch[] = [];
  for (const row of rows) {
    const result = replay(await loadEvents(db, row.id));
    if (result.ok) {
      out.push({
        id: row.id,
        meta: JSON.parse(row.meta) as MatchMeta,
        state: result.value,
        createdAt: row.created_at,
      });
    }
  }
  return out;
}

// shortcut: one local scorer, no accounts; real actor ids arrive with Phase 2 auth.
function toEvent(matchId: string, localSeq: number, payload: Payload): MatchEvent {
  return {
    id: randomUUID(),
    matchId,
    localSeq,
    serverSeq: null,
    actorId: 'local',
    deviceId: 'local',
    at: new Date().toISOString(),
    payload,
  };
}

async function insertEvents(db: SQLiteDatabase, events: readonly MatchEvent[]) {
  for (const e of events) {
    await db.runAsync(
      'INSERT INTO events (id, match_id, seq, body) VALUES (?, ?, ?, ?)',
      e.id,
      e.matchId,
      e.localSeq,
      JSON.stringify(e),
    );
  }
}

/** Creates a match from its setup payloads. Returns an error message when the engine rejects them. */
export async function createMatch(
  db: SQLiteDatabase,
  matchId: string,
  meta: MatchMeta,
  payloads: readonly Payload[],
): Promise<string | null> {
  const events = payloads.map((p, i) => toEvent(matchId, i, p));
  const result = replay(events);
  if (!result.ok) return result.error.detail;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO matches (id, meta, created_at) VALUES (?, ?, ?)',
      matchId,
      JSON.stringify(meta),
      new Date().toISOString(),
    );
    await insertEvents(db, events);
  });
  return null;
}

export async function loadEvents(db: SQLiteDatabase, matchId: string): Promise<MatchEvent[]> {
  const rows = await db.getAllAsync<{ body: string }>(
    'SELECT body FROM events WHERE match_id = ? ORDER BY seq',
    matchId,
  );
  return rows.map((r) => JSON.parse(r.body) as MatchEvent);
}

export interface LoadedMatch {
  meta: MatchMeta;
  state: MatchState;
  events: MatchEvent[];
}

/**
 * A match's log, its replayed state, and `append`. The write path follows
 * ARCHITECTURE §4.2: the engine validates first, the event is on disk before
 * the screen shows it.
 */
export function useMatch(db: SQLiteDatabase, matchId: string) {
  const [match, setState] = useState<LoadedMatch | null>(null);
  // The latest log, read by append so a tap before the re-render never sees a stale one.
  const latest = useRef<LoadedMatch | null>(null);
  const setMatch = useCallback((m: LoadedMatch) => {
    latest.current = m;
    setState(m);
  }, []);
  const [error, setError] = useState<string | null>(null);
  // A fast double tap must not append twice while the first write is in flight.
  const saving = useRef(false);

  useEffect(() => {
    (async () => {
      const row = await db.getFirstAsync<{ meta: string }>(
        'SELECT meta FROM matches WHERE id = ?',
        matchId,
      );
      if (row === null) return setError('Match not found');
      const events = await loadEvents(db, matchId);
      const result = replay(events);
      if (!result.ok) return setError(result.error.detail);
      setMatch({ meta: JSON.parse(row.meta) as MatchMeta, state: result.value, events });
    })().catch((e: unknown) => setError(String(e)));
  }, [db, matchId, setMatch]);

  /** Returns the engine's reason when the event is illegal; nothing is saved then. */
  const append = useCallback(
    async (payload: Payload): Promise<string | null> => {
      const match = latest.current;
      if (match === null || saving.current) return null;
      const event = toEvent(matchId, match.events.length, payload);
      const events = [...match.events, event];
      const result = replay(events);
      if (!result.ok) return result.error.detail;
      saving.current = true;
      try {
        await insertEvents(db, [event]);
        setMatch({ ...match, state: result.value, events });
        return null;
      } catch (e) {
        return `Could not save: ${String(e)}`;
      } finally {
        saving.current = false;
      }
    },
    [db, matchId, setMatch],
  );

  return { match, error, append };
}

/** Loads on every focus, so lists are fresh after editing on another screen. */
export function useFocusLoad<T>(load: (db: SQLiteDatabase) => Promise<T>): [T | null, () => void] {
  const db = useSQLiteContext();
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    load(db).then(setData);
  }, [db, load]);
  useFocusEffect(reload);
  return [data, reload];
}

export async function listTournaments(db: SQLiteDatabase): Promise<Tournament[]> {
  const rows = await db.getAllAsync<{ body: string }>(
    'SELECT body FROM tournaments ORDER BY created_at DESC',
  );
  return rows.map((r) => JSON.parse(r.body) as Tournament);
}

export async function getTournament(db: SQLiteDatabase, id: string): Promise<Tournament | null> {
  const row = await db.getFirstAsync<{ body: string }>(
    'SELECT body FROM tournaments WHERE id = ?',
    id,
  );
  return row === null ? null : (JSON.parse(row.body) as Tournament);
}

export async function createTournament(db: SQLiteDatabase, t: Tournament, fixtures: Fixture[]) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO tournaments (id, body, created_at) VALUES (?, ?, ?)',
      t.id,
      JSON.stringify(t),
      t.createdAt,
    );
    await insertFixtures(db, fixtures);
  });
}

export async function insertFixtures(db: SQLiteDatabase, fixtures: readonly Fixture[]) {
  for (const f of fixtures) {
    await db.runAsync(
      'INSERT INTO fixtures (id, tournament_id, seq, body, match_id) VALUES (?, ?, ?, ?, ?)',
      f.id,
      f.tournamentId,
      f.seq,
      JSON.stringify(f),
      f.matchId,
    );
  }
}

export async function listFixtures(db: SQLiteDatabase, tournamentId: string): Promise<Fixture[]> {
  const rows = await db.getAllAsync<{ body: string; match_id: string | null }>(
    'SELECT body, match_id FROM fixtures WHERE tournament_id = ? ORDER BY seq',
    tournamentId,
  );
  return rows.map((r) => ({ ...(JSON.parse(r.body) as Fixture), matchId: r.match_id }));
}

export async function getFixture(db: SQLiteDatabase, id: string): Promise<Fixture | null> {
  const row = await db.getFirstAsync<{ body: string; match_id: string | null }>(
    'SELECT body, match_id FROM fixtures WHERE id = ?',
    id,
  );
  return row === null ? null : { ...(JSON.parse(row.body) as Fixture), matchId: row.match_id };
}

export async function linkFixture(db: SQLiteDatabase, fixtureId: string, matchId: string) {
  await db.runAsync('UPDATE fixtures SET match_id = ? WHERE id = ?', matchId, fixtureId);
}
