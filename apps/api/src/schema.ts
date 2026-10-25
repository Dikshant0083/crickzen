import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Identity (ARCHITECTURE §5.1, §5.3). Users sign in with a mobile number or a
 * username. Mobile numbers are not verified yet (no SMS OTP), so nothing may
 * treat "same mobile" as proof of identity.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 10 digits, normalised; null once the account is deleted. */
  mobile: text('mobile').unique(),
  /** Lower-case handle; null once deleted. */
  username: text('username').unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/** Rotating refresh tokens with reuse detection by family (§5.3). Only hashes are stored. */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    familyId: uuid('family_id').notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    createdIp: text('created_ip'),
    createdUa: text('created_ua'),
  },
  (t) => [index('refresh_tokens_family_idx').on(t.familyId)],
);
