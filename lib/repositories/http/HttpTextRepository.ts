import { UnavailableError } from '@/lib/models';
import { isTextId } from '@/lib/userTexts/id';
import type { UserText, UserTextInput } from '@/lib/userTexts/UserTexts';
import { ApiClient, type ApiClientOptions } from './ApiClient';

/** A text as the server sends it, checked as strictly as one read from the browser's storage. */
function parseText(raw: unknown): UserText | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  if (
    typeof t.id !== 'string' || !isTextId(t.id) ||
    typeof t.title !== 'string' || typeof t.author !== 'string' || typeof t.text !== 'string' ||
    (t.form !== 'prose' && t.form !== 'verse') ||
    typeof t.createdAt !== 'string' || typeof t.updatedAt !== 'string'
  ) {
    return null;
  }
  return { id: t.id, title: t.title, author: t.author, form: t.form, text: t.text, createdAt: t.createdAt, updatedAt: t.updatedAt };
}

/**
 * A signed-in reader's own texts on the server, through the texts API (lib/server/api/texts.ts). Failures are
 * the same typed errors as the poems repository gives: not signed in, gone, already there, over a limit (in the
 * server's own words), rate limited, offline or unavailable.
 */
export class HttpTextRepository {
  private api: ApiClient;

  constructor(options: ApiClientOptions) {
    this.api = new ApiClient(options);
  }

  private async text(response: Response): Promise<UserText> {
    const text = parseText(await this.api.read(response));
    if (!text) throw new UnavailableError({ cause: new Error('The server sent a text that is not valid') });
    return text;
  }

  async list(): Promise<UserText[]> {
    const raw = (await this.api.read(await this.api.send('GET', '/api/texts'))) as { texts?: unknown } | null;
    if (!raw || !Array.isArray(raw.texts)) throw new UnavailableError({ cause: new Error('The server sent a list that is not valid') });
    return raw.texts.map(entry => {
      const text = parseText(entry);
      if (!text) throw new UnavailableError({ cause: new Error('The server sent a text that is not valid') });
      return text;
    });
  }

  /** Adds a text under the id the browser made; `times` carries those of a text copied from this browser. */
  async create(id: string, input: UserTextInput, times?: { createdAt: string; updatedAt: string }): Promise<UserText> {
    return this.text(await this.api.send('POST', '/api/texts', { body: { id, ...input, ...times } }));
  }

  async update(id: string, input: UserTextInput): Promise<UserText> {
    return this.text(await this.api.send('PUT', `/api/texts/${encodeURIComponent(id)}`, { body: input }));
  }

  async remove(id: string): Promise<void> {
    await this.api.send('DELETE', `/api/texts/${encodeURIComponent(id)}`);
  }
}
