-- Extra steps for Supabase only (run after schema.sql, in the SQL editor of the project).
--
-- 1. A poem goes when its owner's account does.
-- 2. Row level security is switched on with no policies, so the public "anon" and "authenticated"
--    keys that Supabase hands to browsers can read and write NOTHING in this table. All access goes
--    through this app's own API, which connects with the database password and checks the signed-in
--    user itself (that connection is the owner of the table and is not held back by the rule).

alter table poems
  add constraint poems_user_fk foreign key (user_id) references auth.users (id) on delete cascade;

alter table poems enable row level security;
