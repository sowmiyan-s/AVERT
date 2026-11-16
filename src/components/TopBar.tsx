import React from 'react';

export type WorkspaceTab = 'protect' | 'verify' | 'editor';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onPrimaryAction: () => void;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'protect', label: 'Protect' },
  { id: 'verify', label: 'Verify' },
  { id: 'editor', label: 'Editor Lab' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onPrimaryAction,
}) => {
  return (
    <header className="md:sticky md:top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-3.5">
        <a
          href="#protect"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('protect');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          AVERT
        </a>

        <nav
          aria-label="Primary workspace navigation"
          className="hidden md:flex items-center gap-6"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`border-b-2 py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1D4ED8] ${
                  active
                    ? 'border-[#1D4ED8] text-slate-900'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            Protect Image
          </button>
        </div>
      </div>

      {/* Mobile secondary navigation bar to prevent clipping on narrow viewports */}
      <nav
        aria-label="Mobile workspace navigation"
        className="flex md:hidden items-center justify-around border-t border-slate-100 px-3 py-2"
      >
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`border-b-2 px-2 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'border-[#1D4ED8] text-slate-900'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
