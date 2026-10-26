import { BrowserPoemRepository, MemoryPoemRepository, MemoryStorageAdapter } from '@/lib/repositories';
import { runPoemRepositoryContract } from '../contract/poemRepositoryContract';

// The contract, run against every implementation there is.

runPoemRepositoryContract('MemoryPoemRepository', () => {
  const repo = new MemoryPoemRepository();
  const save = repo.saveMany.bind(repo);
  const del = repo.delete.bind(repo);
  const fail = async () => {
    throw new Error('the store is full');
  };
  return {
    repo,
    failWrites() {
      repo.saveMany = fail;
      repo.delete = fail;
      repo.save = fail;
    },
    allowWrites() {
      repo.saveMany = save;
      repo.delete = del;
      repo.save = (poem) => save([poem]);
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
