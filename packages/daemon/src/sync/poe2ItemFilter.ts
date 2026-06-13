import type { MarketItem } from '../types.js';
import { isKnownPoe2TradeItem, loadTradeItemIndex } from './tradeItemIndex.js';

export async function filterPoe2MarketItems(items: MarketItem[]): Promise<MarketItem[]> {
  const index = await loadTradeItemIndex();
  return items.filter((item) => isKnownPoe2TradeItem(item.name, index));
}

export function filterPoe2MarketItemsWithIndex(
  items: MarketItem[],
  index: Parameters<typeof isKnownPoe2TradeItem>[1],
): MarketItem[] {
  return items.filter((item) => isKnownPoe2TradeItem(item.name, index));
}
