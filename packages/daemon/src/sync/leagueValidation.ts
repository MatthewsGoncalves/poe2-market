import { fetchLeagues } from '../sync/poewatchClient.js';
import type { Config } from '../config.js';

/** League id sent to poe.watch `/compact` (may differ from in-game / trade league name). */
export function poewatchLeagueId(config: Config): string {
  return config.poewatchLeague ?? config.league;
}

export async function assertLeagueSupported(config: Config): Promise<void> {
  const dataLeague = poewatchLeagueId(config);
  const leagues = await fetchLeagues(config.game, config.poewatchBaseUrl);

  if (!leagues.includes(dataLeague)) {
    const poe2Leagues = leagues.filter(
      (name) => !['Standard', 'Hardcore', 'Solo Self-Found'].includes(name),
    );
    throw new Error(
      `config.json poewatch league "${dataLeague}" is not available on poe.watch for ${config.game}. ` +
        `Available: ${poe2Leagues.join(', ')}.`,
    );
  }

  if (dataLeague !== config.league) {
    console.warn('[WARN] poe.watch uses a different league id than trade/in-game', {
      league: config.league,
      poewatchLeague: dataLeague,
      expansionName: config.expansionName,
    });
  } else {
    console.info('[INFO] League validated against poe.watch', {
      league: config.league,
      expansionName: config.expansionName,
      itemSource: 'poe.watch',
    });
  }
}
