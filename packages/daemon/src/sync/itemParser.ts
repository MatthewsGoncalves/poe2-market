import { extractStatValues } from './statIndex.js';

export type ItemRarity =
  | 'Normal'
  | 'Magic'
  | 'Rare'
  | 'Unique'
  | 'Gem'
  | 'Currency'
  | 'Unknown';

export type AffixKind = 'prefix' | 'suffix';

export interface ParsedMod {
  /** Mod line with the trailing group tag removed. */
  raw: string;
  /** Numeric rolls found on the line, in order. */
  values: number[];
  /** Trade stat group implied by a trailing tag like `(implicit)`, if any. */
  group?: string;
  /** From advanced mod descriptions: prefix or suffix. */
  affix?: AffixKind;
  /** From advanced mod descriptions: modifier tier. */
  tier?: number;
  /** From advanced mod descriptions: modifier name (e.g. "Hale"). */
  modName?: string;
}

interface ModAnnotation {
  affix?: AffixKind;
  tier?: number;
  modName?: string;
  group?: string;
}

export interface ParsedItem {
  itemClass?: string;
  rarity: ItemRarity;
  /** First line after rarity — unique/display name. */
  name?: string;
  /** Base type used for `type_filters`. */
  baseType?: string;
  itemLevel?: number;
  quality?: number;
  corrupted: boolean;
  gemLevel?: number;
  gemQuality?: number;
  mods: ParsedMod[];
  /** Item image, resolved from the market cache by name (not from the paste). */
  icon?: string;
}

const SECTION_SEPARATOR = /^-{3,}$/;

const GROUP_TAG = /\s*\((implicit|rune|enchant|crafted|fractured|desecrated|scourge|veiled)\)\s*$/i;

/**
 * Property/metadata line labels that must never be treated as mods. Matches a
 * line that begins with `Label:`.
 */
const METADATA_LABELS = new Set(
  [
    'item class',
    'rarity',
    'requirements',
    'level',
    'str',
    'dex',
    'int',
    'strength',
    'dexterity',
    'intelligence',
    'sockets',
    'item level',
    'quality',
    'physical damage',
    'elemental damage',
    'chaos damage',
    'cold damage',
    'fire damage',
    'lightning damage',
    'critical hit chance',
    'critical strike chance',
    'attacks per second',
    'reload time',
    'armour',
    'evasion rating',
    'energy shield',
    'spirit',
    'block chance',
    'block',
    'weapon range',
    'radius',
    'limited to',
    'stack size',
    'note',
  ].map((s) => s.toLowerCase()),
);

const FLAG_LINES = new Set(
  ['corrupted', 'mirrored', 'unidentified', 'split', 'identified', 'fractured item'].map((s) =>
    s.toLowerCase(),
  ),
);

function splitSections(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sections: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (SECTION_SEPARATOR.test(line.trim())) {
      if (current.length > 0) sections.push(current);
      current = [];
      continue;
    }
    if (line.trim().length > 0) current.push(line.trim());
  }
  if (current.length > 0) sections.push(current);
  return sections;
}

function readLabeled(line: string): { label: string; value: string } | null {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  return { label: line.slice(0, idx).trim().toLowerCase(), value: line.slice(idx + 1).trim() };
}

function parseRarity(value: string): ItemRarity {
  const v = value.trim().toLowerCase();
  if (v === 'normal') return 'Normal';
  if (v === 'magic') return 'Magic';
  if (v === 'rare') return 'Rare';
  if (v === 'unique') return 'Unique';
  if (v === 'gem') return 'Gem';
  if (v === 'currency') return 'Currency';
  return 'Unknown';
}

function isMetadataLine(line: string): boolean {
  const labeled = readLabeled(line);
  if (labeled && METADATA_LABELS.has(labeled.label)) return true;
  if (FLAG_LINES.has(line.toLowerCase())) return true;
  if (/^requires\b/i.test(line)) return true;
  if (/^~(price|b\/o)\b/i.test(line)) return true;
  if (/\(augmented\)/i.test(line) && labeled) return true;
  return false;
}

function stripGroupTag(line: string): { text: string; group?: string } {
  const match = line.match(GROUP_TAG);
  if (!match) return { text: line.trim() };
  const tag = match[1]?.toLowerCase();
  return { text: line.replace(GROUP_TAG, '').trim(), group: tag };
}

const ANNOTATION = /^\{\s*(crafted\s+|fractured\s+|desecrated\s+)?(prefix|suffix|implicit|rune|enchant|eldritch implicit|scourge)\s+modifier(?:\s+"([^"]+)")?\s*(?:\((?:tier|rank):\s*(\d+)\))?/i;

/** Parse an advanced-mod-description annotation line like `{ Prefix Modifier "Hale" (Tier: 5) — Life }`. */
function parseAnnotation(line: string): ModAnnotation | null {
  if (!line.startsWith('{')) return null;
  const m = line.match(ANNOTATION);
  if (!m) return {};
  const qualifier = (m[1] ?? '').trim().toLowerCase();
  const word = (m[2] ?? '').toLowerCase();
  const annotation: ModAnnotation = {};
  if (m[3]) annotation.modName = m[3];
  if (m[4]) annotation.tier = Number(m[4]);

  if (word === 'prefix') annotation.affix = 'prefix';
  else if (word === 'suffix') annotation.affix = 'suffix';

  if (word.includes('implicit')) annotation.group = 'implicit';
  else if (word === 'rune') annotation.group = 'rune';
  else if (word === 'enchant') annotation.group = 'enchant';
  else annotation.group = 'explicit';

  if (qualifier === 'crafted') annotation.group = 'crafted';
  else if (qualifier === 'fractured') annotation.group = 'fractured';
  else if (qualifier === 'desecrated') annotation.group = 'desecrated';

  return annotation;
}

export function parseItemText(text: string): ParsedItem {
  const sections = splitSections(text);
  const item: ParsedItem = { rarity: 'Unknown', corrupted: false, mods: [] };

  if (sections.length === 0) return item;

  const header = sections[0] ?? [];
  const nonLabeledHeaderLines: string[] = [];

  for (const line of header) {
    const labeled = readLabeled(line);
    if (labeled?.label === 'item class') {
      item.itemClass = labeled.value;
    } else if (labeled?.label === 'rarity') {
      item.rarity = parseRarity(labeled.value);
    } else if (!labeled) {
      nonLabeledHeaderLines.push(line);
    }
  }

  if (nonLabeledHeaderLines.length > 0) item.name = nonLabeledHeaderLines[0];
  if (nonLabeledHeaderLines.length > 1) {
    item.baseType = nonLabeledHeaderLines[1];
  } else if (nonLabeledHeaderLines.length === 1) {
    item.baseType = nonLabeledHeaderLines[0];
  }

  const isGem = (item.itemClass ?? '').toLowerCase().includes('gem') || item.rarity === 'Gem';

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i] ?? [];
    let pending: ModAnnotation | null = null;

    for (const line of section) {
      const labeled = readLabeled(line);

      if (labeled?.label === 'item level') {
        item.itemLevel = Number(labeled.value.replace(/[^0-9.]/g, '')) || undefined;
        continue;
      }
      if (labeled?.label === 'quality') {
        const q = Number(labeled.value.replace(/[^0-9.]/g, '')) || undefined;
        item.quality = q;
        if (isGem) item.gemQuality = q;
        continue;
      }
      if (labeled?.label === 'level' && isGem) {
        item.gemLevel = Number(labeled.value.replace(/[^0-9.]/g, '')) || undefined;
        continue;
      }
      if (FLAG_LINES.has(line.toLowerCase())) {
        if (line.toLowerCase() === 'corrupted') item.corrupted = true;
        continue;
      }

      if (line.startsWith('{')) {
        pending = parseAnnotation(line);
        continue;
      }

      if (isMetadataLine(line)) continue;

      const { text: modText, group } = stripGroupTag(line);
      if (modText.length === 0) continue;

      const mod: ParsedMod = { raw: modText, values: extractStatValues(modText) };
      const resolvedGroup = group ?? pending?.group;
      if (resolvedGroup) mod.group = resolvedGroup;
      if (pending?.affix) mod.affix = pending.affix;
      if (pending?.tier != null) mod.tier = pending.tier;
      if (pending?.modName) mod.modName = pending.modName;
      item.mods.push(mod);
    }
  }

  return item;
}
