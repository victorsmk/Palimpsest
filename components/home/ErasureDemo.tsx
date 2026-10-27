'use client';

import { useEffect, useRef, useState } from 'react';

const PASSAGE =
  'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived.';
const POEM = 'to front only the essential facts of life, and see if I could not';

const WORDS = PASSAGE.split(' ');
const POEM_WORDS = POEM.split(' ');
const START = WORDS.findIndex((_, i) => POEM_WORDS.every((w, k) => WORDS[i + k] === w));
if (START < 0) throw new Error('The poem is not in the passage');

const kept = (index: number) => index >= START && index < START + POEM_WORDS.length;
const STEP_MS = 32;

/**
 * The idea of the whole site, shown once: a real sentence from Walden, and a poem found in it by covering
 * the other words. It plays by itself after the page has loaded, and again on request; for someone who asks
 * for less motion it starts from the end. The words on the page are aria-hidden: the sentence read aloud would
 * be noise, so what a screen reader gets is the poem and where it came from.
 */
export function ErasureDemo() {
  const [erased, setErased] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => setErased(true), reduced ? 0 : 1800);
    return () => clearTimeout(timer.current);
  }, []);

  const replay = () => {
    clearTimeout(timer.current);
    setErased(false);
    timer.current = setTimeout(() => setErased(true), 900);
  };

  return (
    <figure className="m-0">
      <p className="sr-only">
        A sentence from Walden, with every word covered except these, which make a poem: {POEM}.
      </p>
      <div
        aria-hidden="true"
        data-erased={erased}
        className="font-literary text-[1.2rem] leading-[2.1] text-[#2F2B24] sm:text-[1.4rem]"
      >
        {WORDS.map((word, i) => (
          <span key={i}>
            {i > 0 && ' '}
            <span
              className={`era-word ${kept(i) ? 'era-kept' : 'era-gone'}`}
              style={{ '--d': `${i * STEP_MS}ms` } as React.CSSProperties}
            >
              {word}
            </span>
          </span>
        ))}
      </div>
      <figcaption className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#C9B98F] pt-4 text-xs text-[#57544E]">
        <span>
          Henry David Thoreau, <em>Walden</em> (1854)
        </span>
        <button
          type="button"
          onClick={replay}
          className="rounded border border-[#7A5C1A] px-3 py-1.5 font-medium text-[#5E4512] transition-colors hover:bg-[#7A5C1A] hover:text-[#F3EBDD] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
        >
          Watch it again
        </button>
      </figcaption>
    </figure>
  );
}
