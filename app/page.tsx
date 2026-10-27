import Image from 'next/image';
import Link from 'next/link';
import { AccountControl } from '@/components/AccountControl';
import { CollectionLink } from '@/components/CollectionLink';
import { ErasureDemo } from '@/components/home/ErasureDemo';

const NAV_LINK =
  'rounded px-2 py-1 text-sm text-[#F3EBDD]/90 underline-offset-8 transition-colors hover:text-[#E8CF92] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8CF92]';
const GILT_BUTTON =
  'inline-flex items-center justify-center rounded-md bg-[#C29A45] px-6 py-3 text-sm font-semibold text-[#1B1712] shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#D4AD5A] hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F3EBDD]';
const GHOST_BUTTON =
  'inline-flex items-center justify-center rounded-md border border-[#E8CF92]/70 px-6 py-3 text-sm font-medium text-[#F3EBDD] transition-all hover:-translate-y-0.5 hover:bg-[#F3EBDD]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F3EBDD]';

const WAYS = [
  {
    numeral: 'I',
    title: 'Let the page show you',
    text: 'Choose a passage and the workshop reads it for you, pointing out the poems already hiding in it, each marked where it sits on the page.',
    href: '/discover',
    action: 'Start finding',
  },
  {
    numeral: 'II',
    title: 'One word at a time',
    text: 'Take a poem a step at a time, with the workshop offering words to keep while the rest of the page fades. You decide where it ends.',
    href: '/assist',
    action: 'Start erasing',
  },
  {
    numeral: 'III',
    title: 'A whole page, your way',
    text: 'A whole page of a real book, every word yours to keep or cover, in the style of ink you choose. Then print it or share it.',
    href: '/studio',
    action: 'Open the Studio',
  },
];

const CREDITS = [
  {
    what: 'The King’s Library, Buckingham House',
    who: 'J. P. Stephanoff and J. Bailey, from W. H. Pyne’s Royal Residences (1819)',
    href: 'https://commons.wikimedia.org/wiki/File:King%27s_Library,_Buckingham_House,_from_Pyne%27s_Royal_Residences,_1819_-_panteek_pyn69-361.jpg',
  },
  {
    what: 'The Raven',
    who: 'Gustave Doré (1884)',
    href: 'https://commons.wikimedia.org/wiki/File:Dore_raven_shadow2.jpg',
  },
  {
    what: 'Songs of Innocence, frontispiece',
    who: 'William Blake',
    href: 'https://commons.wikimedia.org/wiki/File:William_Blake_-_Songs_of_Innocence_and_of_Experience,_Plate_1,_Innocence_Frontispiece_(Bentley_2)_-_Google_Art_Project.jpg',
  },
  {
    what: 'A chained book, Cesena',
    who: 'from John Willis Clark, The Care of Books (1901)',
    href: 'https://commons.wikimedia.org/wiki/File:Milkau_B%C3%BCcherschrank_mit_angekettetem_Buch_aus_der_Bibliothek_von_Cesena_109-2.jpg',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* The reading room: an engraving of a library, darkened so the lettering can be read. */}
      <section className="relative isolate overflow-hidden bg-[#1B1712] text-[#F3EBDD]">
        <Image
          src="/images/library.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="hero-image -z-20 object-cover object-[50%_40%] sepia-[0.35]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_42%,rgba(27,23,18,0.42),rgba(27,23,18,0.78)_78%),linear-gradient(to_bottom,rgba(27,23,18,0.4),rgba(27,23,18,0.15)_45%,#1B1712_100%)]"
        />

        <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 pt-6 sm:px-10">
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link href="/discover" className={NAV_LINK}>
              Discover poems
            </Link>
            <Link href="/assist" className={NAV_LINK}>
              Assisted poems
            </Link>
            <Link href="/studio" className={NAV_LINK}>
              Studio
            </Link>
            <Link href="/texts" className={NAV_LINK}>
              Your texts
            </Link>
          </nav>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <CollectionLink />
            <AccountControl />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="outline-none">
          <div className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-44 pt-16 text-center sm:pb-52 sm:pt-24">
            <p className="hero-rise text-xs font-semibold uppercase tracking-[0.35em] text-[#E8CF92]" style={{ animationDelay: '0.1s' }}>
              A found-poetry &amp; erasure workshop
            </p>
            <p className="hero-title font-display mt-5 text-[3.4rem] font-bold leading-none sm:text-[6.5rem] lg:text-[8.5rem]">
              Palimpsest
            </p>
            <div aria-hidden="true" className="hero-rise my-8 flex items-center gap-4" style={{ animationDelay: '0.9s' }}>
              <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#C29A45] sm:w-28" />
              <span className="h-2.5 w-2.5 rotate-45 border border-[#C29A45]" />
              <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#C29A45] sm:w-28" />
            </div>
            <h1
              className="hero-rise font-display max-w-3xl text-2xl font-normal italic leading-snug text-[#F3EBDD] sm:text-4xl"
              style={{ animationDelay: '1.05s' }}
            >
              Every page of literature hides a poem waiting to be revealed.
            </h1>
            <p
              className="hero-rise font-literary mt-6 max-w-2xl text-base leading-relaxed text-[#F3EBDD]/80 sm:text-lg"
              style={{ animationDelay: '1.25s' }}
            >
              Palimpsest treats old books as raw material. Cover the words around the ones that strike you, keep
              them where they stand, and see the accidental poem that was there all along.
            </p>
            <div className="hero-rise mt-10 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: '1.45s' }}>
              <Link href="/discover" className={GILT_BUTTON}>
                Find the poems in a text
              </Link>
              <Link href="/assist" className={GHOST_BUTTON}>
                Erase your way to a poem
              </Link>
              <Link href="/studio" className={GHOST_BUTTON}>
                Open the Studio →
              </Link>
            </div>
          </div>
        </main>
      </section>

      {/* The demonstration, laid across the edge of the engraving like a page of a book. */}
      <section aria-label="An example" className="reveal relative z-10 mx-auto -mt-32 w-full max-w-3xl px-4 sm:-mt-40 sm:px-6">
        <div className="rounded-sm border border-[#C9B98F] bg-[#F1E7D0] p-1.5 shadow-[0_30px_60px_-20px_rgba(27,23,18,0.7)]">
          <div className="rounded-sm border border-[#C9B98F]/70 bg-[#F6EEDB] px-6 py-8 sm:px-12 sm:py-12">
            <p className="font-display mb-5 text-center text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#7A5C1A]">
              A poem found in a single sentence
            </p>
            <ErasureDemo />
          </div>
        </div>
      </section>

      {/* Three ways in */}
      <section aria-labelledby="ways" className="mx-auto w-full max-w-6xl px-6 pb-8 pt-24 sm:px-10">
        <h2 id="ways" className="reveal font-display text-center text-3xl font-bold text-[#24231F] sm:text-4xl">
          Three ways in
        </h2>
        <div className="mx-auto mb-12 mt-4 h-px w-24 bg-gradient-to-r from-transparent via-[#C29A45] to-transparent" aria-hidden="true" />
        <ul className="grid gap-6 md:grid-cols-3">
          {WAYS.map(way => (
            <li key={way.href} className="reveal">
              <Link
                href={way.href}
                className="lift group flex h-full flex-col rounded-md border border-[#D6C8A4] bg-[#FAF5E8]/90 p-7 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6C3438]"
              >
                <span className="font-display text-5xl font-bold leading-none text-[#C29A45]" aria-hidden="true">
                  {way.numeral}
                </span>
                <span className="font-display mt-5 text-xl font-bold text-[#24231F]">{way.title}</span>
                <span className="font-literary mt-3 flex-1 text-[0.95rem] leading-relaxed text-[#57544E]">{way.text}</span>
                <span className="mt-6 text-sm font-semibold text-[#6C3438]">
                  {way.action}
                  <span aria-hidden="true" className="ml-1 inline-block transition-transform group-hover:translate-x-1.5">
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* From the archive: the old books themselves. */}
      <section aria-labelledby="archive" className="relative mt-20 overflow-hidden bg-[#1B1712] text-[#F3EBDD]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 sm:px-10 md:grid-cols-[1fr_1.1fr]">
          <div className="reveal grid grid-cols-2 items-end gap-4 sm:gap-6">
            <figure className="m-0 -rotate-2 border border-[#C29A45]/40 bg-[#F3EBDD] p-2 shadow-2xl transition-transform duration-500 hover:rotate-0">
              <Image src="/images/raven.jpg" alt="Gustave Doré’s engraving for The Raven: a figure on the floor, a raven on a bust above a door." width={900} height={1371} sizes="(min-width: 768px) 20vw, 45vw" className="h-auto w-full grayscale-[0.2] sepia-[0.25]" />
            </figure>
            <figure className="m-0 mb-10 rotate-2 overflow-hidden border border-[#C29A45]/40 bg-[#EBDDC0] p-2 shadow-2xl transition-transform duration-500 hover:rotate-0">
              <div className="relative aspect-[0.62] w-full overflow-hidden">
                <Image
                  src="/images/blake.jpg"
                  alt="William Blake’s frontispiece to Songs of Innocence: a piper looking up at a child who floats among the trees."
                  width={960}
                  height={1445}
                  sizes="(min-width: 768px) 20vw, 45vw"
                  className="absolute max-w-none"
                  style={{ width: '174%', left: '-37.4%', top: '-26.8%' }}
                />
              </div>
            </figure>
          </div>
          <div className="reveal">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#E8CF92]">From the archive</p>
            <h2 id="archive" className="font-display mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              Real books, borrowed from the public domain.
            </h2>
            <p className="font-literary mt-5 text-base leading-relaxed text-[#F3EBDD]/80">
              The texts come from Project Gutenberg, cut into short excerpts of about four hundred and fifty words.
              Search by title or author, choose an excerpt, and the page opens as it was printed. Poetry keeps its
              lines.
            </p>
            <figure className="m-0 mt-8 flex items-center gap-5">
              <Image src="/images/chained.jpg" alt="An engraving of a chained book on a lectern." width={453} height={587} sizes="96px" className="h-28 w-auto rounded-sm border border-[#C29A45]/40 sepia-[0.3]" />
              <figcaption className="font-display max-w-xs text-lg italic leading-snug text-[#E8CF92]">
                Once, books were chained to the desk. These ones you may mark up.
              </figcaption>
            </figure>
            <div className="mt-8">
              <Link href="/discover" className={GILT_BUTTON}>
                Choose a book to begin
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl border-t border-[#D6C8A4] px-6 py-8 text-xs text-[#57544E] sm:px-10">
        <p>Texts from Project Gutenberg; syllables and rhymes from the CMU Pronouncing Dictionary.</p>
        <details className="mt-3">
          <summary className="cursor-pointer underline underline-offset-2 hover:text-[#24231F]">Picture credits (all public domain)</summary>
          <ul className="mt-2 space-y-1">
            {CREDITS.map(credit => (
              <li key={credit.href}>
                <a href={credit.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[#24231F]">
                  {credit.what}
                </a>
                , {credit.who}. Via Wikimedia Commons.
              </li>
            ))}
          </ul>
        </details>
        <p className="mt-3">
          <Link href="/privacy" className="underline underline-offset-2 hover:text-[#24231F]">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}
