'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AccountControl } from '@/components/AccountControl';
import { CollectionForPage } from '@/components/CollectionLink';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SiteHeader } from '@/components/SiteHeader';
import { TextEditor } from '@/components/TextEditor';
import { useAuth } from '@/components/useAuth';
import { useLibrary } from '@/components/useLibrary';
import { userTexts } from '@/lib/services';
import { describeTextError } from '@/lib/userTexts/describe';
import type { TextsWhere } from '@/lib/userTexts/TextLibrary';
import { discoverHref } from '@/lib/handoff';
import { excerptsOf, type UserText, type UserTextInput } from '@/lib/userTexts/UserTexts';
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
  const auth = useAuth();
  // Who is signed in decides where the texts are kept, so they are read again when that changes.
  const who = auth.state.status === 'signed-in' ? auth.state.user.id : auth.state.status;
  // The texts are read after the page has come up in the browser (they are in this browser or in the account), not while it is made on the server.
  const [texts, setTexts] = useState<UserText[] | null>(null);
  const [where, setWhere] = useState<TextsWhere | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [deleting, setDeleting] = useState<UserText | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (fresh: boolean) => {
    try {
      const kept = await userTexts.list(fresh);
      const keptIn = await userTexts.where();
      setLoadError(null);
      setWhere(keptIn);
      setTexts(kept);
      const copied = await userTexts.takeCopyReport();
      if (copied) {
        const some = copied.copied === 1 ? '1 text' : `${copied.copied} texts`;
        const left = copied.skipped.length > 0 ? ` ${copied.skipped.map(title => `“${title}”`).join(', ')} could not be copied, as your account had no room for ${copied.skipped.length === 1 ? 'it' : 'them'}.` : '';
        setNotice(`${copied.copied > 0 ? `${some} from this browser ${copied.copied === 1 ? 'was' : 'were'} copied to your account.` : ''}${left}`.trim());
      }
    } catch (error) {
      setTexts(current => current ?? []);
      setLoadError(describeTextError(error, 'list'));
    }
  }, []);

  useEffect(() => {
    if (auth.state.status === 'loading' && auth.enabled) return;
    // (Started a moment later, so that the page is not changed while it is being drawn.)
    const first = setTimeout(() => void load(true), 0);
    const read = () => void load(false);
    window.addEventListener('storage', read);
    return () => {
      clearTimeout(first);
      window.removeEventListener('storage', read);
    };
  }, [who, auth.enabled, auth.state.status, load]);

  async function save(input: UserTextInput) {
    const saved = editing && editing !== 'new' ? await userTexts.update(editing, input) : await userTexts.add(input);
    setTexts(await userTexts.list(true));
    setEditing(null);
    setNotice(`Kept “${saved.title}”.`);
  }

  async function remove(text: UserText) {
    try {
      await userTexts.remove(text.id);
      setTexts(await userTexts.list(true));
      setDeleting(null);
      setDeleteError(null);
      setNotice(`Deleted “${text.title}”.`);
    } catch (error) {
      setDeleteError(describeTextError(error, 'delete'));
    }
  }

  const inAccount = where === 'account';
  const subtitle =
    where === null
      ? 'Your own writing, made into books.'
      : inAccount
        ? 'Kept in your account, so they are there in any browser you sign in on.'
        : auth.enabled
          ? 'Kept in this browser only. Sign in, and they are kept in your account instead.'
          : 'Kept in this browser only. Nothing you add is sent anywhere.';

  const changing = editing && editing !== 'new' ? (texts?.find(text => text.id === editing) ?? null) : null;

  return (
    <div className="flex min-h-screen flex-col px-4 pb-8 text-[#24231F] sm:px-8">
      <SiteHeader
        current="texts"
        title="Your own texts"
        subtitle={subtitle}
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

        {loadError && (
          <div role="alert" className="mb-4 rounded border border-[#C9B98F] bg-[#F6EEDB] p-3 text-sm text-[#6C3438]">
            {loadError}{' '}
            <button type="button" onClick={() => void load(true)} className={SMALL}>
              Try again
            </button>
          </div>
        )}

        {editing === 'new' && <TextEditor onSave={save} where={where ?? 'browser'} onCancel={() => setEditing(null)} />}
        {changing && <TextEditor key={changing.id} text={changing} onSave={save} where={where ?? 'browser'} onCancel={() => setEditing(null)} />}

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
          {inAccount
            ? 'Your texts are kept in your account, on our server, where only you can read them; they are deleted with the account. Poems you make from them can be saved like any other, and open again in any browser you sign in on. '
            : 'Your texts stay in this browser. Poems you make from them can be saved like any other, but a poem can only be opened again where its text is: in this browser, on this computer. '}
          Add only texts you are free to use; a poem made from someone else&apos;s writing is for you to share with care.
        </p>
      </main>

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.title}”?`}
          description={
            inAccount
              ? "The text will be removed from your account, and poems made from it can no longer be opened. This can't be undone."
              : "The text will be removed from this browser, and poems made from it can no longer be opened. This can't be undone."
          }
          confirmLabel="Delete text"
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
          error={deleteError}
        />
      )}
    </div>
  );
}
