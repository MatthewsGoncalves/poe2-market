import { describe, it, expect } from 'vitest';
import { fromChaos, toChaos } from '../utils/currency';

const RATES = { divineInChaos: 160, exaltedInChaos: 10 };

describe('currency conversion', () => {
  it('converts chaos to divine for display without changing economic value', () => {
    expect(fromChaos(160, 'divine', RATES)).toBe(1);
    expect(fromChaos(160, 'chaos', RATES)).toBe(160);
  });

  it('round-trips min profit through display currency', () => {
    const chaos = toChaos(1, 'divine', RATES);
    expect(chaos).toBe(160);
    expect(fromChaos(chaos, 'chaos', RATES)).toBe(160);
    expect(fromChaos(chaos, 'divine', RATES)).toBe(1);
  });
});
