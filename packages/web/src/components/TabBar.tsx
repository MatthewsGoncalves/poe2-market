export type AppTab = 'snipes' | 'mistakes' | 'evaluator';

export interface TabItem {
  id: AppTab;
  label: string;
  badge?: number;
}

interface Props {
  tabs: TabItem[];
  active: AppTab;
  onChange: (tab: AppTab) => void;
}

export function TabBar({ tabs, active, onChange }: Props) {
  return (
    <div className="tab-bar" role="tablist" aria-label="Ferramentas de mercado">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            className={`tab-btn${isActive ? ' tab-btn-active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="tab-badge">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
