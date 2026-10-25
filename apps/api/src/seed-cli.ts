import { openDatabase } from './db.js';
import { assertLocalDatabase, DEMO_PASSWORD, demoAccounts, seedDemo } from './seed.js';

const url = process.env['DATABASE_URL'];
assertLocalDatabase(url, process.env['NODE_ENV']);

const { db, close } = await openDatabase(
  url === undefined || url === '' ? { dataDir: './data' } : { url },
);
const added = await seedDemo(db);
await close();

const accounts = demoAccounts();
console.log(`Added ${added} demo account(s); ${accounts.length - added} already existed.`);
console.log(`Password for every demo account: ${DEMO_PASSWORD}`);
console.log('Sign in with the mobile number or the username, e.g.:');
for (const a of accounts.slice(0, 4)) console.log(`  ${a.mobile}  or  ${a.username}   (${a.name})`);
console.log(`  ...and ${accounts.length - 4} more (9000000001-9000000044).`);
