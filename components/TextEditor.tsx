'use client';

import { useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import { cutUserText, countWords, type TextForm } from '@/lib/userTexts/cut';
import { FileReadError, readTextFile } from '@/lib/userTexts/files';
import { USER_TEXT_LIMITS, type UserText, type UserTextInput } from '@/lib/userTexts/UserTexts';

const FIELD =
  'w-full rounded border border-[#C9B98F] bg-[#FAF6EE] px-3 py-2 text-sm text-[#24231F] shadow-inner focus:border-[#C29A45] focus:outline-none focus:ring-2 focus:ring-[#C29A45]/60';
const LABEL = 'mb-1 block text-xs font-medium uppercase tracking-wider text-[#57544E]';
const BUTTON =
  'rounded px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438] disabled:opacity-60';

interface TextEditorProps {
  /** The text being changed; none when a new one is being added. */
  text?: UserText;
  /** Called with what the reader typed; it rejects with a message to show if the text cannot be kept. */
  onSave: (input: UserTextInput) => Promise<void>;
  /** Where the text will be kept, for what the form says about it. */
  where?: 'account' | 'browser';
  onCancel: () => void;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/**
 * Adding a text, or changing one: choose a file (.txt or .docx) or paste the text, name it, and correct it in the
 * box before it is kept. It says how many words and how many excerpts there will be.
 */
export function TextEditor({ text, onSave, onCancel, where = 'browser' }: TextEditorProps) {
  const ids = { title: useId(), author: useId(), body: useId(), file: useId(), help: useId() };
  const [title, setTitle] = useState(text?.title ?? '');
  const [author, setAuthor] = useState(text?.author ?? '');
  const [form, setForm] = useState<TextForm>(text?.form ?? 'prose');
  const [body, setBody] = useState(text?.text ?? '');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // The count follows the text, a moment behind it: cutting a long text on every key would make typing in it heavy.
  const counted = useDeferredValue({ body, form });
  const outline = useMemo(() => ({ words: countWords(counted.body), excerpts: cutUserText(counted.body, counted.form).length }), [counted]);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNote(null);
    setReading(true);
    try {
      const read = await readTextFile(file);
      setBody(read.text);
      setForm(read.form);
      if (title.trim() === '') setTitle(read.title.slice(0, USER_TEXT_LIMITS.title));
      setNote(`Read “${file.name}”. Check the text below, and correct anything that came out wrong.`);
    } catch (problem) {
      setError(problem instanceof FileReadError ? problem.message : 'That file could not be read.');
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({ title, author, form, text: body });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The text could not be kept.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={event => void save(event)} aria-label={text ? `Change “${text.title}”` : 'Add a text'} className="card-gilt rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] p-5 shadow-sm">
      <h2 className="font-display text-xl font-bold text-[#24231F]">{text ? 'Change this text' : 'Add a text'}</h2>

      <div className="mt-4 rounded border border-dashed border-[#C9B98F] bg-[#F6EEDB] p-4">
        <label htmlFor={ids.file} className={LABEL}>
          A file from your computer
        </label>
        <input
          id={ids.file}
          ref={fileInput}
          type="file"
          accept=".txt,.text,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={reading}
          onChange={event => void chooseFile(event.target.files?.[0])}
          aria-describedby={ids.help}
          className="block w-full text-sm text-[#24231F] file:mr-3 file:rounded file:border file:border-[#7A5C1A] file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#5E4512] hover:file:bg-[#E4D8C2]"
        />
        <p id={ids.help} className="mt-2 text-xs text-[#57544E]">
          Plain text (.txt) or Word (.docx). {where === 'account'
            ? 'It is read here, in this browser, and sent to your account only when you keep it. Or type or paste the text in the box below.'
            : 'It is read here, in this browser, and kept only here: nothing is sent anywhere. Or type or paste the text in the box below.'}
        </p>
        <p role="status" className="mt-2 text-xs text-[#5B5D45]">
          {reading ? 'Reading the file…' : note}
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.title} className={LABEL}>
            Title
          </label>
          <input id={ids.title} value={title} onChange={event => setTitle(event.target.value)} maxLength={USER_TEXT_LIMITS.title} autoComplete="off" className={FIELD} />
        </div>
        <div>
          <label htmlFor={ids.author} className={LABEL}>
            Author <span className="normal-case tracking-normal">(if you like)</span>
          </label>
          <input id={ids.author} value={author} onChange={event => setAuthor(event.target.value)} maxLength={USER_TEXT_LIMITS.author} autoComplete="off" className={FIELD} />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className={LABEL}>The text is</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="form" checked={form === 'prose'} onChange={() => setForm('prose')} /> Prose (paragraphs)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="form" checked={form === 'verse'} onChange={() => setForm('verse')} /> Poetry (keep every line as it is)
          </label>
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor={ids.body} className={LABEL}>
          The text
        </label>
        <textarea
          id={ids.body}
          value={body}
          onChange={event => setBody(event.target.value)}
          rows={14}
          spellCheck
          className={`${FIELD} font-literary min-h-[16rem] text-[15px] leading-relaxed`}
        />
        <p role="status" className="mt-1 text-xs text-[#57544E]">
          {outline.words === 0 ? 'Nothing here yet.' : `${plural(outline.words, 'word', 'words')}, in ${plural(outline.excerpts, 'excerpt', 'excerpts')} of about 450 words.`}
        </p>
      </div>

      {text && (
        <p className="mt-3 rounded bg-[#F6EEDB] px-3 py-2 text-xs text-[#57544E]">
          Poems already made from the parts of this text that you leave as they are will go on working. Poems made from a part you change cannot be opened
          again.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-[#6C3438]">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={saving} className={`${BUTTON} bg-[#6C3438] text-[#F3EBDD] hover:bg-[#57292D]`}>
          {saving ? 'Keeping…' : text ? 'Save changes' : 'Keep this text'}
        </button>
        <button type="button" onClick={onCancel} className={`${BUTTON} border border-[#C9B98F] text-[#24231F] hover:bg-[#E4D8C2]/60`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
