'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { tokenize } from '@/lib/tokenizer';
import { useEditor, reopenPoem } from '@/lib/editor';
import { StyleSelector } from '@/components/StyleSelector';
import { BookText } from '@/components/BookText';
import { ViewToggle, type StudioView } from '@/components/ViewToggle';
import { ExtractedPoem } from '@/components/ExtractedPoem';
import { SaveDraftModal } from '@/components/SaveDraftModal';
import { DraftsDrawer } from '@/components/DraftsDrawer';
import { poemService } from '@/lib/services';
import type { Poem } from '@/lib/models';

import janeEyreData from '@/data/texts/jane-eyre-ch1.json';
import waldenData from '@/data/texts/walden-woods.json';
import dorianGrayData from '@/data/texts/dorian-gray-ch1.json';

interface PassageOption {
  id: string;
  title: string;
  author: string;
  year: number;
  data: typeof janeEyreData;
  pageDNA: number;
}

const PASSAGES: PassageOption[] = [
  {
    id: janeEyreData.id,
    title: 'Jane Eyre — Chapter 1',
    author: janeEyreData.attribution.author,
    year: janeEyreData.attribution.year,
    data: janeEyreData,
    pageDNA: 18.99,
  },
  {
    id: waldenData.id,
    title: 'Walden — Where I Lived',
    author: waldenData.attribution.author,
    year: waldenData.attribution.year,
    data: waldenData,
    pageDNA: 40.85,
  },
  {
    id: dorianGrayData.id,
    title: 'Dorian Gray — Chapter 1',
    author: dorianGrayData.attribution.author,
    year: dorianGrayData.attribution.year,
    data: dorianGrayData,
    pageDNA: 15.66,
  },
];

export default function PrototypePage() {
  const [selectedPassageId, setSelectedPassageId] = useState<string>(PASSAGES[0].id);
  const [currentPoemId, setCurrentPoemId] = useState<string | undefined>(undefined);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [view, setView] = useState<StudioView>('page');
  const [statusNotice, setStatusNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(
    null
  );

  const showNotice = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    setStatusNotice({ text, tone });
    setTimeout(() => setStatusNotice(null), tone === 'error' ? 7000 : 3500);
  }, []);

  const activePassage = useMemo(
    () => PASSAGES.find(p => p.id === selectedPassageId) ?? PASSAGES[0],
    [selectedPassageId]
  );

  // Tokenize source passage text
  const tokens = useMemo(() => {
    return tokenize(activePassage.data.id, activePassage.data.sourceText);
  }, [activePassage]);

  // Hook into our dedicated Editor State & History engine
  const {
    snapshot,
    title: poemTitle,
    notes: poemNotes,
    retainedSet,
    lineBreakSet,
    retainedCount,
    erasedCount,
    erasureStyle,
    canUndo,
    canRedo,
    undo,
    redo,
    toggleToken,
    eraseAll,
    reset,
    toggleLineBreak,
    setErasureStyle,
    setTitle,
    setNotes,
    loadSnapshot,
  } = useEditor({
    passageId: activePassage.id,
    tokens,
  });

  // Handle saving to repository
  const handleSaveDraft = async (title: string, notes: string) => {
    const saved = await poemService.savePoem({
      id: currentPoemId,
      passageId: activePassage.id,
      title,
      notes,
      retainedTokenIds: snapshot.retainedTokenIds,
      lineBreaks: snapshot.lineBreaks,
      erasureStyle: snapshot.erasureStyle,
    });

    setCurrentPoemId(saved.id);
    setTitle(saved.title || '');
    setNotes(saved.notes || '');
    showNotice(`Draft "${saved.title}" saved.`);
  };

  // Handle loading a poem from My Collection
  const handleLoadPoem = useCallback((poem: Poem) => {
    const passage = PASSAGES.find(p => p.id === poem.passageId);
    const result = reopenPoem(
      poem,
      passage ? tokenize(passage.data.id, passage.data.sourceText) : null
    );

    // A draft that no longer fits its passage is refused; the page and the
    // stored draft are left exactly as they were.
    if (!result.ok || !passage) {
      showNotice(result.ok ? 'Draft could not be opened.' : result.message, 'error');
      return;
    }

    setSelectedPassageId(passage.id);
    setCurrentPoemId(poem.id);
    loadSnapshot(result.snapshot, passage.id);

    showNotice(`Loaded draft "${poem.title || 'Untitled'}"`);
  }, [loadSnapshot, showNotice]);

  // Group tokens by paragraph for faithful book-page rendering
  const paragraphs = useMemo(() => {
    const groups: (typeof tokens)[] = [];
    for (const t of tokens) {
      if (!groups[t.paragraphIndex]) {
        groups[t.paragraphIndex] = [];
      }
      groups[t.paragraphIndex].push(t);
    }
    return groups;
  }, [tokens]);

  // Extracted poem tokens in source order
  const retainedTokens = useMemo(() => {
    return tokens.filter(t => t.isSelectable && retainedSet.has(t.id));
  }, [tokens, retainedSet]);

  return (
    <div className="min-h-screen bg-[#F3EBDD] text-[#24231F] flex flex-col justify-between py-8 px-4 sm:px-8">
      {/* Top Header */}
      <header className="max-w-4xl mx-auto w-full mb-8 flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#E4D8C2] pb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-[#6C3438] font-bold">
              Phase 2 Studio
            </span>
            <span className="text-xs text-[#57544E]">|</span>
            <Link
              href="/"
              className="text-xs text-[#57544E] hover:text-[#24231F] underline transition-colors"
            >
              Home
            </Link>
          </div>
          <h1 className="text-3xl font-serif font-bold tracking-tight text-[#24231F] mt-1">
            Palimpsest Studio
          </h1>
          <p className="text-sm text-[#57544E] mt-0.5">
            {poemTitle ? `Editing: "${poemTitle}"` : 'Interactive Found Poetry & Erasure Workshop'}
          </p>
        </div>

        {/* Right Header Navigation & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="px-3.5 py-1.5 bg-[#FAF6EE] hover:bg-[#E4D8C2] border border-[#E0D4BE] rounded text-xs font-medium text-[#24231F] transition-colors shadow-sm flex items-center justify-center gap-1.5"
          >
            <span aria-hidden="true">📖</span> My Collection
          </button>

          {/* Passage Selector Tabs */}
          <div className="flex flex-wrap gap-2">
            {PASSAGES.map(p => {
              const isSelected = p.id === activePassage.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedPassageId(p.id);
                    setCurrentPoemId(undefined);
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-[#24231F] text-[#F3EBDD] shadow-sm'
                      : 'bg-[#E4D8C2]/60 hover:bg-[#E4D8C2] text-[#24231F]'
                  }`}
                >
                  {p.title.split('—')[0].trim()}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Floating Status Notification Toast */}
      {statusNotice && (
        <div
          role={statusNotice.tone === 'error' ? 'alert' : 'status'}
          className={`max-w-4xl mx-auto w-full mb-4 px-4 py-2 ${
            statusNotice.tone === 'error' ? 'bg-[#6C3438]' : 'bg-[#5B5D45]'
          } text-[#FAF6EE] text-xs font-medium rounded shadow animate-in fade-in flex items-center justify-between`}
        >
          <span>{statusNotice.text}</span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            aria-label="Dismiss message"
            className="opacity-80 hover:opacity-100"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="max-w-4xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: the page or the extracted poem, one at a time */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <ViewToggle view={view} onChange={setView} />

          {view === 'poem' ? (
            <ExtractedPoem
              tokens={retainedTokens}
              lineBreakSet={lineBreakSet}
              onToggleLineBreak={toggleLineBreak}
              title={poemTitle}
              attribution={activePassage.data.attribution}
            />
          ) : (
            <div className="bg-[#FAF6EE] border border-[#E0D4BE] rounded-lg shadow-md p-8 sm:p-12 relative min-h-[500px]">
              {/* Page Header */}
              <div className="text-center mb-8 border-b border-[#ECE3D0] pb-4">
                <span className="text-[11px] uppercase tracking-widest text-[#57544E]">
                  {activePassage.data.attribution.author} ({activePassage.data.attribution.year})
                </span>
                <h2 className="text-lg font-serif font-semibold text-[#24231F] mt-1">
                  {activePassage.data.title}
                </h2>
              </div>

              {/* Book Page Body */}
              <BookText
                paragraphs={paragraphs}
                retainedSet={retainedSet}
                style={erasureStyle}
                onToggle={toggleToken}
              />

              {/* Page Footer */}
              <div className="text-center mt-10 pt-4 border-t border-[#ECE3D0] text-[11px] text-[#605C53]">
                Public domain source via{' '}
                <a
                  href={activePassage.data.attribution.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-[#24231F]"
                >
                  Project Gutenberg
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Controls */}
        <aside aria-label="Studio controls" className="flex flex-col gap-6">
          {/* Announces the effect of keeping or erasing words to screen readers. */}
          <p role="status" className="sr-only">
            {retainedCount} {retainedCount === 1 ? 'word' : 'words'} kept, {erasedCount} erased.
          </p>
          {/* History & Studio Controls Card */}
          <div className="bg-[#FAF6EE] border border-[#E0D4BE] rounded-lg p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-wider text-[#6C3438] font-bold">
                Studio Controls
              </h3>
              {/* Undo / Redo Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    canUndo
                      ? 'border-[#E0D4BE] hover:bg-[#E4D8C2] text-[#24231F]'
                      : 'border-[#E0D4BE]/40 text-[#8B867C]/40 cursor-not-allowed'
                  }`}
                >
                  ↶ Undo
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  title="Redo (Ctrl+Y)"
                  aria-label="Redo"
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    canRedo
                      ? 'border-[#E0D4BE] hover:bg-[#E4D8C2] text-[#24231F]'
                      : 'border-[#E0D4BE]/40 text-[#8B867C]/40 cursor-not-allowed'
                  }`}
                >
                  Redo ↷
                </button>
              </div>
            </div>

            {/* Style Selector */}
            <StyleSelector
              currentStyle={erasureStyle}
              onSelectStyle={setErasureStyle}
            />

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-[#E4D8C2]/40 rounded p-2">
                <div className="text-2xl font-serif font-bold text-[#24231F]">
                  {retainedCount}
                </div>
                <div className="text-[11px] text-[#57544E]">Retained Words</div>
              </div>
              <div className="bg-[#E4D8C2]/40 rounded p-2">
                <div className="text-2xl font-serif font-bold text-[#6C3438]">
                  {erasedCount}
                </div>
                <div className="text-[11px] text-[#57544E]">Erased Words</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[#57544E] bg-[#E4D8C2]/20 px-3 py-2 rounded">
              <span>Page DNA (Found Density):</span>
              <span className="font-semibold text-[#24231F]">
                {activePassage.pageDNA} / 100w
              </span>
            </div>

            {/* Save & Reset Actions */}
            <div className="space-y-2 pt-1">
              <button
                onClick={() => setIsSaveModalOpen(true)}
                className="w-full py-2 bg-[#6C3438] hover:bg-[#57292D] text-[#F3EBDD] rounded text-xs font-medium transition-colors shadow-sm flex items-center justify-center gap-1.5"
              >
                <span aria-hidden="true">💾</span> Save Draft to Collection
              </button>

              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="flex-1 py-1.5 px-3 bg-[#E4D8C2] hover:bg-[#D8CBB2] text-[#24231F] rounded text-xs font-medium transition-colors"
                >
                  Restore All
                </button>
                <button
                  onClick={eraseAll}
                  className="flex-1 py-1.5 px-3 border border-[#E0D4BE] hover:bg-[#E4D8C2]/50 text-[#57544E] rounded text-xs font-medium transition-colors"
                >
                  Erase All
                </button>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Save Draft Modal */}
      <SaveDraftModal
        isOpen={isSaveModalOpen}
        initialTitle={poemTitle}
        initialNotes={poemNotes}
        passageTitle={activePassage.data.title}
        retainedCount={retainedCount}
        onSave={handleSaveDraft}
        onClose={() => setIsSaveModalOpen(false)}
      />

      {/* My Collection Drawer */}
      <DraftsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onLoadPoem={handleLoadPoem}
      />

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full mt-10 text-center text-xs text-[#605C53] border-t border-[#E4D8C2] pt-4">
        Palimpsest © 2026 — Found Poetry & Erasure Workshop · Phase 2 Functional Studio
      </footer>
    </div>
  );
}
