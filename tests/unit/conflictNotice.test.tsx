// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { SaveDraftModal } from '@/components/SaveDraftModal';
import { noticeFor } from '@/lib/errors/describe';
import { PoemConflictError, PoemGoneError, PoemLimitError, StorageError, type Poem } from '@/lib/models';
import { render, click } from '../helpers/react';

// A poem changed or deleted somewhere else is told in a pop-up with its own heading, not in a line of
// small text under the form.

const aPoem = { id: 'x' } as Poem;
afterEach(() => {
  document.body.innerHTML = '';
});

describe('the words of the pop-up', () => {
  it('for a save over a poem changed somewhere else: what happened, that nothing was overwritten, what to do', () => {
    const notice = noticeFor(new PoemConflictError(aPoem), 'save')!;
    expect(notice.title).toBe('This poem was changed somewhere else');
    expect(notice.body).toContain('Your save was not made');
    expect(notice.body).toContain('nothing there was overwritten');
    expect(notice.body).toContain('what you have on this page is untouched');
    expect(notice.body).toContain('open it again from My Collection');
  });

  it('for a rename of a poem changed somewhere else: that the name was not saved and the list was updated', () => {
    const notice = noticeFor(new PoemConflictError(aPoem), 'rename')!;
    expect(notice.title).toBe('This poem was changed somewhere else');
    expect(notice.body).toContain('The new name was not saved');
    expect(notice.body).toContain('the list now shows the poem as it is');
  });

  it('for a save over a poem deleted somewhere else: that it was not brought back and saving again makes a new one', () => {
    const notice = noticeFor(new PoemGoneError(), 'save')!;
    expect(notice.title).toBe('This poem was deleted somewhere else');
    expect(notice.body).toContain('was not brought back');
    expect(notice.body).toContain('Save again to keep it as a new poem');
  });

  it('is none for anything else: a limit, a full browser, a poem gone from a list, or something unknown', () => {
    expect(noticeFor(new PoemLimitError('Too long.'), 'save')).toBeNull();
    expect(noticeFor(new StorageError('full'), 'save')).toBeNull();
    expect(noticeFor(new PoemGoneError(), 'rename')).toBeNull();
    expect(noticeFor(new Error('x'), 'save')).toBeNull();
    expect(noticeFor(undefined, 'rename')).toBeNull();
  });
});

describe('the save form', () => {
  const settled = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  function open(onSave: (title: string, notes: string) => Promise<void>, onClose = vi.fn()) {
    render(createElement(SaveDraftModal, { isOpen: true, initialTitle: 'My poem', initialNotes: 'my notes', passageTitle: 'Walden', retainedCount: 5, onSave, onClose }));
    return onClose;
  }
  const submit = async () => {
    click([...document.querySelectorAll('button')].find(b => b.textContent === 'Save Draft'));
    await settled();
  };
  const popup = () => document.querySelector('[role=alertdialog]');
  const inlineError = () => document.querySelector('form [role=alert]');

  it('shows a pop-up, and nothing inline, when the poem was changed somewhere else', async () => {
    open(async () => { throw new PoemConflictError(aPoem); });
    await submit();
    expect(popup()).not.toBeNull();
    expect(popup()!.querySelector('h2')!.textContent).toBe('This poem was changed somewhere else');
    expect(inlineError()).toBeNull();
  });

  it('shows the pop-up for a poem deleted somewhere else, too', async () => {
    open(async () => { throw new PoemGoneError(); });
    await submit();
    expect(popup()!.querySelector('h2')!.textContent).toBe('This poem was deleted somewhere else');
  });

  it('puts focus on the pop-up’s button, and closes only the pop-up with it: the form and what was typed stay', async () => {
    const onClose = open(async () => { throw new PoemConflictError(aPoem); });
    await submit();
    const ok = popup()!.querySelector('button')!;
    expect(ok.textContent).toBe('OK');
    expect(document.activeElement).toBe(ok);
    click(ok);
    expect(popup()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect((document.getElementById('poem-title') as HTMLInputElement).value).toBe('My poem');
    expect((document.getElementById('poem-notes') as HTMLTextAreaElement).value).toBe('my notes');
  });

  it('closes the pop-up with Escape, and not the form behind it', async () => {
    const onClose = open(async () => { throw new PoemConflictError(aPoem); });
    await submit();
    act(() => {
      popup()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(popup()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[role=dialog]')).not.toBeNull();
  });

  it('can be tried again after the pop-up: a second failure shows it again', async () => {
    let tries = 0;
    open(async () => {
      tries++;
      throw new PoemConflictError(aPoem);
    });
    await submit();
    click(popup()!.querySelector('button'));
    await submit();
    expect(tries).toBe(2);
    expect(popup()).not.toBeNull();
  });

  it('keeps small text under the form for other problems (a limit, a full browser), and no pop-up', async () => {
    open(async () => { throw new PoemLimitError('Notes can be at most 10,000 characters.'); });
    await submit();
    expect(popup()).toBeNull();
    expect(inlineError()!.textContent).toBe('Notes can be at most 10,000 characters.');
  });

  it('shows neither when the save works, and closes the form', async () => {
    const onClose = open(async () => {});
    await submit();
    expect(popup()).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
