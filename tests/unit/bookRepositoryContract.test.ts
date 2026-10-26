import { BrowserBookRepository } from '@/lib/repositories';
import { runBookRepositoryContract } from '../contract/bookRepositoryContract';

// The library contract, run against every implementation there is.
runBookRepositoryContract('BrowserBookRepository', passages => new BrowserBookRepository(passages));
