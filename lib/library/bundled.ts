import type { Passage } from '@/lib/models';
import { tokenize } from '@/lib/tokenizer';

import janeEyre from '@/data/texts/jane-eyre-ch1.json';
import walden from '@/data/texts/walden-woods.json';
import dorianGray from '@/data/texts/dorian-gray-ch1.json';

type PassageSource = Omit<Passage, 'tokens'>;

function toPassage(source: PassageSource): Passage {
  return { ...source, tokens: tokenize(source.id, source.sourceText) };
}

/**
 * The curated library shipped with the app, in display order. Source text is
 * immutable; tokens (and their IDs) are derived from it by the tokenizer.
 */
export const bundledPassages: Passage[] = [janeEyre, walden, dorianGray].map(toPassage);
