'use client';

export type StudioView = 'page' | 'poem';

const VIEWS: { id: StudioView; label: string; hint: string }[] = [
  { id: 'page', label: 'In the page', hint: 'Words stay where the author put them' },
  { id: 'poem', label: 'Extracted poem', hint: 'Only the retained words, as verse' },
];

interface ViewToggleProps {
  view: StudioView;
  onChange: (view: StudioView) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Studio view"
      className="inline-flex self-start rounded border border-[#E0D4BE] bg-[#FAF6EE] p-0.5 shadow-sm"
    >
      {VIEWS.map(option => {
        const isActive = view === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            title={option.hint}
            onClick={() => onChange(option.id)}
            className={`px-3.5 py-1.5 rounded-[3px] text-xs font-medium transition-colors ${
              isActive
                ? 'bg-[#6C3438] text-[#F3EBDD]'
                : 'text-[#24231F] hover:bg-[#E4D8C2]/60'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
