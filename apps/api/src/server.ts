import { buildApp } from './app.js';
import { openDatabase } from './db.js';

const secret = process.env['JWT_SECRET'] ?? '';
if (secret.length < 32) {
  console.error('JWT_SECRET must be set to at least 32 random characters (see .env.example).');
  process.exit(1);
}

const url = process.env['DATABASE_URL'];
const { db, close } = await openDatabase(
  url === undefined || url === '' ? { dataDir: './data' } : { url },
);
const app = await buildApp({ db, jwtSecret: new TextEncoder().encode(secret), logger: true });
app.addHook('onClose', close);

await app.listen({ port: Number(process.env['PORT'] ?? 4000), host: '0.0.0.0' });

// Render's free plan sleeps after 15 idle minutes; a ping through the public URL counts as traffic.
// shortcut: uses ~744 of the 750 free hours a month, so only one always-on free service; drop it when on a paid plan.
const self = process.env['RENDER_EXTERNAL_URL'];
if (self !== undefined) {
  setInterval(() => fetch(`${self}/health`).catch(() => {}), 14 * 60_000);
}
