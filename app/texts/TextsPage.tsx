'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AccountControl } from '@/components/AccountControl';
import { CollectionForPage } from '@/components/CollectionLink';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SiteHeader } from '@/components/SiteHeader';
import { TextEditor } from '@/components/TextEditor';
import { useLibrary } from '@/components/useLibrary';
import { userTexts } from '@/lib/services';
import { discoverHref } from '@/lib/handoff';
import { excerptsOf, UserTextError, type UserText, type UserTextInput } from '@/lib/userTexts/UserTexts';
import { countWords } from '@/lib/userTexts/cut';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

const SMALL =
  'rounded border border-[#C9B98F] px-3 py-1.5 text-xs font-medium text-[#24231F] transition-colors hover:bg-[#E4D8C2]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';
const PRIMARY =
  'rounded bg-[#6C3438] px-3 py-1.5 text-xs font-semibold text-[#F3EBDD] transition-colors hover:bg-[#57292D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';

/**
 * The texts the reader has added: to add one (a file, or pasted), to correct or rename it, to delete it, and to
 * start reading from it in any of the pages. They are kept in this browser only.
 */
export default function TextsPage() {
  const library = useLibrary();
  // The texts live in this browser, so they are read after the page has come up in it, not while it is made on the server.
  const [texts, setTexts] = useState<UserText[] | null>(null);
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [deleting, setDeleting] = useState<UserText | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setTexts(userTexts.list());
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, []);

  function save(input: UserTextInput) {
    const saved = editing && editing !== 'new' ? userTexts.update(editing, input) : userTexts.add(input);
    setTexts(userTexts.list());
    setEditing(null);
    setNotice(`Kept “${saved.title}”.`);
  }

  function remove(text: UserText) {
    try {
      userTexts.remove(text.id);
      setTexts(userTexts.list());
      setDeleting(null);
      setDeleteError(null);
      setNotice(`Deleted “${text.title}”.`);
    } catch (error) {
      setDeleteError(error instanceof UserTextError ? error.message : 'The text could not be deleted.');
    }
  }

  const changing = editing && editing !== 'new' ? (texts?.find(text => text.id === editing) ?? null) : null;

  return (
    <div className="flex min-h-screen flex-col px-4 pb-8 text-[#24231F] sm:px-8">
      <SiteHeader
        current="texts"
        title="Your own texts"
        subtitle="Kept in this browser only. Nothing you add is sent anywhere."
        actions={
          <>
            <CollectionForPage library={library.status === 'ready' ? library.library : null} />
            <AccountControl />
          </>
        }
      />

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 outline-none">
        <p className="mb-5 max-w-2xl font-literary text-[17px] leading-relaxed">
          Add a story, a letter, an essay or a poem of your own, and find poems in it, or erase your way to one, as you would in any book here. Add a plain text (.txt) or Word
          (.docx) file, or paste the words in. You can correct the text afterwards.
        </p>

        <p role="status" className="min-h-5 text-sm text-[#5B5D45]">
          {notice}
        </p>

        {editing === 'new' && <TextEditor onSave={save} onCancel={() => setEditing(null)} />}
        {changing && <TextEditor key={changing.id} text={changing} onSave={save} onCancel={() => setEditing(null)} />}

        {editing === null && (
          <button type="button" onClick={() => { setNotice(null); setEditing('new'); }} className={`${PRIMARY} px-4 py-2 text-sm`}>
            Add a text
          </button>
        )}

        {texts === null ? null : texts.length === 0 ? (
          editing === null && (
            <p className="mt-8 max-w-xl text-sm text-[#57544E]">You have not added any text yet. Add one, and it will be listed here.</p>
          )
        ) : (
          <ul className="mt-6 space-y-4" aria-label="Your texts">
            {texts.map(text => {
              const excerpts = excerptsOf(text);
              const first = excerpts[0];
              return (
                <li key={text.id} className="card-gilt rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] p-5 shadow-sm">
                  <h2 className="font-display text-xl font-bold leading-snug">{text.title}</h2>
                  <p className="text-xs text-[#57544E]">
                    {text.author || 'Unknown author'} · {plural(countWords(text.text), 'word', 'words')} · {plural(excerpts.length, 'excerpt', 'excerpts')}
                    {text.form === 'verse' && ' · poetry'}
                  </p>
                  <p className="font-literary mt-2 text-sm italic text-[#57544E]">{first?.description}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {first && (
                      <>
                        <Link href={`/studio#passage=${first.id}`} className={PRIMARY}>
                          Open in the Studio
                        </Link>
                        <Link href={discoverHref(first.id)} className={SMALL}>
                          Find poems in it
                        </Link>
                        <Link href={`/assist#passage=${first.id}`} className={SMALL}>
                          Erase with help
                        </Link>
                      </>
                    )}
                    <button type="button" onClick={() => { setNotice(null); setEditing(text.id); }} className={SMALL} aria-label={`Edit “${text.title}”`}>
                      Edit
                    </button>
                    <button type="button" onClick={() => { setDeleteError(null); setDeleting(text); }} className={SMALL} aria-label={`Delete “${text.title}”`}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-10 max-w-xl text-xs text-[#57544E]">
          Your texts stay in this browser. Poems you make from them can be saved like any other, but a poem can only be opened again where its text is: in this browser, on this
          computer. Add only texts you are free to use; a poem made from someone else&apos;s writing is for you to share with care.
        </p>
      </main>

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.title}”?`}
          description="The text will be removed from this browser, and poems made from it can no longer be opened. This can't be undone."
          confirmLabel="Delete text"
          onConfirm={() => remove(deleting)}
          onCancel={() => setDeleting(null)}
          error={deleteError}
        />
      )}
    </div>
  );
}
