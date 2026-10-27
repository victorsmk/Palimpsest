import { describe, it, expect } from 'vitest';
import { MemoryTextStorage, UserTexts, UserTextError, USER_TEXT_LIMITS, USER_TEXTS_KEY, excerptsOf, isUserId, checkInput, type TextStorage } from '@/lib/userTexts/UserTexts';
import { BookService } from '@/lib/services/BookService';
import { BrowserBookRepository } from '@/lib/repositories';
import { PassageLibrary } from '@/lib/library/passageLibrary';
import { passageIdFromHash } from '@/lib/handoff';
import { SAFE_ID } from '@/lib/server/api/validate';

const para = (tag: string, n = 100) => `${Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ')}.`;
const long = (paragraphs: number, tag = 'p') => Array.from({ length: paragraphs }, (_, i) => para(`${tag}${i}x`)).join('\n\n');
const input = (over: Partial<Parameters<UserTexts['add']>[0]> = {}) => ({ title: 'My Story', author: 'Me', form: 'prose' as const, text: 'Once upon a time.\n\nThe end.', ...over });

/** A clock that moves on a minute each time it is read. */
function clock() {
  let at = Date.UTC(2026, 0, 1);
  return () => new Date((at += 60_000));
}

const make = (storage: TextStorage = new MemoryTextStorage()) => new UserTexts(storage, clock());

describe('keeping texts', () => {
  it('adds a text, and gives it an id the address bar and the server accept', () => {
    const texts = make();
    const text = texts.add(input());
    expect(isUserId(text.id)).toBe(true);
    expect(texts.get(text.id)).toEqual(text);
    expect(texts.list()).toEqual([text]);
    expect(text.createdAt).toBe(text.updatedAt);
    for (const excerpt of excerptsOf(text)) {
      expect(isUserId(excerpt.id)).toBe(true);
      expect(SAFE_ID.test(excerpt.id)).toBe(true);
      expect(passageIdFromHash(`#passage=${excerpt.id}`)).toBe(excerpt.id);
    }
  });

  it('keeps what it is given tidy: spaces in the title, the text with one kind of line end', () => {
    const text = make().add(input({ title: '  A   Long\tTitle ', author: ' Some  One ', text: 'one\r\ntwo\r\n\r\n\r\n\r\nthree' }));
    expect(text.title).toBe('A Long Title');
    expect(text.author).toBe('Some One');
    expect(text.text).toBe('one\ntwo\n\nthree');
  });

  it('lists the text changed last first', () => {
    const texts = make();
    const a = texts.add(input({ title: 'A' }));
    const b = texts.add(input({ title: 'B' }));
    expect(texts.list().map(t => t.title)).toEqual(['B', 'A']);
    texts.update(a.id, input({ title: 'A edited' }));
    expect(texts.list().map(t => t.title)).toEqual(['A edited', 'B']);
    expect(b.id).not.toBe(a.id);
  });

  it('changes a text and keeps its id and the time it was made', () => {
    const texts = make();
    const original = texts.add(input());
    const updated = texts.update(original.id, input({ title: 'New title', text: 'Different words.' }));
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.updatedAt > original.updatedAt).toBe(true);
    expect(texts.get(original.id)?.text).toBe('Different words.');
  });

  it('deletes a text, and is quiet about one that is not there', () => {
    const texts = make();
    const a = texts.add(input());
    texts.remove(a.id);
    texts.remove(a.id);
    expect(texts.list()).toEqual([]);
  });

  it('keeps its texts in the storage, so that another visit finds them', () => {
    const storage = new MemoryTextStorage();
    const text = make(storage).add(input());
    expect(make(storage).get(text.id)).toEqual(text);
  });

  it('says what is wrong with a text it will not keep', () => {
    const texts = make();
    expect(() => texts.add(input({ title: '   ' }))).toThrow(/title/);
    expect(() => texts.add(input({ title: 'x'.repeat(USER_TEXT_LIMITS.title + 1) }))).toThrow(/title/);
    expect(() => texts.add(input({ author: 'x'.repeat(USER_TEXT_LIMITS.author + 1) }))).toThrow(/author/);
    expect(() => texts.add(input({ text: ' \n\n ' }))).toThrow(/no text/);
    expect(() => texts.add(input({ text: 'word '.repeat(USER_TEXT_LIMITS.text / 5 + 10) }))).toThrow(/too long/);
    expect(() => texts.add({ ...input(), form: 'odd' as never })).toThrow(UserTextError);
    expect(() => texts.update('my-abcdefgh', input())).toThrow(/not kept/);
    expect(texts.list()).toEqual([]);
  });

  it('keeps no more than a number of texts, and no more than the browser has room for', () => {
    const texts = make();
    for (let i = 0; i < USER_TEXT_LIMITS.count; i++) texts.add(input({ title: `T${i}` }));
    expect(() => texts.add(input())).toThrow(/Up to 30 texts/);

    const roomy = make();
    const chunk = 'word '.repeat(USER_TEXT_LIMITS.text / 5 - 10);
    roomy.add(input({ text: chunk }));
    roomy.add(input({ text: chunk }));
    roomy.add(input({ text: chunk }));
    expect(() => roomy.add(input({ text: chunk }))).toThrow(/room/);
    // a change that makes a text bigger is checked against the room without the text's old self
    const [first] = roomy.list();
    expect(() => roomy.update(first.id, input({ text: chunk }))).not.toThrow();
  });

  it('says so, and keeps what it had, when the browser refuses to store', () => {
    const texts = make();
    const kept = texts.add(input());
    const full: TextStorage = { getItem: key => (key === USER_TEXTS_KEY ? JSON.stringify({ version: 1, texts: [kept] }) : null), setItem: () => { throw new Error('QuotaExceededError'); } };
    const stuck = new UserTexts(full);
    expect(() => stuck.add(input())).toThrow(/no room left/);
    expect(stuck.list()).toEqual([kept]);
  });

  it('does not write over stored data it cannot read', () => {
    for (const garbage of ['{not json', '[]', '"text"', '{"texts":"no"}']) {
      const storage = new MemoryTextStorage();
      storage.setItem(USER_TEXTS_KEY, garbage);
      const texts = make(storage);
      expect(texts.list()).toEqual([]);
      expect(() => texts.add(input())).toThrow(/cannot be read/);
      expect(storage.getItem(USER_TEXTS_KEY)).toBe(garbage);
    }
  });

  it('skips stored entries that are not texts, and keeps the ones that are', () => {
    const storage = new MemoryTextStorage();
    const good = make(storage).add(input());
    const stored = JSON.parse(storage.getItem(USER_TEXTS_KEY)!);
    stored.texts.push({ id: 'pg1260', title: 'x' }, null, 7, { ...good, id: 'not an id' }, { ...good, form: 'poem' });
    storage.setItem(USER_TEXTS_KEY, JSON.stringify(stored));
    expect(make(storage).list().map(t => t.id)).toEqual([good.id]);
  });

  it('checks the input the same way the form does', () => {
    expect(checkInput(input({ title: ' T ' })).title).toBe('T');
  });
});

describe('the excerpts of a text', () => {
  it('are one for a short text, named for the text, and parts of it for a long one', () => {
    const [only] = excerptsOf({ id: 'my-aaaaaaaa', title: 'Short', form: 'prose', text: 'A few words.' });
    expect(only.title).toBe('Short');
    const many = excerptsOf({ id: 'my-aaaaaaaa', title: 'Long', form: 'prose', text: long(12) });
    expect(many.map(e => e.title)).toEqual(['Long — Part 1 of 3', 'Long — Part 2 of 3', 'Long — Part 3 of 3']);
    expect(many[0].description).toMatch(/^p0x0 p0x1 p0x2/);
    expect(many[0].description.endsWith('…')).toBe(true);
  });

  it('keep their ids when a different part of the text is edited, and change the id of the part that was edited', () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => para(`q${i}x`));
    const base = { id: 'my-aaaaaaaa', title: 'Long', form: 'prose' as const };
    const before = excerptsOf({ ...base, text: paragraphs.join('\n\n') });
    const edited = [...paragraphs];
    edited[11] = para('changed');
    const after = excerptsOf({ ...base, text: edited.join('\n\n') });
    expect(after.slice(0, 2).map(e => e.id)).toEqual(before.slice(0, 2).map(e => e.id));
    expect(after[2].id).not.toBe(before[2].id);
    // a retitled text keeps every id too (the ids follow what the text says)
    expect(excerptsOf({ ...base, title: 'Renamed', text: paragraphs.join('\n\n') }).map(e => e.id)).toEqual(before.map(e => e.id));
  });

  it('are told apart by a number when two say the same thing', () => {
    const same = para('same');
    const excerpts = excerptsOf({ id: 'my-aaaaaaaa', title: 'Echo', form: 'prose', text: Array(10).fill(same).join('\n\n') });
    expect(excerpts.length).toBeGreaterThan(1);
    expect(new Set(excerpts.map(e => e.id)).size).toBe(excerpts.length);
    for (const excerpt of excerpts) expect(isUserId(excerpt.id)).toBe(true);
  });
});

describe('the texts as a library of books', () => {
  it('lists them as books, found by title or author, ignoring capitals and accents', async () => {
    const texts = make();
    texts.add(input({ title: 'Lettres de Brontë', author: 'Émile' }));
    texts.add(input({ title: 'Other', author: 'Nobody' }));
    expect((await texts.listBooks()).items.map(b => b.title)).toEqual(['Other', 'Lettres de Brontë']);
    expect((await texts.listBooks({ search: 'BRONTE emile' })).items.map(b => b.title)).toEqual(['Lettres de Brontë']);
    expect((await texts.listBooks({ search: 'zzz' })).items).toEqual([]);
    const page = await texts.listBooks({ limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.next).not.toBeNull();
    const rest = await texts.listBooks({ limit: 1, after: page.next! });
    expect(rest.items.map(b => b.title)).toEqual(['Lettres de Brontë']);
  });

  it('gives a book that says it is the reader’s own, whose author is unknown if none was given', async () => {
    const texts = make();
    const text = texts.add(input({ author: '' }));
    const book = (await texts.getBook(text.id))!;
    expect(book.author).toBe('Unknown author');
    expect(book.attribution.source).toBe('Your own text');
    expect(book.attribution.url).toBe('');
    expect(await texts.getBook('my-zzzzzzzz')).toBeNull();
  });

  it('gives an excerpt in full, with its words, where it is in the text, and the one before and after', async () => {
    const texts = make();
    const text = texts.add(input({ text: long(12) }));
    const summaries = (await texts.listPassageSummaries({ bookId: text.id })).items;
    expect(summaries).toHaveLength(3);
    expect(summaries.every(s => s.wordCount !== undefined && s.wordCount > 0)).toBe(true);
    const second = (await texts.getPassage(summaries[1].id))!;
    expect(second.position).toEqual({ ordinal: 2, count: 3, previousId: summaries[0].id, nextId: summaries[2].id });
    expect(second.tokens[0].id.startsWith(`${second.id}-token-`)).toBe(true);
    expect(second.tokens.length).toBeGreaterThan(400);
    expect(second.bookId).toBe(text.id);
    const first = (await texts.getPassage(summaries[0].id))!;
    expect(first.position?.previousId).toBeNull();
    const last = (await texts.getPassage(summaries[2].id))!;
    expect(last.position?.nextId).toBeNull();
  });

  it('gives nothing for an id that is not one of its excerpts, or for a text that has been changed so that the excerpt is gone', async () => {
    const texts = make();
    const text = texts.add(input({ text: long(4) }));
    const [excerpt] = (await texts.listPassageSummaries({ bookId: text.id })).items;
    expect(await texts.getPassage('walden-woods')).toBeNull();
    expect(await texts.getPassage(`${text.id}-zzzzzzz`)).toBeNull();
    expect(await texts.getPassage('my-zzzzzzzz-abc')).toBeNull();
    texts.update(text.id, input({ text: 'Nothing like it any more.' }));
    expect(await texts.getPassage(excerpt.id)).toBeNull();
  });

  it('makes a poem of lines when the text is verse', async () => {
    const texts = make();
    const text = texts.add(input({ form: 'verse', text: 'Roses are red\nViolets are blue\n\nSugar is sweet\nAnd so are you' }));
    const [summary] = (await texts.listPassageSummaries({ bookId: text.id })).items;
    const passage = (await texts.getPassage(summary.id))!;
    expect(passage.tokens.filter(t => t.lineStart).map(t => t.text)).toEqual(['Violets', 'And']);
    expect((await texts.getBook(text.id))!.form).toBe('verse');
  });

  it('shows a change at once: the excerpts follow the text', async () => {
    const texts = make();
    const text = texts.add(input({ text: 'Before.' }));
    const [before] = (await texts.listPassageSummaries({ bookId: text.id })).items;
    texts.update(text.id, input({ text: 'After the edit.' }));
    const [after] = (await texts.listPassageSummaries({ bookId: text.id })).items;
    expect(after.id).not.toBe(before.id);
    expect(after.description).toBe('After the edit.');
  });
});

describe('the book service with the reader’s own texts', () => {
  const setup = () => {
    const texts = make();
    const service = new BookService(new BrowserBookRepository([]), null, texts);
    return { texts, service };
  };

  it('reads an excerpt of the reader’s own, and lists the own books, with or without a library of books', async () => {
    const { texts, service } = setup();
    const text = texts.add(input({ text: long(8) }));
    const { items } = await service.listBookPassages(text.id);
    expect(items).toHaveLength(2);
    expect((await service.getPassage(items[0].id))?.title).toContain('My Story');
    expect((await service.listOwnBooks()).items.map(b => b.id)).toEqual([text.id]);
    expect((await service.getRemoteBook(text.id))?.title).toBe('My Story');
    expect((await service.searchBooks()).items).toEqual([]); // the server's books: there are none
  });

  it('has nothing of the kind when it was given no texts', async () => {
    const service = new BookService(new BrowserBookRepository([]));
    expect(await service.getPassage('my-abcdefgh-abc')).toBeNull();
    expect((await service.listOwnBooks()).items).toEqual([]);
    expect(await service.getRemoteBook('my-abcdefgh')).toBeNull();
    expect((await service.listBookPassages('my-abcdefgh')).items).toEqual([]);
  });

  it('is asked for an excerpt by a library that lists only the bundled passages, and finds it', async () => {
    const { texts, service } = setup();
    const text = texts.add(input());
    const [excerpt] = (await texts.listPassageSummaries({ bookId: text.id })).items;
    const library = await service.openLibrary();
    expect(library).toBeInstanceOf(PassageLibrary);
    expect(library.has(excerpt.id)).toBe(false); // it is not in the list
    const [passage] = await library.ensure([excerpt.id, 'walden-woods']); // the id it does not have is skipped
    expect(passage.id).toBe(excerpt.id);
    expect(library.get(excerpt.id)).toBe(passage);
  });
});
