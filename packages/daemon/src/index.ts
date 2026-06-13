import { loadConfig } from './config.js';
import { CacheStore } from './cache/cacheStore.js';
import { startSyncLoop } from './sync/syncLoop.js';
import { assertLeagueSupported } from './sync/leagueValidation.js';
import { buildServer } from './api/server.js';

export async function main(): Promise<void> {
  const config = loadConfig();
  await assertLeagueSupported(config);

  const store = new CacheStore(config.league);

  await store.loadFromDisk(config.league);

  const stopSyncLoop = startSyncLoop(store, config);
  const server = buildServer(store, config);

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    await stopSyncLoop();
    await server.close();
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    await server.listen({ port: config.daemonPort, host: '127.0.0.1' });
    console.info('[INFO] Fastify server started', {
      port: config.daemonPort,
      url: `http://localhost:${config.daemonPort}`,
    });
  } catch (err) {
    console.error('[ERROR] Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

if (process.env['VITEST'] !== 'true') {
  main();
}
