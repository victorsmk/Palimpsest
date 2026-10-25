import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F3EBDD] text-[#24231F] flex flex-col justify-between py-12 px-6 sm:px-12">
      {/* Navigation */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between border-b border-[#E4D8C2] pb-6">
        <div>
          <span className="text-2xl font-serif font-bold tracking-tight text-[#24231F]">
            PALIMPSEST
          </span>
          <p className="text-xs text-[#57544E] tracking-wider uppercase mt-0.5">
            Found Poetry & Erasure Workshop
          </p>
        </div>
        <nav aria-label="Main" className="flex items-center gap-3">
          <Link
            href="/discover"
            className="px-4 py-2 border border-[#24231F] text-[#24231F] rounded text-xs font-medium hover:bg-[#E4D8C2]/50 transition-colors"
          >
            Discover poems
          </Link>
          <Link
            href="/assist"
            className="px-4 py-2 border border-[#24231F] text-[#24231F] rounded text-xs font-medium hover:bg-[#E4D8C2]/50 transition-colors"
          >
            Assisted poems
          </Link>
          <Link
            href="/studio"
            className="px-4 py-2 bg-[#24231F] text-[#F3EBDD] rounded text-xs font-medium hover:bg-[#3D3A33] transition-colors shadow-sm"
          >
            Open the Studio →
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main id="main" tabIndex={-1} className="max-w-3xl mx-auto w-full my-auto py-16 text-center flex flex-col items-center outline-none">
        <span className="text-xs uppercase tracking-widest text-[#6C3438] font-bold mb-4">
          Uncovering accidental verse
        </span>
        <h1 className="text-4xl sm:text-5xl font-serif font-bold text-[#24231F] leading-tight mb-6">
          Every page of literature hides a poem waiting to be revealed.
        </h1>
        <p className="text-lg text-[#57544E] font-literary leading-relaxed max-w-2xl mb-10">
          Palimpsest treats existing literary works as raw material. Erase surrounding text,
          preserve striking words in their spatial positions, and uncover genuine accidental poetry.
        </p>

        {/* Featured Accidental Haiku Card */}
        <div className="bg-[#FAF6EE] border border-[#E0D4BE] rounded-lg p-8 shadow-sm max-w-md w-full mb-10 text-left">
          <span className="text-[11px] uppercase tracking-widest text-[#5B5D45] font-semibold block mb-2">
            Discovered Found 5–7–5 Sequence · Thoreau&apos;s Walden
          </span>
          <div className="font-literary text-lg text-[#24231F] italic space-y-1 my-4">
            <p>&ldquo;to front only the</p>
            <p>essential facts of life, and</p>
            <p>see if I could not&rdquo;</p>
          </div>
          <span className="text-xs text-[#605C53] block border-t border-[#ECE3D0] pt-3">
            Henry David Thoreau, <em>Walden</em> (1854)
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/discover"
            className="inline-flex items-center justify-center px-6 py-3 bg-[#6C3438] hover:bg-[#57292D] text-[#F3EBDD] rounded-md font-medium text-sm transition-all shadow-md hover:shadow-lg"
          >
            Find the poems in a text
          </Link>
          <Link
            href="/assist"
            className="inline-flex items-center justify-center px-6 py-3 border border-[#24231F] text-[#24231F] hover:bg-[#E4D8C2]/50 rounded-md font-medium text-sm transition-colors"
          >
            Erase your way to a poem
          </Link>
          <Link
            href="/studio"
            className="inline-flex items-center justify-center px-6 py-3 border border-[#24231F] text-[#24231F] hover:bg-[#E4D8C2]/50 rounded-md font-medium text-sm transition-colors"
          >
            Open the Studio
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center text-xs text-[#605C53] border-t border-[#E4D8C2] pt-6">
        Local-first browser workshop powered by Project Gutenberg texts & CMU Pronouncing Dictionary.
      </footer>
    </div>
  );
}
