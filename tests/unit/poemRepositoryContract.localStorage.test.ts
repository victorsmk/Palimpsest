// @vitest-environment jsdom
import { afterEach } from 'vitest';
import { BrowserPoemRepository } from '@/lib/repositories';
import { runPoemRepositoryContract } from '../contract/poemRepositoryContract';

// The contract again, against a real Storage object (the one the app really uses), not a stand-in.

const realSetItem = Storage.prototype.setItem;
const realRemoveItem = Storage.prototype.removeItem;

afterEach(() => {
  Storage.prototype.setItem = realSetItem;
  Storage.prototype.removeItem = realRemoveItem;
  localStorage.clear();
});

runPoemRepositoryContract('BrowserPoemRepository (real localStorage)', () => {
  localStorage.clear();
  return {
    repo: new BrowserPoemRepository(localStorage),
    failWrites() {
      // On the prototype: assigning to the object itself would store an item called "setItem".
      Storage.prototype.setItem = () => {
        throw new DOMException('full', 'QuotaExceededError');
      };
      Storage.prototype.removeItem = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
    },
    allowWrites() {
      Storage.prototype.setItem = realSetItem;
      Storage.prototype.removeItem = realRemoveItem;
    },
  };
});
