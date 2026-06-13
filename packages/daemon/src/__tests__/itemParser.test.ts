import { describe, it, expect } from 'vitest';
import { parseItemText } from '../sync/itemParser.js';

const RARE_BOW = `Item Class: Bows
Rarity: Rare
Doom Roar
Advanced Dualstring Bow
--------
Quality: +20% (augmented)
Physical Damage: 50-90 (augmented)
Critical Hit Chance: 5.00%
Attacks per Second: 1.20
--------
Requirements:
Level: 65
Dex: 159
--------
Item Level: 82
--------
+15% to Cold Resistance (implicit)
--------
+25 to maximum Life
+30% to Cold Resistance
12% increased Attack Speed
--------
Corrupted`;

const UNIQUE = `Item Class: Gloves
Rarity: Unique
Headhunter
Leather Belt
--------
Item Level: 84
--------
+40 to maximum Life`;

const GEM = `Item Class: Skill Gems
Rarity: Gem
Fireball
--------
Level: 20
Quality: +18%
--------
Deals fire damage`;

const ADVANCED = `Item Class: Body Armours
Rarity: Rare
Doom Shelter
Advanced Vaal Cuirass
--------
Item Level: 82
--------
{ Implicit Modifier "X" (Tier: 1) }
+12 to Spirit (implicit)
--------
{ Prefix Modifier "Athlete's" (Tier: 2) — Life }
+25 to maximum Life
{ Suffix Modifier "of the Walrus" (Tier: 4) — Cold, Resistance }
+30% to Cold Resistance`;

describe('parseItemText', () => {
  it('parses a rare item with metadata, implicit tag, and explicit mods', () => {
    const item = parseItemText(RARE_BOW);
    expect(item.rarity).toBe('Rare');
    expect(item.itemClass).toBe('Bows');
    expect(item.name).toBe('Doom Roar');
    expect(item.baseType).toBe('Advanced Dualstring Bow');
    expect(item.itemLevel).toBe(82);
    expect(item.quality).toBe(20);
    expect(item.corrupted).toBe(true);

    expect(item.mods).toEqual([
      { raw: '+15% to Cold Resistance', values: [15], group: 'implicit' },
      { raw: '+25 to maximum Life', values: [25] },
      { raw: '+30% to Cold Resistance', values: [30] },
      { raw: '12% increased Attack Speed', values: [12] },
    ]);
  });

  it('parses a unique item name and base type', () => {
    const item = parseItemText(UNIQUE);
    expect(item.rarity).toBe('Unique');
    expect(item.name).toBe('Headhunter');
    expect(item.baseType).toBe('Leather Belt');
    expect(item.mods).toEqual([{ raw: '+40 to maximum Life', values: [40] }]);
  });

  it('parses advanced mod descriptions into affix, tier, and modName', () => {
    const item = parseItemText(ADVANCED);
    expect(item.name).toBe('Doom Shelter');
    expect(item.mods).toEqual([
      { raw: '+12 to Spirit', values: [12], group: 'implicit', modName: 'X', tier: 1 },
      {
        raw: '+25 to maximum Life',
        values: [25],
        group: 'explicit',
        affix: 'prefix',
        tier: 2,
        modName: "Athlete's",
      },
      {
        raw: '+30% to Cold Resistance',
        values: [30],
        group: 'explicit',
        affix: 'suffix',
        tier: 4,
        modName: 'of the Walrus',
      },
    ]);
  });

  it('parses gem level and quality', () => {
    const item = parseItemText(GEM);
    expect(item.rarity).toBe('Gem');
    expect(item.name).toBe('Fireball');
    expect(item.gemLevel).toBe(20);
    expect(item.gemQuality).toBe(18);
  });
});
