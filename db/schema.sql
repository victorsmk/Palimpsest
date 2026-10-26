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
