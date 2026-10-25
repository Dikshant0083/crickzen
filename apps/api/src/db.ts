import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  close: () => Promise<void>;
}

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Real Postgres (Neon, through its pooled `-pooler` host) when a URL is given;
 * otherwise embedded PGlite, on disk at `dataDir` or in memory for tests.
 * Migrations run on open either way.
 */
export async function openDatabase(
  options: { url?: string; dataDir?: string } = {},
): Promise<Database> {
  if (options.url !== undefined) {
    const client = postgres(options.url, { max: 10 });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder });
    return { db: db as unknown as Db, close: () => client.end() };
  }
  const client = new PGlite(options.dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}
