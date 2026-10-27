-- The server's database for Palimpsest. Plain Postgres: it runs on Supabase, on any Postgres, and in
-- the in-process Postgres the tests use. Run it once on a new database (it is safe to run again).
--
-- A poem belongs to one user and is only ever read or written through that user's id (see
-- lib/server/PostgresPoemRepository.ts). The id is the poem's own id (a UUID for every poem the app
-- makes; a backup may carry others), unique per user, not across users.

create table if not exists poems (
  user_id            uuid        not null,
  id                 text        collate "C" not null,
  schema_version     integer     not null,
  revision           integer     not null check (revision >= 1),
  passage_id         text        not null,
  passage_version    text,
  title              text,
  notes              text,
  retained_token_ids jsonb       not null,
  line_breaks        jsonb       not null,
  erasure_style      text        not null check (erasure_style in ('blackout', 'faded', 'whiteout')),
  -- What a list shows, kept next to the poem so that listing never reads the words.
  word_count         integer     not null check (word_count >= 0),
  preview            jsonb       not null,
  -- The times exactly as the poem carries them (ISO 8601 text), and the moment as a number to order by.
  created_at         text        not null,
  updated_at         text        not null,
  updated_ms         bigint      not null,
  primary key (user_id, id)
);

-- A user's poems, the most recently changed first, then by id: the order of every list.
create index if not exists poems_by_user_recent on poems (user_id, updated_ms desc, id);

-- The texts a signed-in reader has added (a story, a letter, a poem of their own), kept in their account so that
-- they follow the reader to any browser. A text belongs to one user and is only ever read or written through that
-- user's id (see lib/server/PostgresTextRepository.ts). The id is made by the browser ("my-" and eight letters or
-- digits) because the ids of the excerpts, and so of poems made from them, are built on it; it is unique per user.
create table if not exists user_texts (
  user_id    uuid        not null,
  id         text        collate "C" not null,
  title      text        not null,
  author     text        not null,
  form       text        not null check (form in ('prose', 'verse')),
  text       text        not null,
  -- ISO 8601 text, as the browser keeps them, and the moment of the last change as a number to order by.
  created_at text        not null,
  updated_at text        not null,
  updated_ms bigint      not null,
  primary key (user_id, id)
);

-- How many requests of each kind a user has made in the current window (see lib/server/api/rateLimit.ts).
-- One row per kind of request and user. "subject" is the user's id; window_start is the start of the window
-- in milliseconds, hits the requests counted in it.
create table if not exists rate_limits (
  bucket       text   collate "C" not null,
  subject      text   collate "C" not null,
  window_start bigint not null,
  hits         integer not null check (hits >= 0),
  primary key (bucket, subject)
);

create index if not exists rate_limits_by_window on rate_limits (window_start);

-- The library of books to make poems from (see LIBRARY.md). Public texts, the same for everyone. A book
-- is cut into excerpts once, when it is imported, and an excerpt is never changed or re-cut afterwards:
-- a saved poem points at the words of an excerpt by their position, so changing one would break it.
create table if not exists books (
  id            text    collate "C" primary key,   -- "pg1342": Project Gutenberg's number
  gutenberg_id  integer not null unique,
  title         text    not null,
  author        text    not null,
  year          integer not null,                  -- when the book was first published
  language      text    not null default 'en',
  source        text    not null,
  url           text    not null,
  license_note  text    not null,
  passage_count integer not null check (passage_count >= 1),
  word_count    integer not null check (word_count >= 1),
  cutter_version integer not null                  -- which version of the cutting rules made its excerpts
);

-- Whether a book is prose or verse (poetry): added after the first books were imported, so it is added to a table
-- that already exists. A verse excerpt's text has its lines separated (see scripts/library/cut.mjs).
alter table books add column if not exists form text not null default 'prose' check (form in ('prose', 'verse'));

create table if not exists passages (
  id          text    collate "C" primary key,     -- "pg1342-0042"
  book_id     text    collate "C" not null references books (id) on delete cascade,
  ordinal     integer not null check (ordinal >= 1),
  title       text    not null,
  description text    not null,                    -- the first words, for a list
  source_text text    not null,
  word_count  integer not null check (word_count >= 1),
  unique (book_id, ordinal)
);
