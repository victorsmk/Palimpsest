'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PoemGoneError, passageVersionOf } from '@/lib/models';
import { describeError } from '@/lib/errors/describe';
import { useEditor, reopenPoem, createDefaultSnapshot, snapshotsEqual, type EditorSnapshot } from '@/lib/editor';
import { StyleSelector } from '@/components/StyleSelector';
import { BookText } from '@/components/BookText';
import { ViewToggle, type StudioView } from '@/components/ViewToggle';
import { ExtractedPoem } from '@/components/ExtractedPoem';
import { SaveDraftModal } from '@/components/SaveDraftModal';
import { AccountControl } from '@/components/AccountControl';
import { PassageTabs, SiteHeader } from '@/components/SiteHeader';
import { MyCollectionButton } from '@/components/MyCollectionButton';
import { SignInDialog } from '@/components/SignInDialog';
import { useAuth } from '@/components/useAuth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePageDna } from '@/components/usePageDna';
import { PageDnaStrip } from '@/components/PageDnaStrip';
import { useLibrary } from '@/components/useLibrary';
import { bookService, poemService } from '@/lib/services';
import { PassageSwitcher } from '@/components/PassageSwitcher';
import { ChooseBookScreen } from '@/components/ChooseBookScreen';
import { exportElementAsPng, exportFilename } from '@/lib/export/png';
import { downloadTextFile, poemLines, poemToText } from '@/lib/export/text';
import { PrintablePoem } from '@/components/PrintablePoem';
import {
  SAVED_MISSING_MESSAGE,
  discoverHref,
  handoffPassageId,
  passageIdFromHash,
  readHandoff,
  readOpenRequest,
  sharedPoemFromEditor,
  sharedPoemHref,
  type ReadHandoff,
} from '@/lib/handoff';
import { openSavedPoem, type OpenedSavedPoem } from '@/lib/poems/openSaved';
import type { Poem } from '@/lib/models';
import { PASSAGE_UNAVAILABLE_MESSAGE, type PassageLibrary } from '@/lib/library/passageLibrary';

type Notice = { text: string; tone: 'ok' | 'error' };

const openedMessage = (bookTitle: string, mode: 'found' | 'assisted' | 'shared') =>
  mode === 'shared'
    ? `Opened a poem shared with you, from ${bookTitle}. Edit it, then save it to your collection.`
    : `Opened a poem ${mode === 'found' ? 'found in' : 'made from'} ${bookTitle}. Edit it, then save it to your collection.`;

function noticeForHandoff(handoff: ReadHandoff): Notice | null {
  if (handoff.kind === 'open') {
    return { text: openedMessage(handoff.passage.attribution.title, handoff.mode), tone: 'ok' };
  }
  if (handoff.kind === 'invalid') return { text: handoff.message, tone: 'error' };
  return null;
}

function noticeForOpened(opened: OpenedSavedPoem | null): Notice | null {
  if (!opened) return null;
  if (!opened.ok) return { text: opened.message, tone: 'error' };
  return { text: `Loaded draft "${opened.poem.title || 'Untitled'}"`, tone: 'ok' };
}

/** Drops the hash from the address bar (keeping Next's history state) so a reload does not reapply it. */
function clearHash() {
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
}

function StudioMessage({ role, children }: { role: 'status' | 'alert'; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F3EBDD] text-[#24231F] flex items-center justify-center px-6">
      <p role={role} className="text-sm text-[#57544E] text-center max-w-sm">
        {children}
      </p>
    </div>
  );
}

function ExportButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2 border border-[#24231F] hover:bg-[#E4D8C2]/50 text-[#24231F] rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export default function StudioPage() {
  const library = useLibrary();

  if (library.status === 'loading') return <StudioMessage role="status">Opening the library…</StudioMessage>;
  if (library.status === 'error') return <StudioMessage role="alert">{library.message}</StudioMessage>;
  if (!bookService.hasRemoteLibrary && library.library.summaries.length === 0) {
    return <StudioMessage role="alert">The library has no passages yet.</StudioMessage>;
  }
  return <StudioEntry library={library.library} />;
}

/**
 * Opens the Studio, first fetching the saved poem a link such as `#open=<id>` names (from My
 * Collection on another page), so that the poem is on screen from the first render instead of the
 * default page showing first.
 */
function StudioEntry({ library }: { library: PassageLibrary }) {
  const remote = bookService.hasRemoteLibrary;
  // Only rendered in the browser, after the library has been listed, so the hash can be read here.
  const [request] = useState(() => readOpenRequest(window.location.hash));
  // With a library of books, the excerpt the writer picked on the start screen (or a link named, as #passage=<id>).
  const [picked, setPicked] = useState<string | null>(null);
  const [pickMessage, setPickMessage] = useState<string | null>(null);
  const [start, setStart] = useState<{ status: 'loading' } | { status: 'ready'; opened: OpenedSavedPoem | null } | { status: 'error' }>({
    status: 'loading',
  });

  // Loads what the Studio starts with: the saved poem a link names (and its passage), the passage a
  // hand-off in the hash names, and the first passage, which it falls back to. Nothing else is loaded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const opened = request.kind === 'poem' ? await openSavedPoem(request.id, library, poemService) : null;
      const handoffId = handoffPassageId(window.location.hash);
      const hashId = bookService.hasRemoteLibrary ? passageIdFromHash(window.location.hash) : null;
      await library.ensure([...(bookService.hasRemoteLibrary ? [] : [library.summaries[0].id]), ...(handoffId ? [handoffId] : []), ...(hashId ? [hashId] : [])]);
      return opened;
    })().then(
      opened => {
        if (!cancelled) setStart({ status: 'ready', opened });
      },
      () => {
        if (!cancelled) setStart({ status: 'error' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [request, library]);

  if (start.status === 'error') return <StudioMessage role="alert">{PASSAGE_UNAVAILABLE_MESSAGE}</StudioMessage>;
  if (start.status === 'loading') {
    return <StudioMessage role="status">{request.kind === 'poem' ? 'Opening your poem…' : 'Opening the passage…'}</StudioMessage>;
  }
  const result: OpenedSavedPoem | null = request.kind === 'invalid' ? { ok: false, message: request.message } : start.opened;
  if (!remote) return <Studio library={library} opened={result} />;

  const handoff = readHandoff(window.location.hash, library.passages());
  const hashId = passageIdFromHash(window.location.hash);
  const startId = picked ?? (hashId && library.get(hashId) ? hashId : null);
  if (result?.ok || handoff.kind === 'open' || startId) {
    return <Studio library={library} opened={result} startPassageId={startId ?? undefined} />;
  }
  const message = pickMessage ?? (result && !result.ok ? result.message : handoff.kind === 'invalid' ? handoff.message : hashId ? 'That excerpt is not in the library.' : null);
  return (
    <ChooseBookScreen
      page="Studio"
      library={library}
      message={message}
      onChoose={id => {
        setPickMessage(null);
        library.ensure([id]).then(
          () => (library.get(id) ? setPicked(id) : setPickMessage(PASSAGE_UNAVAILABLE_MESSAGE)),
          () => setPickMessage(PASSAGE_UNAVAILABLE_MESSAGE)
        );
      }}
    />
  );
}

function Studio({ library, opened, startPassageId }: { library: PassageLibrary; opened: OpenedSavedPoem | null; startPassageId?: string }) {
  const summaries = library.summaries;
  const remote = bookService.hasRemoteLibrary;
  // A poem sent from Discover arrives in the URL hash. Studio only renders in the browser, after
  // the library has loaded, so the hash can be read while choosing the initial state: the poem is
  // open on the first render instead of the default page flashing first.
  const [handoff] = useState<ReadHandoff>(() => readHandoff(window.location.hash, library.passages()));
  const [selectedPassageId, setSelectedPassageId] = useState<string>(() =>
    handoff.kind === 'open' ? handoff.passage.id : opened?.ok ? opened.passage.id : (startPassageId ?? summaries[0].id)
  );
  const [currentPoemId, setCurrentPoemId] = useState<string | undefined>(() => (opened?.ok ? opened.poem.id : undefined));
  // The revision of the open poem as this tab last saw it. A save says so, and is refused if the poem
  // has been changed somewhere else since.
  const [currentRevision, setCurrentRevision] = useState<number | undefined>(() => (opened?.ok ? opened.poem.revision : undefined));
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  // Saving needs an account when the poems are kept on the server: ask to sign in first, with the poem left as it is.
  const auth = useAuth();
  const [signInToSave, setSignInToSave] = useState(false);
  const [view, setView] = useState<StudioView>('page');
  const [isExporting, setIsExporting] = useState(false);
  const router = useRouter();
  // A link to the poem that the browser would not copy for us, to be copied by hand. It belongs to the
  // poem as it was when it was made, so it is shown only while the poem is unchanged.
  const [shareLink, setShareLink] = useState<{ url: string; snapshot: EditorSnapshot } | null>(null);
  const shareField = useRef<HTMLInputElement>(null);
  // The poem as last saved or opened, for the passage it belongs to. Unsaved changes are whatever
  // differs from it (or, before anything is saved or opened, from the untouched passage).
  const [baseline, setBaseline] = useState<{ passageId: string; snapshot: EditorSnapshot } | null>(() =>
    handoff.kind === 'open'
      ? { passageId: handoff.passage.id, snapshot: handoff.snapshot }
      : opened?.ok
        ? { passageId: opened.passage.id, snapshot: opened.snapshot }
        : null
  );
  // Something that would replace the poem on screen, held until the writer says it is all right.
  const [pendingReplace, setPendingReplace] = useState<{ message: string; run: () => void } | null>(null);
  const exportFrameRef = useRef<HTMLDivElement>(null);
  const [statusNotice, setStatusNotice] = useState<Notice | null>(() => noticeForHandoff(handoff) ?? noticeForOpened(opened));

  // One dismiss timer at a time: an older notice's timer must not remove a newer notice early.
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showNotice = useCallback((text: string, tone: 'ok' | 'error' = 'ok', duration?: number) => {
    clearTimeout(noticeTimer.current);
    setStatusNotice({ text, tone });
    noticeTimer.current = setTimeout(() => setStatusNotice(null), duration ?? (tone === 'error' ? 7000 : 3500));
  }, []);

  const activePassage = useMemo(
    () => library.get(selectedPassageId) ?? library.get(summaries[0].id)!,
    [library, summaries, selectedPassageId]
  );
  const pageDna = usePageDna(activePassage);

  const tokens = activePassage.tokens;

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
    initialSnapshot: handoff.kind === 'open' ? handoff.snapshot : opened?.ok ? opened.snapshot : undefined,
  });

  const untouched = useMemo(() => createDefaultSnapshot(tokens), [tokens]);
  const isDirty = !snapshotsEqual(snapshot, baseline?.passageId === activePassage.id ? baseline.snapshot : untouched);

  // Runs `run` now, or after the writer agrees, if it would throw away changes that are not saved.
  const askBeforeReplacing = useCallback(
    (message: string, run: () => void) => {
      if (!isDirty) {
        run();
        return;
      }
      setPendingReplace({ message, run });
    },
    [isDirty]
  );

  // Goes to another passage: loads it first, and asks first if the poem on screen has changes that are not saved.
  const changePassage = async (id: string) => {
    if (id === activePassage.id) return;
    try {
      await library.ensure([id]);
    } catch {
      showNotice(PASSAGE_UNAVAILABLE_MESSAGE, 'error');
      return;
    }
    const target = library.get(id);
    if (!target) {
      showNotice(PASSAGE_UNAVAILABLE_MESSAGE, 'error');
      return;
    }
    askBeforeReplacing(`Switching to ${target.attribution.title} will replace the poem you are editing, which has changes you haven't saved.`, () => {
      setSelectedPassageId(id);
      setCurrentPoemId(undefined);
      setCurrentRevision(undefined);
    });
  };

  // Closing or reloading the tab with unsaved changes gets the browser's own warning.
  useEffect(() => {
    if (!isDirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  // A link out of the Studio loses unsaved changes too, and the browser's warning does not see it.
  const guardLink = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    const opensElsewhere = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (!isDirty || event.defaultPrevented || opensElsewhere) return;
    event.preventDefault();
    askBeforeReplacing(
      "Leaving the Studio will lose the changes you haven't saved to the poem you are editing.",
      () => router.push(href)
    );
  };

  // Once a hand-off has been read, take it out of the address bar and let its notice go in time.
  useEffect(() => {
    if (handoff.kind === 'none' && !opened) return;
    clearHash();
    const timer = setTimeout(() => setStatusNotice(null), handoff.kind === 'open' ? 8000 : opened?.ok ? 3500 : 7000);
    return () => clearTimeout(timer);
  }, [handoff, opened]);

  // Handle saving to repository
  const handleSaveDraft = async (title: string, notes: string) => {
    let saved: Poem;
    try {
      saved = await poemService.savePoem({
        id: currentPoemId,
        expectedRevision: currentRevision,
        passageId: activePassage.id,
        title,
        notes,
        retainedTokenIds: snapshot.retainedTokenIds,
        lineBreaks: snapshot.lineBreaks,
        erasureStyle: snapshot.erasureStyle,
        passageVersion: passageVersionOf(activePassage),
      });
    } catch (err) {
      // The poem is gone from the collection: the words stay on the page, and saving again makes a
      // new poem instead of asking for the old one. (The save form shows the error's message.)
      if (err instanceof PoemGoneError) {
        setCurrentPoemId(undefined);
        setCurrentRevision(undefined);
      }
      throw err;
    }

    setCurrentPoemId(saved.id);
    setCurrentRevision(saved.revision);
    setTitle(saved.title || '');
    setNotes(saved.notes || '');
    // What was just saved is now the poem to compare against.
    setBaseline({
      passageId: activePassage.id,
      snapshot: {
        retainedTokenIds: snapshot.retainedTokenIds,
        lineBreaks: snapshot.lineBreaks,
        erasureStyle: snapshot.erasureStyle,
        title: saved.title || '',
        notes: saved.notes || '',
      },
    });
    showNotice(`Draft "${saved.title}" saved.`);
  };

  // Handle loading a poem from My Collection
  const handleLoadPoem = useCallback(async (poem: Poem) => {
    try {
      await library.ensure([poem.passageId]);
    } catch {
      showNotice(PASSAGE_UNAVAILABLE_MESSAGE, 'error');
      return;
    }
    const passage = library.get(poem.passageId);
    const result = reopenPoem(poem, passage ?? null);

    // A draft that no longer fits its passage is refused; the page and the
    // stored draft are left exactly as they were.
    if (!result.ok || !passage) {
      showNotice(result.ok ? 'Draft could not be opened.' : result.message, 'error');
      return;
    }

    const opened = result.snapshot;
    askBeforeReplacing(
      `Opening “${poem.title || 'Untitled Poem'}” will replace the poem you are editing, which has changes you haven't saved.`,
      () => {
        setSelectedPassageId(passage.id);
        setCurrentPoemId(poem.id);
        setCurrentRevision(poem.revision);
        loadSnapshot(opened, passage.id);
        setBaseline({ passageId: passage.id, snapshot: opened });
        showNotice(`Loaded draft "${poem.title || 'Untitled'}"`);
      }
    );
  }, [library, loadSnapshot, showNotice, askBeforeReplacing]);

  // A link that changes only the hash while the Studio is already open does not reload the page.
  useEffect(() => {
    function onHashChange() {
      const request = readOpenRequest(window.location.hash);
      if (request.kind !== 'none') {
        clearHash();
        if (request.kind === 'invalid') {
          showNotice(request.message, 'error');
          return;
        }
        // One of the writer's own saved poems: fetch it, then open it as if chosen from My Collection.
        void poemService
          .getPoem(request.id)
          .then(poem => (poem ? handleLoadPoem(poem) : showNotice(SAVED_MISSING_MESSAGE, 'error')))
          .catch(err => showNotice(describeError(err, 'open'), 'error'));
        return;
      }
      // The hand-off names its passage; that one is loaded, then the hand-off is checked against it.
      const hash = window.location.hash;
      const named = handoffPassageId(hash);
      void (named ? library.ensure([named]) : Promise.resolve([])).then(
        () => {
          const next = readHandoff(hash, library.passages());
          if (next.kind === 'none') return;
          clearHash();
          if (next.kind === 'invalid') {
            showNotice(next.message, 'error');
            return;
          }
          askBeforeReplacing(
            "Opening this poem will replace the one you are editing, which has changes you haven't saved.",
            () => {
              setSelectedPassageId(next.passage.id);
              setCurrentPoemId(undefined);
              setCurrentRevision(undefined);
              loadSnapshot(next.snapshot, next.passage.id);
              setBaseline({ passageId: next.passage.id, snapshot: next.snapshot });
              showNotice(openedMessage(next.passage.attribution.title, next.mode), 'ok', 8000);
            }
          );
        },
        () => {
          clearHash();
          showNotice(PASSAGE_UNAVAILABLE_MESSAGE, 'error');
        }
      );
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [library, loadSnapshot, showNotice, askBeforeReplacing, handleLoadPoem]);

  // A poem renamed in My Collection: if it is the one open here, take its new title, and count that
  // as part of what is saved so that the rename alone is not an unsaved change.
  const handleRenamedElsewhere = useCallback(
    (renamed: Poem) => {
      if (renamed.id !== currentPoemId) return;
      // The rename was a save of this poem. If it followed straight on from the revision shown here,
      // that is the new revision; if the poem had been changed elsewhere in between, keep the old
      // one, so that the next save here is refused instead of hiding that change.
      setCurrentRevision(revision => (revision !== undefined && renamed.revision === revision + 1 ? renamed.revision : revision));
      const title = renamed.title || '';
      setTitle(title);
      setBaseline(current => (current ? { ...current, snapshot: { ...current.snapshot, title } } : current));
    },
    [currentPoemId, setTitle]
  );

  // Exports whichever view is showing: the erased page or the extracted poem.
  const handleExport = async () => {
    const frame = exportFrameRef.current;
    if (!frame) return;
    setIsExporting(true);
    try {
      await exportElementAsPng(frame, exportFilename(poemTitle || activePassage.title, view));
      showNotice(view === 'poem' ? 'Poem exported as PNG.' : 'Page exported as PNG.');
    } catch {
      showNotice('The image could not be created. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

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

  // The finished poem, as the text and print exports carry it.
  const poemDocument = {
    title: poemTitle,
    lines: poemLines(retainedTokens, lineBreakSet),
    attribution: activePassage.attribution,
  };

  const handleDownloadText = () => {
    downloadTextFile(exportFilename(poemTitle || activePassage.title, 'poem', 'txt'), poemToText(poemDocument), 'text/plain');
    showNotice('Poem downloaded as text.');
  };

  // The browser's print dialog offers "Save as PDF"; only the poem is on the page when printing.
  const handlePrint = () => window.print();

  // A link that opens this poem in the Studio: its words, breaks, style and title, never its notes.
  const handleShareLink = async () => {
    const shared = sharedPoemFromEditor(activePassage, snapshot);
    if (!shared.ok) {
      showNotice(shared.message, 'error');
      return;
    }
    const url = `${window.location.origin}${sharedPoemHref(shared.poem)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareLink(null);
      showNotice('Link copied. Anyone with it can open this poem in the Studio.');
    } catch {
      // No clipboard here, or the browser said no: show the link so that it can be copied by hand.
      setShareLink({ url, snapshot });
    }
  };

  const visibleShareLink = shareLink && shareLink.snapshot === snapshot ? shareLink.url : null;
  useEffect(() => {
    if (!visibleShareLink) return;
    shareField.current?.focus();
    shareField.current?.select();
  }, [visibleShareLink]);

  return (
    <div className="min-h-screen text-[#24231F] flex flex-col justify-between pb-8 px-4 sm:px-8">
      {/* Top Header */}
      <SiteHeader
        current="studio"
        title="Palimpsest Studio"
        subtitle={poemTitle ? `Editing: "${poemTitle}"` : 'Interactive Found Poetry & Erasure Workshop'}
        guardLink={guardLink}
        actions={
          <>
            <MyCollectionButton library={library} onOpenPoem={handleLoadPoem} onRenamed={handleRenamedElsewhere} />
            <AccountControl />
            {/* Passage Selector: tabs for the bundled passages, or the book picker when there is a library of books */}
            {!remote && (
              <PassageTabs
                passages={summaries.map(p => ({ id: p.id, title: p.attribution.title }))}
                activeId={activePassage.id}
                onChoose={id => void changePassage(id)}
              />
            )}
          </>
        }
      />

      {remote && (
        <div className="print:hidden max-w-4xl mx-auto w-full mb-6 -mt-2">
          <PassageSwitcher passage={activePassage} onChoose={id => void changePassage(id)} />
        </div>
      )}

      {/* Floating Status Notification Toast */}
      {statusNotice && (
        <div
          role={statusNotice.tone === 'error' ? 'alert' : 'status'}
          className={`print:hidden max-w-4xl mx-auto w-full mb-4 px-4 py-2 ${
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
      <PrintablePoem {...poemDocument} />

      <main id="main" tabIndex={-1} className="print:hidden max-w-4xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 outline-none">
        {/* Left 2 Cols: the page or the extracted poem, one at a time */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <ViewToggle view={view} onChange={setView} />

          {view === 'poem' ? (
            <ExtractedPoem
              tokens={retainedTokens}
              lineBreakSet={lineBreakSet}
              onToggleLineBreak={toggleLineBreak}
              title={poemTitle}
              attribution={activePassage.attribution}
              frameRef={exportFrameRef}
            />
          ) : (
            <div
              ref={exportFrameRef}
              className="page-frame p-8 sm:p-12 relative min-h-[500px]"
            >
              {/* Page Header */}
              <div className="text-center mb-8 border-b border-[#ECE3D0] pb-4">
                <span className="text-[11px] uppercase tracking-widest text-[#57544E]">
                  {activePassage.attribution.author} ({activePassage.attribution.year})
                </span>
                <h2 className="text-lg font-serif font-semibold text-[#24231F] mt-1">
                  {activePassage.title}
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
                  href={activePassage.attribution.url}
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
          <div className="card-gilt bg-[#FAF6EE] border border-[#E0D4BE] rounded-lg p-5 shadow-sm space-y-4">
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

            <PageDnaStrip
              state={pageDna}
              discoverHref={discoverHref(activePassage.id)}
              onDiscoverClick={guardLink(discoverHref(activePassage.id))}
            />

            {/* Save & Reset Actions */}
            <div className="space-y-2 pt-1">
              <button
                onClick={() => (auth.enabled && auth.state.status === 'signed-out' ? setSignInToSave(true) : setIsSaveModalOpen(true))}
                className="w-full py-2 bg-[#6C3438] hover:bg-[#57292D] text-[#F3EBDD] rounded text-xs font-medium transition-colors shadow-sm flex items-center justify-center gap-1.5"
              >
                <span aria-hidden="true">💾</span> Save Draft to Collection
              </button>

              <div role="group" aria-label="Export your poem" className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-[#57544E] font-semibold" aria-hidden="true">
                  Export poem
                </div>
                <ExportButton onClick={handleDownloadText} disabled={retainedCount === 0}>
                  Download as text (.txt)
                </ExportButton>
                <ExportButton onClick={handlePrint} disabled={retainedCount === 0}>
                  Print / Save as PDF
                </ExportButton>
                <ExportButton onClick={() => void handleShareLink()} disabled={retainedCount === 0}>
                  Copy link to this poem
                </ExportButton>
                {visibleShareLink && (
                  <div className="space-y-1.5 rounded border border-[#E0D4BE] bg-[#F3EBDD] p-3">
                    <label htmlFor="share-link" className="block text-xs text-[#57544E]">
                      Your browser would not copy the link for you. Copy it from here: select it and press Ctrl+C
                      (Cmd+C on a Mac).
                    </label>
                    <input
                      id="share-link"
                      ref={shareField}
                      readOnly
                      value={visibleShareLink}
                      onFocus={event => event.currentTarget.select()}
                      className="w-full rounded border border-[#E0D4BE] bg-[#FAF6EE] px-2 py-1.5 font-mono text-[11px] text-[#24231F] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6C3438]"
                    />
                    <button
                      type="button"
                      onClick={() => setShareLink(null)}
                      className="rounded px-2 py-1 text-xs text-[#57544E] underline hover:text-[#24231F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
                    >
                      Done
                    </button>
                  </div>
                )}
                {retainedCount === 0 && (
                  <p className="text-xs text-[#57544E]">Keep at least one word to export your poem.</p>
                )}
              </div>

              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="w-full py-2 text-[#57544E] hover:text-[#24231F] underline rounded text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {isExporting
                  ? 'Creating image…'
                  : view === 'poem'
                    ? 'Export poem as PNG'
                    : 'Export page as PNG'}
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
      {signInToSave && auth.manager && (
        <SignInDialog
          manager={auth.manager}
          reason="Sign in to save your poem. What is on the page stays just as it is."
          onClose={() => setSignInToSave(false)}
          onSignedIn={() => setIsSaveModalOpen(true)}
        />
      )}

      <SaveDraftModal
        isOpen={isSaveModalOpen}
        initialTitle={poemTitle}
        initialNotes={poemNotes}
        passageTitle={activePassage.title}
        retainedCount={retainedCount}
        onSave={handleSaveDraft}
        onClose={() => setIsSaveModalOpen(false)}
      />

      {pendingReplace && (
        <ConfirmDialog
          title="Discard your unsaved changes?"
          description={pendingReplace.message}
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onConfirm={() => {
            const { run } = pendingReplace;
            setPendingReplace(null);
            run();
          }}
          onCancel={() => setPendingReplace(null)}
        />
      )}
    </div>
  );
}
