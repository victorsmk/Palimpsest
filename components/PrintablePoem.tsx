import type { PoemDocument } from '@/lib/export/text';

/**
 * The poem as it prints or saves to PDF: just the title, the lines and the source, on plain paper.
 * It is not on screen. The rest of the Studio is hidden when printing, so this is all the page holds.
 */
export function PrintablePoem({ title, lines, attribution }: PoemDocument) {
  return (
    <section data-print-poem className="hidden print:block text-black">
      <h1 className="font-literary text-2xl font-semibold text-center">{title.trim() || 'Untitled poem'}</h1>
      <div className="font-literary text-xl leading-loose text-center mt-10">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      <p className="font-literary text-xs text-center mt-12">
        Found in {attribution.title}, {attribution.author} ({attribution.year})
      </p>
    </section>
  );
}
