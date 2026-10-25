import type { Token } from '@/lib/models';
import type { SyllableResult } from '@/lib/syllables';
import { uncertaintyNotes } from '@/lib/search/uncertainty';

/**
 * What the reader should know about the words in a poem whose syllable count is not certain, one
 * sentence per word. Renders nothing for a poem without any.
 */
export function UncertaintyNotes({
  lines,
  className = '',
}: {
  lines: { tokens: Token[]; syllableResults: SyllableResult[] }[];
  className?: string;
}) {
  const notes = uncertaintyNotes(lines);
  if (notes.length === 0) return null;
  return (
    <ul className={`list-none space-y-1 text-[13px] leading-snug text-[#57544E] ${className}`}>
      {notes.map(note => (
        <li key={note.text}>{note.text}</li>
      ))}
    </ul>
  );
}
