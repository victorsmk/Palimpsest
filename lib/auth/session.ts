/**
 * Who is signed in, as far as the data layer needs to know: the token to send with a request, or null
 * when nobody is. The sign-in itself (the dialog, the email code, Google) fills this in; the repository
 * that talks to the server only asks it.
 */
export interface SessionSource {
  getToken(): Promise<string | null>;
}

let source: SessionSource = { getToken: async () => null };

/** What the repositories ask. It follows whichever source is set, so a sign-in made later is used. */
export const session: SessionSource = { getToken: () => source.getToken() };

/** Sets where the token comes from. */
export function setSessionSource(next: SessionSource): void {
  source = next;
}
