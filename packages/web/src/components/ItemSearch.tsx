import { useCallback, useState } from 'react';
import { parseItem, tradeSearch, searchItemNames, searchStats, ApiError } from '../api';
import type {
  ItemNameSuggestion,
  MatchedMod,
  ModSelection,
  ParsedItem,
  StatSuggestion,
} from '../api';
import { buildTradeSearchUrl } from '../utils/tradeUrl';
import { ItemIcon } from './ItemIcon';
import { Autocomplete } from './Autocomplete';

interface Props {
  league: string;
}

interface ExtraMod {
  id: string;
  text: string;
  group: string;
  min?: number;
}

function AffixBadge({ mod }: { mod: MatchedMod }) {
  if (!mod.affix && mod.tier == null) return null;
  const letter = mod.affix === 'prefix' ? 'P' : mod.affix === 'suffix' ? 'S' : '';
  const label = `${letter}${mod.tier ?? ''}`.trim();
  if (!label) return null;
  return (
    <span className={`affix-badge affix-${mod.affix ?? 'other'}`} title={mod.modName ?? undefined}>
      {label}
    </span>
  );
}

interface ModRowState extends ModSelection {
  min?: number;
}

function buildInitialSelections(mods: MatchedMod[]): Record<number, ModRowState> {
  const selections: Record<number, ModRowState> = {};
  for (const mod of mods) {
    selections[mod.index] = {
      enabled: mod.matched,
      min: mod.value,
    };
  }
  return selections;
}

function ItemHeader({ parsed }: { parsed: ParsedItem }) {
  const bits: string[] = [];
  if (parsed.rarity && parsed.rarity !== 'Unknown') bits.push(parsed.rarity);
  if (parsed.itemClass) bits.push(parsed.itemClass);
  if (parsed.itemLevel != null) bits.push(`ilvl ${parsed.itemLevel}`);
  return (
    <div className="item-search-header">
      <ItemIcon src={parsed.icon} alt={parsed.name ?? 'item'} size={48} />
      <div>
        <p className={`eval-result-name rarity-${(parsed.rarity ?? 'normal').toLowerCase()}`}>
          {parsed.name ?? parsed.baseType ?? 'Item'}
        </p>
        {parsed.baseType && parsed.baseType !== parsed.name && (
          <p className="item-search-base">{parsed.baseType}</p>
        )}
        {bits.length > 0 && <p className="item-search-meta">{bits.join(' · ')}</p>}
      </div>
    </div>
  );
}

export function ItemSearch({ league }: Props) {
  const [itemText, setItemText] = useState('');
  const [parsed, setParsed] = useState<ParsedItem | null>(null);
  const [mods, setMods] = useState<MatchedMod[]>([]);
  const [selections, setSelections] = useState<Record<number, ModRowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [searchUrl, setSearchUrl] = useState<string | null>(null);
  const [extraMods, setExtraMods] = useState<ExtraMod[]>([]);

  const fetchNames = useCallback(async (q: string) => (await searchItemNames(q)).results, []);
  const fetchStats = useCallback(async (q: string) => (await searchStats(q)).results, []);

  const openNameSearch = (suggestion: ItemNameSuggestion) => {
    window.open(buildTradeSearchUrl(league, suggestion.name), '_blank', 'noopener,noreferrer');
  };

  const addExtraMod = (stat: StatSuggestion) => {
    setExtraMods((prev) =>
      prev.some((m) => m.id === stat.id)
        ? prev
        : [...prev, { id: stat.id, text: stat.text, group: stat.group }],
    );
  };

  const setExtraMin = (id: string, value: string) => {
    const min = value === '' ? undefined : Number(value);
    setExtraMods((prev) => prev.map((m) => (m.id === id ? { ...m, min } : m)));
  };

  const removeExtraMod = (id: string) => {
    setExtraMods((prev) => prev.filter((m) => m.id !== id));
  };

  const handleParse = async () => {
    if (!itemText.trim()) {
      setError('Cole o texto do item primeiro (Ctrl+C no jogo).');
      return;
    }
    setError(null);
    setParsing(true);
    setTotal(null);
    setSearchUrl(null);
    try {
      const res = await parseItem(itemText);
      setParsed(res.parsed);
      setMods(res.matchedMods);
      setSelections(buildInitialSelections(res.matchedMods));
    } catch (err) {
      setParsed(null);
      setMods([]);
      setError(err instanceof ApiError ? err.message : 'Falha ao analisar o item.');
    } finally {
      setParsing(false);
    }
  };

  const toggleMod = (index: number, enabled: boolean) => {
    setSelections((prev) => ({ ...prev, [index]: { ...prev[index], enabled } }));
  };

  const setModMin = (index: number, value: string) => {
    const min = value === '' ? undefined : Number(value);
    setSelections((prev) => ({ ...prev, [index]: { ...prev[index], min } }));
  };

  const handleSearch = async () => {
    setError(null);
    setSearching(true);
    try {
      const selectionPayload: Record<number, ModSelection> = {};
      for (const [key, value] of Object.entries(selections)) {
        selectionPayload[Number(key)] = { enabled: value.enabled, min: value.min };
      }
      const extraStats = extraMods.map((m) => ({ id: m.id, min: m.min }));
      const res = await tradeSearch({
        league,
        itemText,
        selections: selectionPayload,
        extraStats,
        corrupted: parsed?.corrupted,
      });
      setTotal(res.total);
      setSearchUrl(res.url);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao gerar a busca.');
    } finally {
      setSearching(false);
    }
  };

  const matchedCount = mods.filter((m) => m.matched).length;

  return (
    <div className="evaluator">
      <div className="field">
        <label className="field-label">Buscar por nome</label>
        <Autocomplete<ItemNameSuggestion>
          placeholder="Ex: Headhunter, Divine Orb…"
          fetchSuggestions={fetchNames}
          getKey={(it) => it.name}
          renderItem={(it) => (
            <span className="autocomplete-name">
              <ItemIcon src={it.icon} alt={it.name} size={22} />
              <span>{it.name}</span>
            </span>
          )}
          onSelect={openNameSearch}
          clearOnSelect
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="item-paste">
          Cole o item (Ctrl+C no jogo)
        </label>
        <textarea
          id="item-paste"
          className="item-search-textarea"
          value={itemText}
          onChange={(e) => setItemText(e.target.value)}
          rows={8}
          placeholder={'Item Class: Bows\nRarity: Rare\n...'}
        />
      </div>
      <div className="evaluator-options">
        <span className="item-search-hint">
          {mods.length > 0 ? `${matchedCount}/${mods.length} mods reconhecidos` : ''}
        </span>
        <button type="button" className="btn-primary" onClick={handleParse} disabled={parsing}>
          {parsing ? 'Analisando…' : 'Analisar item'}
        </button>
      </div>

      {error && (
        <p role="alert" className="eval-error">
          {error}
        </p>
      )}

      {parsed && (
        <div className="eval-result">
          <ItemHeader parsed={parsed} />

          {mods.length === 0 ? (
            <p className="empty-state">Nenhum modificador reconhecido neste item.</p>
          ) : (
            <ul className="mod-list">
              {mods.map((mod) => {
                const sel = selections[mod.index];
                return (
                  <li
                    key={mod.index}
                    className={`mod-row${mod.matched ? '' : ' mod-row-unmatched'}`}
                  >
                    <label className="checkbox-label mod-row-label">
                      <input
                        type="checkbox"
                        checked={sel?.enabled ?? false}
                        disabled={!mod.matched}
                        onChange={(e) => toggleMod(mod.index, e.target.checked)}
                      />
                      <AffixBadge mod={mod} />
                      <span>{mod.matched ? (mod.statText ?? mod.raw) : mod.raw}</span>
                      {mod.modName && <span className="mod-name">{mod.modName}</span>}
                    </label>
                    {mod.matched && (
                      <input
                        type="number"
                        className="mod-row-min"
                        aria-label={`Valor mínimo para ${mod.raw}`}
                        value={sel?.min ?? ''}
                        onChange={(e) => setModMin(mod.index, e.target.value)}
                        placeholder="min"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="field add-mod-field">
            <label className="field-label">Adicionar filtro de modificador</label>
            <Autocomplete<StatSuggestion>
              placeholder="Ex: maximum Life, Cold Resistance…"
              fetchSuggestions={fetchStats}
              getKey={(s) => s.id}
              renderItem={(s) => (
                <span>
                  <span className="stat-group">{s.group}</span> {s.text}
                </span>
              )}
              onSelect={addExtraMod}
              clearOnSelect
            />
          </div>

          {extraMods.length > 0 && (
            <ul className="mod-list">
              {extraMods.map((m) => (
                <li key={m.id} className="mod-row">
                  <span className="mod-row-label">
                    <span className="stat-group">{m.group}</span> {m.text}
                  </span>
                  <input
                    type="number"
                    className="mod-row-min"
                    aria-label={`Valor mínimo para ${m.text}`}
                    value={m.min ?? ''}
                    onChange={(e) => setExtraMin(m.id, e.target.value)}
                    placeholder="min"
                  />
                  <button
                    type="button"
                    className="mod-remove"
                    aria-label={`Remover ${m.text}`}
                    onClick={() => removeExtraMod(m.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="evaluator-options">
            {total != null && (
              <span className="item-search-hint">
                {total} {total === 1 ? 'resultado' : 'resultados'}
                {searchUrl && (
                  <>
                    {' · '}
                    <a href={searchUrl} target="_blank" rel="noopener noreferrer">
                      abrir busca
                    </a>
                  </>
                )}
              </span>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={handleSearch}
              disabled={searching}
            >
              {searching ? 'Buscando…' : 'Abrir busca no trade'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
