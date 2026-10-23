# PALIMPSEST
## Product Specification & Implementation Plan

## 1. Product vision

Palimpsest is an interactive found-poetry workshop where users discover hidden poems inside existing literary texts by erasing words.

The experience should feel like working with a physical book: warm paper, literary typography, carefully rendered text, and expressive erasure effects. Users transform source pages into personal pieces of art.

**Core experience:** Open a book, select words to preserve, discover unexpected poetry, refine it, save it, and export the result.

## 2. Core modes

### Manual Erasure

Users select words on a realistic book page. Unselected words are visually erased using styles such as:
- Blackout bars
- Faded ink
- Whiteout
- Watercolor or ink wash

Retained words remain in their original positions. Users can undo, redo, reset, save drafts, and export their work.

### Found Poetry

Found mode discovers 5–7–5 syllable sequences made from **contiguous source text**. It cannot skip intervening words.

The search can start at different positions in a passage and may cross suitable clause boundaries. It should not require candidates to be complete sentences.

### Assisted Erasure

Assisted mode discovers 5–7–5 poems by selecting words in their original order while skipping other words.

This represents genuine erasure: the user removes intervening text to create a new interpretation. The system ranks candidates, but the user decides which poems are worth keeping.

Use labels such as “5–7–5 poem” or “haiku-inspired poem.” Do not automatically classify every 5–7–5 result as a traditional haiku.

## 3. Scope

### MVP
- Curated library of 5–8 verified public-domain works or excerpts.
- Realistic, interactive book-page editor.
- Manual word selection and three initial erasure styles.
- Undo, redo, reset, local saving, and PNG export.
- Separate Found and Assisted modes.
- English-language syllable counting and 5–7–5 discovery.
- Candidate filtering, ranking, and diversity controls.
- In-place page view and extracted poem view.
- Local collections and drafts.
- Responsive layout and accessible controls.
- Automated tests for core algorithms and editing behavior.
- Architecture that supports replacing local storage with a backend later.

### Not in the MVP
- User accounts or authentication.
- Cloud synchronization.
- Public galleries, comments, and social features.
- AI-generated poetry.
- User-uploaded books or PDF parsing.
- Whole-book exhaustive searches.
- Additional poetic forms beyond 5–7–5.
- Video, GIF, or full chapbook generation.

## 4. User interface

### Home
A literary landing page introducing the concept, with entry points into the library and a featured poem.

### Library
A curated selection of literary works and excerpts, with title, author, description, and source attribution.

Start with passages of approximately **150–300 words**. Choose passages for literary interest and useful search results, not just length.

### Reader / Studio
The primary workspace contains:
- A realistic book page.
- Word selection and erasure controls.
- Erasure style selector.
- Undo, redo, reset, save, and export.
- An extracted poem panel.
- Controls to switch between in-place and extracted views.

The original page layout must remain meaningful. Do not replace the page with a textarea or a static screenshot.

Retained words remain in their source positions. The extracted view displays retained words as a clean poem, with user-editable line breaks. Line breaks must not change the order of the original words.

### Discover
Shows Found mode results with source context and a way to open a candidate in the editor.

### Assisted Erasure
Allows users to search for candidate 5–7–5 poems, inspect their source positions, compare results, and open a candidate in the editor.

### My Collection
Displays locally saved poems and drafts. It should use the same data-access interface that a future cloud-backed collection would use.

### About
Explains the concept, source texts, attribution, and how the poetry tools work.

## 5. Architecture and future backend support

The MVP runs entirely in the browser. No server, database, authentication provider, or paid API is required.

However, the code must be structured so a backend can be added later without redesigning the editor or rewriting the poetry algorithms.

### Required architecture

Use three logical layers:

**UI layer**
- Pages, editor, book rendering, toolbars, candidate lists, and collection views.
- Displays application state and sends user actions to services.
- Does not directly access localStorage, network APIs, or database clients.

**Service layer**
- Coordinates loading books, saving poems, managing collections, and retrieving search results.
- Provides stable operations to the UI regardless of where data is stored.
- Handles asynchronous operations, loading states, and errors.

**Data-access layer**
- Defines interfaces for loading and saving application data.
- Initially uses bundled text assets and localStorage.
- Can later use an API and database without changing UI components.

### Repository interfaces

Define TypeScript interfaces such as:

- `BookRepository`: retrieves books and passages.
- `PoemRepository`: saves, retrieves, updates, and lists poems and drafts.
- `CollectionRepository`: manages collections when needed.

Implement browser-backed repositories for the MVP. Services should depend on the interfaces rather than concrete storage implementations.

Design service methods to return promises, even when their initial local implementation can finish immediately. This prepares the application for network latency and remote failures.

Do not add a fake backend or create unnecessary abstraction layers. The interfaces should be small, practical, and easy to test.

### Data models

Define explicit TypeScript models for:
- `Book`
- `Passage`
- `Token`
- `Poem`
- `PoemLine`
- `Collection`

A poem should include:
- A stable poem ID.
- Source passage ID.
- Retained token IDs in source order.
- User-defined line breaks.
- Erasure style.
- Creation and modification timestamps.
- Optional title and notes.

Do not store the entire rendered page as the only representation of a poem. The underlying selection and metadata must remain available so the poem can be reopened and edited.

Use stable token IDs rather than visual positions, character offsets alone, or DOM element indices. Keep the source text immutable.

### Future backend migration

When a backend is introduced:
- Replace or supplement the browser-backed repositories with API-backed implementations.
- Keep the existing UI and poetry algorithms unchanged where possible.
- Add authentication, ownership, and permissions only when accounts are introduced.
- Add synchronization and conflict handling if users can edit the same poem across devices.
- Define a migration path for existing local drafts if cloud accounts are introduced.

The MVP does not need to solve synchronization, authentication, or multi-device conflicts. It must simply avoid coupling the UI to local storage.

## 6. Source text and tokenization

Use verified public-domain texts from a reliable source such as Project Gutenberg. Download the source files, verify provenance and applicable terms, remove book boilerplate, and curate the excerpts manually.

Do not reconstruct passages from memory or fabricate source text.

Every passage must preserve its source text and attribution. Tokens must have stable IDs and source positions so poems can be reconstructed accurately.

| Case | Behavior |
|---|---|
| Ordinary words | Individual selectable tokens |
| Attached punctuation | Preserved with its word by default |
| Hyphenated words | One token initially; document and test syllable behavior |
| Em dashes | Separators, not words; preserve in source layout |
| Numbers | Mark as uncertain unless explicitly supported |
| Unknown or archaic words | Mark unknown; do not invent a definitive count |
| Apostrophes and contractions | Preserve spelling and use dictionary support where available |
| Whitespace and paragraph breaks | Preserve in the source layout |

Punctuation must not be independently selectable in the MVP. Selecting or erasing a word must not silently rewrite the original source.

## 7. Syllable counting

Use the CMU Pronouncing Dictionary or another appropriately licensed pronunciation dataset. Verify the license before distributing the application.

Implement syllable counting as a separate, testable module.

Rules:
- Use dictionary pronunciations where available.
- If all pronunciations agree on syllable count, use that count.
- If pronunciations disagree, mark the count as ambiguous.
- If a word is missing, mark it as unknown.
- Allow users to review and correct uncertain counts where appropriate.
- Distinguish definite matches from candidates that rely on uncertain counts.

A dictionary entry does not guarantee the pronunciation is correct in context. Do not imply certainty when it is not warranted.

Preprocess or lazy-load dictionary data according to measured bundle size and performance. Avoid shipping unnecessary data to the client.

## 8. Found Poetry algorithm

Found mode searches for contiguous source-text sequences matching 5–7–5 syllables.

Requirements:
1. Search from multiple starting positions throughout each passage.
2. Never skip words within a candidate.
3. Respect reasonable sentence and clause boundaries.
4. Permit arbitrary start positions within sentences.
5. Handle uncertain syllable counts explicitly.
6. Deduplicate identical candidates.
7. Avoid flooding results with nearly identical overlapping sequences.
8. Preserve token IDs and source context.

Do not limit the search to complete sentences. Real passages may rarely contain sentence boundaries that align with 5–7–5 patterns.

### Page DNA

For the MVP, define Page DNA as the number of distinct contiguous 5–7–5 candidates discovered per 100 words, under the documented search rules.

This metric represents candidate density, not poetic quality. Do not calculate it from the number of results displayed after a UI limit.

## 9. Assisted Erasure algorithm

Assisted mode searches for word sequences in original order, allowing intervening words to be skipped.

A naïve search may generate enormous numbers of candidates. Do not enumerate every possible combination and return the first N results.

Use bounded, staged search.

### Candidate generation
- Search for 5–7–5 sequences using pruning.
- Initially limit each line to a configurable span of approximately 15–25 source words.
- Bound the total search work and candidate count.
- Preserve source positions and syllable decisions.
- Do not fabricate results when limits are reached.
- Allow cancellation and keep the interface responsive.

### Filtering and ranking

Implement explicit, testable heuristics:
- Penalize weak function words at line endings, such as “the,” “of,” or “and.”
- Prefer a reasonable proportion of content words to function words.
- Prefer readable phrases and meaningful line endings.
- Penalize excessive gaps between retained words.
- Reward distinctive vocabulary and useful contrasts.
- Penalize reliance on uncertain syllable counts.
- Penalize candidates with nearly identical retained words.

These rules are heuristics, not absolute laws. A function word at the end of a line should not automatically invalidate a candidate.

Do not claim that a numerical score objectively measures literary quality.

### Diversity
- Group candidates by source region or another meaningful measure.
- Penalize overlap between selected results.
- Avoid presenting many nearly identical poems.
- Show a manageable set of ranked candidates.
- Allow users to request more when available.

Do not stop after finding the first N candidates in source order.

### Performance
Keep the search engine independent from React and the UI. Use a Web Worker for computationally intensive searches when appropriate.

Show progress, support cancellation, and handle empty results gracefully. Clearly distinguish a bounded search from an exhaustive one.

## 10. Editor, saving, and export

### Two synchronized views

**In-place page:** Retained words stay in their original positions; erased words receive the chosen visual treatment.

**Extracted poem:** Retained words appear as readable poetry with editable line breaks.

Both views must represent the same underlying selection and update together. Line breaks are user composition data; they do not alter source word order.

### Undo and redo
Track editor changes in a dedicated state/history mechanism. Do not rely on DOM mutations as the source of truth.

### Saving
Use localStorage through the repository layer for local drafts and collections.

Handle missing, invalid, or outdated saved data gracefully. Include a schema version for persisted poem data so future changes can be migrated.

Remember that localStorage is browser-specific and can be cleared. It does not provide cloud backup or cross-device synchronization.

### PNG export
Support export of:
1. The transformed book page.
2. The extracted poem.

Test export during the editor phase, including actual erasure styles and typography. Begin with three styles: blackout, faded ink, and whiteout. Add complex effects only after reliable export is established.

Do not claim export works until it has been tested in the target browser.

### Optional shareable URLs
If feasible, encode the passage ID, compatible data version, retained token IDs, line breaks, and relevant style settings in a URL hash.

Validate imported data and never trust arbitrary URL content. Shareable URLs are a convenience, not a substitute for saving.

## 11. Visual identity

The aesthetic is literary, tactile, archival, and restrained—not a generic productivity dashboard.

Suggested palette:
- Ink: `#24231F`
- Paper: `#F3EBDD`
- Aged paper: `#E4D8C2`
- Deep burgundy: `#6C3438`
- Muted olive: `#77795D`
- Archive gray: `#8B867C`

Verify contrast before using colors for small text. Darken olive and gray for text if necessary; use lighter versions for decorative elements.

Typography:
- Literata or a similar literary serif for source text and poems.
- DM Sans or a similar sans-serif for controls and interface labels.

Use subtle paper texture, carefully tuned spacing, realistic line wrapping, and restrained transitions. Visual effects must not compromise readability or selection.

Build the page using real text and interactive DOM elements. Do not use a static screenshot as the editor. Do not generate decorative AI images.

## 12. Technology

Recommended stack:
- React
- Next.js
- TypeScript
- Tailwind CSS
- Lucide icons
- LocalStorage through repository implementations
- DOM-to-image or an equivalent tested export solution
- CMU Pronouncing Dictionary or a verified alternative
- Vitest
- Playwright
- Web Worker for intensive searches when warranted

Keep modules independent:
- Source text and tokenization
- Pronunciation and syllable counting
- Found search
- Assisted search
- Ranking and diversity
- Editor state and history
- Repository interfaces and implementations
- Services
- Export
- Local persistence

Avoid a backend, paid APIs, or external accounts unless a clear requirement justifies them.

## 13. Testing

Create golden fixtures containing:
- A source passage with exact expected tokens and positions.
- Known syllable counts, including ambiguous and unknown words.
- Expected Found candidates.
- Expected Assisted candidates with retained token IDs.
- Punctuation and line-break edge cases.
- Deduplication and diversity scenarios.
- Search limits and cancellation behavior.
- Repository behavior and invalid persisted data.

Test the poetry algorithms on at least three verified real passages before committing to the complete discovery experience.

Add integration tests proving that the editor works through repository interfaces rather than accessing localStorage directly. Add end-to-end tests for editing, saving, reopening, and exporting a poem.

Tests must verify meaningful expected behavior, not merely that functions execute without errors.

## 14. Implementation phases

### Phase 1 — Feasibility and visual prototype
- Acquire and verify source texts.
- Build a small tokenization and syllable-counting prototype.
- Run Found and Assisted searches on three passages.
- Inspect candidate quality, result yield, and runtime.
- Define initial ranking and diversity rules.
- Build the initial book-page visual prototype.
- Establish TypeScript models and the repository/service boundaries.

**Exit criteria:** Verified source data, tested search assumptions, a convincing page prototype, and a clear separation between UI and data access.

### Phase 2 — Functional Studio
- Implement stable token IDs and word selection.
- Add erasure styles, undo/redo, and reset.
- Build in-place and extracted poem views.
- Implement repository-backed local saving.
- Add PNG export and test it.
- Add basic persistence schema versioning.

**Exit criteria:** Users can create, edit, save, reopen, and export poems reliably.

### Phase 3 — Found mode
- Implement contiguous 5–7–5 search.
- Add deduplication and source context.
- Build the Discover interface.
- Measure candidate yield across curated passages.
- Add Page DNA if useful.

**Exit criteria:** Found mode returns traceable candidates and handles empty results gracefully.

### Phase 4 — Assisted mode
- Implement bounded in-order subsequence search.
- Add ranking, filtering, and diversity selection.
- Handle ambiguous and unknown counts.
- Keep the UI responsive and add worker-based search where appropriate.

**Exit criteria:** Candidates are varied, traceable, and useful enough to refine in the editor.

### Phase 5 — Collection and polish
- Finish local collection and draft management.
- Improve responsive behavior and accessibility.
- Test export reliability and browser compatibility.
- Add shareable URLs if feasible.
- Review architecture for future backend migration.

**Exit criteria:** The app is stable as a standalone frontend and ready for deployment.

### Phase 6 — Optional backend and expansion
If the project grows beyond a local-first application, consider:
- Authentication and user accounts.
- API-backed repositories and database storage.
- Cloud collections and cross-device synchronization.
- Public galleries and community features.
- Tanka and additional poetic forms.
- Richer Page DNA visualizations.
- Daily source pages, replay animations, and chapbook exports.

Adding a backend should replace or extend data-access implementations, not require rewriting the editor or poetry algorithms.

## 15. Instructions for Antigravity

1. Inspect the repository before making changes.
2. Work on one implementation phase at a time.
3. Explain the proposed changes before implementing each phase.
4. Preserve source text, attribution, token order, and punctuation.
5. Never fabricate literary passages or search results.
6. Keep UI components independent of storage and network implementations.
7. Keep poetry algorithms independent of React.
8. Use explicit TypeScript models and stable identifiers.
9. Implement real interactions rather than static mockups.
10. Run relevant tests and report actual results.
11. Do not claim that features or tests work unless verified.
12. Do not introduce a backend, paid service, or authentication without approval.
13. Keep abstractions practical; do not build unnecessary infrastructure for hypothetical future requirements.

## Definition of success

Palimpsest succeeds when users can open a real literary passage, create a visually compelling erasure poem, discover unexpected candidates, refine their work, and export the result.

The application should be polished and fully usable without a backend, while keeping a clean path toward future accounts, cloud storage, and community features.