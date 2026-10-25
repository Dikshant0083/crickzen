import { defineConfig } from 'vitest/config';

// Each test opens a fresh PGlite and hashes passwords with real argon2id: slow by design.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
