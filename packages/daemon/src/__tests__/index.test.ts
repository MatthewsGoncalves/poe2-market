import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Config } from '../config.js';

function flushPromises(): Promise<void> {
  return new Promise<void>(resolve => setImmediate(resolve));
}

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../cache/cacheStore.js', () => ({
  CacheStore: vi.fn(),
}));

vi.mock('../sync/syncLoop.js', () => ({
  startSyncLoop: vi.fn(),
}));

vi.mock('../sync/leagueValidation.js', () => ({
  assertLeagueSupported: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/server.js', () => ({
  buildServer: vi.fn(),
}));

import { loadConfig } from '../config.js';
import { CacheStore } from '../cache/cacheStore.js';
import { startSyncLoop } from '../sync/syncLoop.js';
import { assertLeagueSupported } from '../sync/leagueValidation.js';
import { buildServer } from '../api/server.js';
import { main } from '../index.js';

const BASE_CONFIG: Config = {
  league: 'TestLeague',
  game: 'poe2',
  syncIntervalMs: 600000,
  snipeDiscountThreshold: 0.70,
  snipeMinValueChaos: 20,
  currencyErrorMinDivines: 1.5,
  currencyErrorTolerancePct: 0.20,
  daemonPort: 3001,
  poewatchBaseUrl: 'https://api.poe.watch',
};

const mockLoadConfig = vi.mocked(loadConfig);
const MockCacheStore = vi.mocked(CacheStore);
const mockStartSyncLoop = vi.mocked(startSyncLoop);
const mockAssertLeagueSupported = vi.mocked(assertLeagueSupported);
const mockBuildServer = vi.mocked(buildServer);

let mockStoreInstance: {
  loadFromDisk: ReturnType<typeof vi.fn>;
  getState: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

let mockServerInstance: {
  listen: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

let mockTeardown: ReturnType<typeof vi.fn> & (() => Promise<void>);

beforeEach(() => {
  mockStoreInstance = {
    loadFromDisk: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue({
      items: [],
      rates: { divineInChaos: 160, exaltedInChaos: 10 },
      lastSyncAt: '',
      league: 'TestLeague',
    }),
    update: vi.fn(),
  };

  mockServerInstance = {
    listen: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  mockTeardown = vi.fn().mockResolvedValue(undefined) as typeof mockTeardown;

  mockLoadConfig.mockReturnValue(BASE_CONFIG);
  MockCacheStore.mockImplementation(() => mockStoreInstance as never);
  mockStartSyncLoop.mockReturnValue(mockTeardown as () => Promise<void>);
  mockBuildServer.mockReturnValue(mockServerInstance as never);

  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
  vi.restoreAllMocks();
});

describe('main() — startup sequence', () => {
  it('calls loadFromDisk before startSyncLoop before server.listen', async () => {
    const callOrder: string[] = [];

    mockStoreInstance.loadFromDisk.mockImplementation(async () => {
      callOrder.push('loadFromDisk');
    });
    mockStartSyncLoop.mockImplementation(() => {
      callOrder.push('startSyncLoop');
      return mockTeardown as () => Promise<void>;
    });
    mockServerInstance.listen.mockImplementation(async () => {
      callOrder.push('listen');
    });

    await main();

    expect(callOrder).toEqual(['loadFromDisk', 'startSyncLoop', 'listen']);
  });

  it('passes port and host 127.0.0.1 to server.listen', async () => {
    await main();

    expect(mockServerInstance.listen).toHaveBeenCalledWith({
      port: BASE_CONFIG.daemonPort,
      host: '127.0.0.1',
    });
  });

  it('logs the startup URL after server.listen resolves', async () => {
    await main();

    expect(console.info).toHaveBeenCalledWith('[INFO] Fastify server started', {
      port: BASE_CONFIG.daemonPort,
      url: `http://localhost:${BASE_CONFIG.daemonPort}`,
    });
  });

  it('validates the configured league against poe.watch before loading cache', async () => {
    await main();

    expect(mockAssertLeagueSupported).toHaveBeenCalledWith(BASE_CONFIG);
  });

  it('passes config.league to loadFromDisk', async () => {
    await main();

    expect(mockStoreInstance.loadFromDisk).toHaveBeenCalledWith(BASE_CONFIG.league);
  });

  it('constructs CacheStore with config.league', async () => {
    await main();

    expect(MockCacheStore).toHaveBeenCalledWith(BASE_CONFIG.league);
  });
});

describe('main() — graceful shutdown via SIGTERM', () => {
  it('SIGTERM awaits sync loop teardown, server.close, then process.exit(0)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const callOrder: string[] = [];
    mockTeardown.mockImplementation(async () => { callOrder.push('stopSyncLoop'); });
    mockServerInstance.close.mockImplementation(async () => { callOrder.push('serverClose'); });

    await main();

    process.emit('SIGTERM');
    await flushPromises();

    expect(mockTeardown).toHaveBeenCalledOnce();
    expect(mockServerInstance.close).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(['stopSyncLoop', 'serverClose']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe('main() — graceful shutdown via SIGINT', () => {
  it('SIGINT calls sync loop teardown and exits with code 0', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await main();

    process.emit('SIGINT');
    await flushPromises();

    expect(mockTeardown).toHaveBeenCalledOnce();
    expect(mockServerInstance.close).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe('main() — double shutdown guard', () => {
  it('calls teardown and process.exit exactly once when both SIGTERM and SIGINT fire', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await main();

    process.emit('SIGTERM');
    process.emit('SIGINT');
    await flushPromises();

    expect(mockTeardown).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe('main() — server listen failure', () => {
  it('exits with code 1 when server.listen rejects', async () => {
    mockServerInstance.listen.mockRejectedValue(new Error('listen EADDRINUSE :::3001'));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await main();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs the error message when server.listen rejects', async () => {
    const listenError = new Error('listen EADDRINUSE :::3001');
    mockServerInstance.listen.mockRejectedValue(listenError);
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await main();

    expect(console.error).toHaveBeenCalledWith('[ERROR] Failed to start server', {
      error: listenError.message,
    });
  });

  it('does not log the startup URL when server.listen rejects', async () => {
    mockServerInstance.listen.mockRejectedValue(new Error('port in use'));
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await main();

    expect(console.info).not.toHaveBeenCalledWith(
      '[INFO] Fastify server started',
      expect.anything(),
    );
  });
});
