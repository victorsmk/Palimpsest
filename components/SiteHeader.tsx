import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';

export type SitePage = 'discover' | 'assist' | 'studio';

const PAGES: { page: SitePage | 'home'; href: string; label: string }[] = [
  { page: 'home', href: '/', label: 'Home' },
  { page: 'discover', href: '/discover', label: 'Discover' },
  { page: 'assist', href: '/assist', label: 'Assisted' },
  { page: 'studio', href: '/studio', label: 'Studio' },
];

const LINK =
  'rounded px-1 py-0.5 text-sm text-[#F3EBDD]/85 underline-offset-8 transition-colors hover:text-[#E8CF92] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8CF92]';

/**
 * The top of Discover, Assisted and the Studio: a dark band like the home page's reading room, with the way to the
 * other pages (the page you are on is named, not linked), the title, and the page's own actions (My Collection,
 * Account, the passage tabs) at the right. It runs the full width of the page it is in, whatever side padding that
 * page has: the pages give their content `px-4 sm:px-8`, and this takes it back with the negative margin.
 */
export function SiteHeader({
  current,
  title,
  subtitle,
  actions,
  guardLink,
}: {
  current: SitePage;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** The Studio asks before leaving unsaved work: it gives the click handler for each link. */
  guardLink?: (href: string) => MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <header className="print:hidden -mx-4 mb-8 border-b-2 border-[#C29A45]/70 bg-[radial-gradient(ellipse_at_20%_0%,#3A2B1C_0%,#1B1712_65%)] text-[#F3EBDD] shadow-[0_10px_30px_-18px_rgba(27,23,18,0.8)] sm:-mx-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-5 sm:px-8 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <nav aria-label="Pages" className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {PAGES.map(({ page, href, label }) =>
              page === current ? (
                <span
                  key={page}
                  aria-current="page"
                  className="border-b-2 border-[#C29A45] px-1 py-0.5 text-sm font-semibold text-[#E8CF92]"
                >
                  {label}
                </span>
              ) : (
                <Link key={page} href={href} onClick={guardLink?.(href)} className={LINK}>
                  {label}
                </Link>
              ),
            )}
          </nav>
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-[#E8CF92] sm:text-4xl">{title}</h1>
          {subtitle && <p className="font-literary mt-1 text-sm italic text-[#F3EBDD]/75">{subtitle}</p>}
        </div>
      </div>
    </header>
  );
}

/** The bundled passages as a row of toggle buttons, for the version with no library of books. */
export function PassageTabs({
  passages,
  activeId,
  onChoose,
  label,
}: {
  passages: { id: string; title: string }[];
  activeId: string;
  onChoose: (id: string) => void;
  label?: string;
}) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} className="flex flex-wrap gap-2">
      {passages.map(p => {
        const isSelected = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChoose(p.id)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8CF92] ${
              isSelected ? 'bg-[#C29A45] text-[#1B1712] shadow-sm' : 'bg-[#F3EBDD]/10 text-[#F3EBDD] hover:bg-[#F3EBDD]/20'
            }`}
          >
            {p.title}
          </button>
        );
      })}
    </div>
  );
}
