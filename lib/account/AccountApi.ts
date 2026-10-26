import { ApiClient, type ApiClientOptions } from '@/lib/repositories/http/ApiClient';

/** What the API does with the account itself, as opposed to the poems in it. */
export class AccountApi {
  private api: ApiClient;

  constructor(options: ApiClientOptions) {
    this.api = new ApiClient(options);
  }

  /**
   * Deletes the signed-in user's account and every poem in it, for good. If it fails part way (the poems
   * are gone but the account could not be removed), asking again finishes it.
   */
  async deleteAccount(): Promise<void> {
    await this.api.send('DELETE', '/api/account');
  }
}
