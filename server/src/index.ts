import { makeApi } from './api.js';
import { loadProvider, migrate, pool, saveProvider } from './database.js';
import { encryptionKey } from './security.js';
import { runSync } from './sync.js';
import { seedMockCatalog } from './mock.js';

async function main() {
  const apiToken = process.env.API_TOKEN;
  const credentialKey = process.env.CREDENTIAL_KEY;
  if (!apiToken || apiToken.length < 32) throw new Error('API_TOKEN must contain at least 32 characters.');
  if (!credentialKey) throw new Error('CREDENTIAL_KEY is required.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const key = encryptionKey(credentialKey);
  await migrate();
  if (process.env.MOCK_CATALOG === '1') await seedMockCatalog();
  if (process.env.XTREAM_BASE_URL && process.env.XTREAM_USERNAME && process.env.XTREAM_PASSWORD) {
    const existing = await loadProvider(key);
    if (!existing || existing.baseUrl !== process.env.XTREAM_BASE_URL || existing.username !== process.env.XTREAM_USERNAME || existing.password !== process.env.XTREAM_PASSWORD) {
      await saveProvider({ baseUrl: process.env.XTREAM_BASE_URL, username: process.env.XTREAM_USERNAME, password: process.env.XTREAM_PASSWORD }, key);
    }
  }
  const app = makeApi({ apiToken, credentialKey: key });
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 8080);
  await app.listen({ host, port });
  const sync = () => void runSync(key).catch((error) => app.log.error({ err: error }, 'Catalog synchronization failed'));
  if (process.env.MOCK_CATALOG !== '1') sync();
  const timer = process.env.MOCK_CATALOG === '1' ? undefined : setInterval(sync, Number(process.env.SYNC_INTERVAL_HOURS ?? 12) * 3_600_000);
  const stop = async () => { if (timer) clearInterval(timer); await app.close(); await pool.end(); process.exit(0); };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Startup failed.'); process.exitCode = 1; });
