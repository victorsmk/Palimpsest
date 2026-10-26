import { describe, it, expect, vi } from 'vitest';
import { PassageLibrary } from '@/lib/library/passageLibrary';
import { BookService } from '@/lib/services';
import { BrowserBookRepository } from '@/lib/repositories';
import { encodeAssistedHandoff, encodeSharedPoem, handoffPassageId } from '@/lib/handoff';
import { passage } from '../contract/bookRepositoryContract';

const A = passage('a', 'book-a');
const B = passage('b', 'book-b');
const C = passage('c', 'book-a');

/** A library over A, B and C whose fetches are counted, and can be made to fail. */
function counted() {
  const fetches: string[] = [];
  const state = { fail: false, delay: 0 };
  const library = new PassageLibrary([A, B, C].map(p => ({ id: p.id, bookId: p.bookId, title: p.title, description: p.description, attribution: p.attribution })), async id => {
    fetches.push(id);
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (state.fail) throw new Error('the server is down');
    return [A, B, C].find(p => p.id === id) ?? null;
  });
  return { library, fetches, state };
}

describe('PassageLibrary', () => {
  it('knows every passage from its summary and has loaded none of them', () => {
    const { library, fetches } = counted();
    expect(library.summaries.map(s => s.id)).toEqual(['a', 'b', 'c']);
    expect(library.has('b')).toBe(true);
    expect(library.has('zzz')).toBe(false);
    expect(library.get('a')).toBeUndefined();
    expect(library.passages()).toEqual([]);
    expect(fetches).toEqual([]);
  });

  it('loads only the passages asked for, and gives them back', async () => {
    const { library, fetches } = counted();
    expect(await library.ensure(['b'])).toEqual([B]);
    expect(fetches).toEqual(['b']);
    expect(library.get('b')).toBe(B);
    expect(library.get('a')).toBeUndefined();
    expect(library.passages()).toEqual([B]);
  });

  it('lists the loaded passages in the library order, not the order they were loaded', async () => {
    const { library } = counted();
    await library.ensure(['c']);
    await library.ensure(['a']);
    expect(library.passages().map(p => p.id)).toEqual(['a', 'c']);
  });

  it('fetches a passage once, however often or however many at once ask for it', async () => {
    const { library, fetches, state } = counted();
    state.delay = 10;
    const [one, two, three] = await Promise.all([library.ensure(['a']), library.ensure(['a', 'a']), library.ensure(['a', 'b'])]);
    expect(one).toEqual([A]);
    expect(two).toEqual([A]);
    expect(three).toEqual([A, B]);
    await library.ensure(['a', 'b']);
    expect(fetches.sort()).toEqual(['a', 'b']);
  });

  it('skips an id the library does not have, without asking anyone for it', async () => {
    const { library, fetches } = counted();
    expect(await library.ensure(['nope', 'a', '__proto__', 'constructor'])).toEqual([A]);
    expect(fetches).toEqual(['a']);
  });

  it('fails when a fetch fails, remembers nothing of the failure, and tries again the next time', async () => {
    const { library, fetches, state } = counted();
    state.fail = true;
    await expect(library.ensure(['a'])).rejects.toThrow('the server is down');
    expect(library.get('a')).toBeUndefined();
    state.fail = false;
    expect(await library.ensure(['a'])).toEqual([A]);
    expect(fetches).toEqual(['a', 'a']);
  });

  it('leaves the others loaded when one of several fails', async () => {
    const { library, state } = counted();
    await library.ensure(['a']);
    state.fail = true;
    await expect(library.ensure(['a', 'b'])).rejects.toThrow();
    expect(library.get('a')).toBe(A);
    expect(library.get('b')).toBeUndefined();
  });

  it('can be made from passages already in hand', async () => {
    const library = PassageLibrary.of([A, B]);
    expect(library.summaries.map(s => s.id)).toEqual(['a', 'b']);
    expect(await library.ensure(['b'])).toEqual([B]);
  });
});

describe('BookService.openLibrary', () => {
  it('lists the summaries once and gives every screen the same library, so what one loaded the next has', async () => {
    const repo = new BrowserBookRepository([A, B, C]);
    const list = vi.spyOn(repo, 'listPassageSummaries');
    const service = new BookService(repo);
    const first = await service.openLibrary();
    await first.ensure(['b']);
    const second = await service.openLibrary();
    expect(second).toBe(first);
    expect(second.get('b')).toBe(B);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('walks every page of the summaries', async () => {
    const many = Array.from({ length: 250 }, (_, i) => passage(`p${i}`, 'book'));
    const repo = new BrowserBookRepository(many);
    const list = vi.spyOn(repo, 'listPassageSummaries');
    const library = await new BookService(repo).openLibrary();
    expect(library.summaries).toHaveLength(250);
    expect(list).toHaveBeenCalledTimes(3); // 100 + 100 + 50
  });

  it('tries again after a failure, instead of keeping the failure', async () => {
    const repo = new BrowserBookRepository([A]);
    const list = vi.spyOn(repo, 'listPassageSummaries').mockRejectedValueOnce(new Error('offline'));
    const service = new BookService(repo);
    await expect(service.openLibrary()).rejects.toThrow('offline');
    expect((await service.openLibrary()).summaries.map(s => s.id)).toEqual(['a']);
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe('the passage a hand-off names, before anything is loaded', () => {
  it('is read from a found, assisted or shared link', () => {
    expect(handoffPassageId('#found=walden-woods:14-28:16,23')).toBe('walden-woods');
    expect(handoffPassageId('found=walden-woods:14-28:16,23')).toBe('walden-woods');
    expect(handoffPassageId(`#${encodeAssistedHandoff({ passageId: 'jane-eyre-ch1', keptPositions: [1, 2, 3], breakAfterPositions: [2] })}`)).toBe('jane-eyre-ch1');
    expect(handoffPassageId(`#${encodeSharedPoem({ passageId: 'dorian-gray-ch1', keptPositions: [4, 5, 6], breakAfterPositions: [5], erasureStyle: 'faded', title: 'T' })}`)).toBe('dorian-gray-ch1');
  });

  it('is null for anything that is not a well-formed hand-off', () => {
    for (const hash of ['', '#', '#open=abc', '#passage=walden-woods', '#found=', '#found=walden-woods:28-14:', '#assisted=x:bad:', '#poem=nothing', '#something-else']) {
      expect(handoffPassageId(hash)).toBeNull();
    }
  });
});
