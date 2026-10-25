'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Passage } from '@/lib/models';
import { DiscoverBody } from '@/components/DiscoverBody';
import { useFoundAnalysis } from '@/components/useFoundAnalysis';
import { useLibrary } from '@/components/useLibrary';

function DiscoverMessage({ role, children }: { role: 'status' | 'alert'; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F3EBDD] text-[#24231F] flex items-center justify-center px-6">
      <p role={role} className="text-sm text-[#57544E] text-center max-w-sm">
        {children}
      </p>
    </div>
  );
}

export default function DiscoverPage() {
  const library = useLibrary();

  if (library.status === 'loading') return <DiscoverMessage role="status">Opening the library…</DiscoverMessage>;
  if (library.status === 'error') return <DiscoverMessage role="alert">{library.message}</DiscoverMessage>;
  if (library.passages.length === 0) {
    return <DiscoverMessage role="alert">The library has no passages yet.</DiscoverMessage>;
  }
  return <Discover passages={library.passages} />;
}

function Discover({ passages }: { passages: Passage[] }) {
  const [selectedPassageId, setSelectedPassageId] = useState<string>(passages[0].id);
  const passage = passages.find(p => p.id === selectedPassageId) ?? passages[0];
  const state = useFoundAnalysis(passage);

  return (
    <div className="min-h-screen bg-[#F3EBDD] text-[#24231F] flex flex-col py-8 px-4 sm:px-8">
      <header className="max-w-4xl mx-auto w-full mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4D8C2] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-[#6C3438] font-bold">Discover</span>
            <span className="text-xs text-[#57544E]" aria-hidden="true">|</span>
            <Link href="/" className="text-xs text-[#57544E] hover:text-[#24231F] underline transition-colors">
              Home
            </Link>
            <Link href="/studio" className="text-xs text-[#57544E] hover:text-[#24231F] underline transition-colors">
              Studio
            </Link>
          </div>
          <h1 className="text-3xl font-serif font-bold tracking-tight mt-1">Poems hiding in the text</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {passages.map(p => {
            const isSelected = p.id === passage.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedPassageId(p.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438] ${
                  isSelected
                    ? 'bg-[#24231F] text-[#F3EBDD] shadow-sm'
                    : 'bg-[#E4D8C2]/60 hover:bg-[#E4D8C2] text-[#24231F]'
                }`}
              >
                {p.attribution.title}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full flex-1">
        <p className="mb-5 max-w-2xl font-literary text-[17px] leading-relaxed">
          Read straight through, with nothing skipped, some stretches of these books fall into three
          lines of 5, 7 and 5 syllables. Here are the ones in <i>{passage.attribution.title}</i>.
        </p>

        <DiscoverBody
          key={passage.id}
          passage={passage}
          state={state}
          otherPassages={passages.filter(p => p.id !== passage.id)}
          onChoosePassage={setSelectedPassageId}
        />
      </main>

      <footer className="max-w-4xl mx-auto w-full mt-10 text-center text-xs text-[#605C53] border-t border-[#E4D8C2] pt-4">
        Palimpsest © 2026 — Found Poetry & Erasure Workshop
      </footer>
    </div>
  );
}
