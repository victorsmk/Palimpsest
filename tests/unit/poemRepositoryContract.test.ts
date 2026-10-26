import { BrowserPoemRepository, MemoryPoemRepository, MemoryStorageAdapter } from '@/lib/repositories';
import { runPoemRepositoryContract } from '../contract/poemRepositoryContract';

// The contract, run against every implementation there is.

runPoemRepositoryContract('MemoryPoemRepository', () => {
  const repo = new MemoryPoemRepository();
  const { create, update, importMany, delete: del } = {
    create: repo.create.bind(repo),
    update: repo.update.bind(repo),
    importMany: repo.importMany.bind(repo),
    delete: repo.delete.bind(repo),
  };
  const fail = async () => {
    throw new Error('the store is full');
  };
  return {
    repo,
    failWrites() {
      repo.create = fail;
      repo.update = fail;
      repo.importMany = fail;
      repo.delete = fail;
    },
    allowWrites() {
      repo.create = create;
      repo.update = update;
      repo.importMany = importMany;
      repo.delete = del;
    },
  };
});

runPoemRepositoryContract('BrowserPoemRepository (in-memory storage)', () => {
  const storage = new MemoryStorageAdapter();
  const set = storage.setItem.bind(storage);
  return {
    repo: new BrowserPoemRepository(storage),
    failWrites() {
      storage.setItem = () => {
        throw new Error('quota exceeded');
      };
    },
    allowWrites() {
      storage.setItem = set;
    },
  };
});
