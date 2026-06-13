import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props<T> {
  placeholder: string;
  fetchSuggestions: (query: string) => Promise<T[]>;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  minChars?: number;
  /** Clear the input after a selection. */
  clearOnSelect?: boolean;
  ariaLabel?: string;
}

export function Autocomplete<T>({
  placeholder,
  fetchSuggestions,
  getKey,
  renderItem,
  onSelect,
  minChars = 2,
  clearOnSelect = false,
  ariaLabel,
}: Props<T>) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < minChars) {
      setItems([]);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      fetchSuggestions(query)
        .then((res) => {
          if (active) {
            setItems(res);
            setOpen(true);
          }
        })
        .catch(() => {
          if (active) setItems([]);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, minChars, fetchSuggestions]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleSelect = (item: T) => {
    onSelect(item);
    setOpen(false);
    if (clearOnSelect) {
      setQuery('');
      setItems([]);
    }
  };

  return (
    <div className="autocomplete" ref={containerRef}>
      <input
        type="text"
        className="autocomplete-input"
        value={query}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
      />
      {open && items.length > 0 && (
        <ul className="autocomplete-list" role="listbox">
          {items.map((item) => (
            <li key={getKey(item)} role="option" aria-selected="false">
              <button
                type="button"
                className="autocomplete-option"
                onClick={() => handleSelect(item)}
              >
                {renderItem(item)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
