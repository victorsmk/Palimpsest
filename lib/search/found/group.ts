import type { Token } from '@/lib/models';
import type { FoundCandidate, FoundFamily } from './types';

/**
 * Two candidates are near-copies when they share MORE than this fraction of the words of the
 * shorter one. With the usual 17-word candidates that means a window that slid by up to 8 words
 * still belongs to the same family, and one that slid by 9 or more starts a new one.
 */
export const DEFAULT_MIN_OVERLAP = 0.5;

export function foundCandidateTokens(candidate: FoundCandidate): Token[] {
  return [...candidate.line1.tokens, ...candidate.line2.tokens, ...candidate.line3.tokens];
}

function sharedWordCount(a: Token[], b: Token[]): number {
  const ids = new Set(a.map(t => t.id));
  return b.reduce((count, t) => count + (ids.has(t.id) ? 1 : 0), 0);
}

function compareCandidates(a: FoundCandidate, b: FoundCandidate): number {
  if (a.startPosition !== b.startPosition) return a.startPosition - b.startPosition;
  if (a.endPosition !== b.endPosition) return a.endPosition - b.endPosition;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Groups overlapping candidates into families, in source order. A candidate joins the first
 * family whose representative it overlaps by more than `minOverlap` of the shorter one's words;
 * otherwise it starts a new family and becomes that family's representative. Candidates are
 * compared with the representative only, never with other members, so a long chain of one-word
 * shifts cannot merge a whole passage into a single family. Every candidate lands in exactly one
 * family, and nothing is dropped.
 */
export function groupFoundCandidates(
  candidates: FoundCandidate[],
  minOverlap: number = DEFAULT_MIN_OVERLAP
): FoundFamily[] {
  const families: FoundFamily[] = [];
  const representativeTokens: Token[][] = [];

  for (const candidate of [...candidates].sort(compareCandidates)) {
    const tokens = foundCandidateTokens(candidate);
    let home = -1;
    for (let i = 0; i < families.length; i++) {
      const shorter = Math.min(tokens.length, representativeTokens[i].length);
      if (sharedWordCount(representativeTokens[i], tokens) > minOverlap * shorter) {
        home = i;
        break;
      }
    }

    if (home === -1) {
      families.push({
        id: `${candidate.passageId}-family-${String(candidate.startPosition).padStart(4, '0')}`,
        representative: candidate,
        members: [candidate],
        startPosition: candidate.startPosition,
        endPosition: candidate.endPosition,
      });
      representativeTokens.push(tokens);
    } else {
      const family = families[home];
      family.members.push(candidate);
      family.endPosition = Math.max(family.endPosition, candidate.endPosition);
    }
  }
  return families;
}
