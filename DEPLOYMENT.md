# Putting Palimpsest online

This is the guide for running Palimpsest with its poems on a server, so that people sign in and their
poems follow them. It uses **Supabase** (the database and the sign-in) and **Vercel** (the hosting), both on
their free plans. Why this stack, and how it works inside, is in [BACKEND.md](BACKEND.md).

Two things first:

- **You do the account steps; I cannot.** Making the Supabase and Vercel accounts, the projects, and
  handling the keys is yours. Keep the keys in the settings pages named below, never in a chat and never in a
  file you commit (`.env*` files are already ignored by git, except `.env.example`, which has no values).
- **Nothing here has been run against the real services.** Everything up to the edge of Supabase and Vercel is
  tested (see "What was tested" at the end). The steps below follow their documentation as it was read on
  2026-10-27, and the checklist in part 7 is how you find out whether the real thing agrees. If a screen in a
  dashboard looks different from what is described, trust the dashboard and tell me what you saw.

It takes about an hour the first time.

## Try it first, on your own computer

Before any account exists you can use the whole thing locally: double-click `dev-demo.bat` (or run
`npm run dev:demo`) and open http://localhost:3200. The "server" and its database are part of that one
process, signing in takes **any email address and the code `123456`**, and nothing is sent anywhere. It starts
empty and forgets everything when you stop it. It is the same app, API and database code as the online
version; what it cannot show you is the real Supabase email and the real hosting. The server refuses to run
in this mode in production.

## 0. What you will need

| Need | Notes |
|---|---|
| A Supabase account | Free. Sign up with GitHub or email at supabase.com. |
| A Vercel account | Free ("Hobby"). Hobby is for **non-commercial** use only. |
| The code somewhere Vercel can read it | Either a **private GitHub repository** (easiest), or Vercel's command-line tool. This folder has no remote yet, so you would create the repository and push it yourself. |
| An email service (custom SMTP), **to show the sign-in code in the email at all, and for anyone outside your Supabase organization** | See part 2. Or skip email codes and use Google sign-in only (part 2b). |

## 1. Make the database (Supabase)

1. In Supabase, **New project**. Choose a name, a strong database password (save it in a password manager;
   you will need it once, below), and the region **nearest to where most of your users are**. The region
   cannot be changed later, and Vercel's functions should be near it (part 4).
2. Open **SQL Editor**. Paste the whole of [`db/schema.sql`](db/schema.sql) and run it. Then paste the whole of
   [`db/supabase.sql`](db/supabase.sql) and run that. Both are safe to run again.
   - `schema.sql` makes the `poems` table.
   - `supabase.sql` deletes a user's poems when their account goes, and switches on **row level security with
     no rules**, so that the public key every browser gets can read and write nothing in the table. All access
     goes through this app's own API.
3. Check: **Table Editor** should show a `poems` table, marked as having row level security enabled.
4. Get the **connection string**: click **Connect** at the top of the project, choose **Transaction pooler**,
   copy the string, and put your database password where it says `[YOUR-PASSWORD]` (if the password has
   characters such as `@`, `/` or `#`, they must be percent-encoded: `@` is `%40`, `/` is `%2F`, `#` is `%23`).
   It looks like `postgresql://postgres.abcd:…@aws-0-….pooler.supabase.com:6543/postgres`. Add `?sslmode=require`
   on the end if it is not there. This is `DATABASE_URL`.
   - The transaction pooler (port 6543) is the right one for Vercel: its functions open many short connections.
     The app uses no prepared statements, which that mode does not allow.
5. Get the project's **URL** and keys: **Project Settings → API**.
   - **Project URL** (`https://abcdwxyz.supabase.co`): `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`. It is
     `https://` + the project's **Project ID** (also called the reference) + `.supabase.co`; the **Connect**
     button at the top of the project shows it too.
   - **Publishable key** (`sb_publishable_…`): `SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
     It is meant to be public. Find the keys under **Settings → API Keys**.
   - **Secret key** (`sb_secret_…`): `SUPABASE_SECRET_KEY`. **This one is a secret** that can do anything to the
     project. It is used only to delete an account, only on the server. Never put it in a `NEXT_PUBLIC_`
     setting, and never share it.
   - Older projects show an `anon` key and a `service_role` key instead (long strings starting `eyJ`). They are the
     same two things under their old names, and the old setting names (`SUPABASE_ANON_KEY`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) still work. Supabase has said it will retire them
     by the end of 2026.

## 2. Make the sign-in send a code (Supabase)

Palimpsest signs people in with a **6-digit code** typed into the page (a link would take them away from
the page and lose an unsaved poem). For that the email has to **show the code**. Whether it does depends on
the email template, and Supabase only lets you change a template once you have set up **custom SMTP** (its
dashboard says so: "Set up custom SMTP to edit their subject and body"). So there are three situations:

**First, look at what you have.** **Authentication → Email Templates** → open **Magic link** (it may be called
"Magic link or OTP") and **Confirm sign up**. If the body of either already contains `{{ .Token }}`, that email
shows the code as it is. If it only has a link (`{{ .ConfirmationURL }}`), it does not, and the typed-code
sign-in cannot work until you can edit it. (I could not confirm from Supabase's documentation which the
defaults are, so please look.)

Then choose:

- **A. The templates already show the code.** Nothing to do for the code itself. Still read the limits below:
  the built-in sender only emails people in your Supabase organization.
- **B. Set up custom SMTP** (needed to edit the templates, and needed for anyone outside your organization to
  receive any email at all). Part 2a below.
- **C. Do not use email codes for now, and let people sign in with Google only.** Google needs no email service
  at all. **This is the simplest start, and it is built in:** set `NEXT_PUBLIC_EMAIL_SIGN_IN` to `off` in Vercel
  (part 4) and the sign-in dialog shows Google's button alone, with no email form. **Skip part 2a** and do
  **part 2b, which is then required** (without a Google client id there is no way to sign in at all, and the
  dialog says so). You can set up custom SMTP later and delete the `off` setting to bring the email form back.
  Hiding the form does not switch off Supabase's email sign-in itself; it only stops the page from offering it.

**The limits of the built-in sender, whichever you choose.** It sends **only to addresses of people in your
Supabase organization** (the Team tab), about **2 emails an hour**, with no promise of delivery. Fine for you and
a teammate, not for anyone else.

### 2a. Custom SMTP, if you chose B

**Which service depends on one question: do you own a domain name** (like `mypoems.org`)?

**No domain: use a Gmail account** (the quickest way; Supabase has its own troubleshooting page for it). It is
fine for a project like this and not meant for large volumes: Google limits a personal account to about **500
emails a day** (figure from developer guides, not from Google), and may delay or refuse mail beyond that. Steps:

1. Make a **new Google account just for this** (for example `palimpsest.app@gmail.com`) rather than using your own.
   The "app password" in step 3 lets whoever holds it send mail as that account, so keep it separate.
2. In that account turn on **2-Step Verification** (myaccount.google.com → Security). App passwords need it.
3. Make an **app password**: myaccount.google.com → Security → 2-Step Verification → **App passwords** (or go to
   myaccount.google.com/apppasswords). Name it "Supabase". Google shows a 16-character password **once**: copy it
   without the spaces. **It is a secret: put it only in the Supabase page in step 4.**
4. Supabase → **Authentication → Emails → SMTP Settings** → turn on **custom SMTP** and fill in:
   - Sender email: the Gmail address. Sender name: `Palimpsest`.
   - Host: `smtp.gmail.com`. Port: `465` (or `587`). Per Supabase's page, the username and the sender email
     should both be the Google account's address.
   - Username: the Gmail address. Password: the 16-character app password.
   Save.
5. First emails may land in the recipient's **spam** folder; marking one "not spam" helps.

**You own a domain: use a transactional service with your domain** (better delivery, higher limits). Both of these
need you to add DNS records (SPF, DKIM, and DMARC at least `p=none`) at the place you bought the domain:
- **Resend**: a verified domain is required to send. SMTP: host `smtp.resend.com`, port `465`, username `resend`,
  password = a Resend API key. Free plan about 100 emails a day and 3,000 a month (third-party figures).
- **Brevo**: free plan about 300 emails a day; host `smtp-relay.brevo.com`, port `587`, username = your Brevo login
  email, password = an **SMTP key** you generate in Brevo (not your account password). Brevo says it **cannot
  authenticate a free-mail sender such as `@gmail.com`** and may replace the sender's domain when mailing Gmail or
  Yahoo users, so do not use a Gmail address as the sender there.
- Whichever you use, check its current terms and limits yourself: I could only confirm the numbers from summaries.

Then, in Supabase: **Authentication → Emails → SMTP Settings** with that service's host, port, username and
password, and a sender address on your domain. **The password or key is a secret: type it into that page only,
never into a chat.**

3. Now **Authentication → Email Templates** can be edited. Change **both** templates (a new address gets
   Confirm sign up, a returning one Magic link) to show the code, for example:

   - Subject: `Your Palimpsest sign-in code`
   - Body:

     ```html
     <h2>Your Palimpsest sign-in code</h2>
     <p>Type this code on the page to sign in:</p>
     <p style="font-size: 24px; letter-spacing: 4px;"><strong>{{ .Token }}</strong></p>
     <p>It works for one hour. If you did not ask for it, you can ignore this email.</p>
     ```

4. After saving the SMTP settings Supabase starts at **30 emails an hour**; you can raise it on the **Rate Limits**
   page. Supabase also advises setting up DKIM, SPF and DMARC with a domain you own, and CAPTCHA against bots.
5. **Authentication → Providers → Email**: keep it enabled. Codes are 6 digits and last one hour by default; the
   app accepts 6 to 10 digits, so changing the length is fine. Supabase lets a person ask for a new code once every
   60 seconds.

Google sign-in (next part) needs no email at all, so it also gets around these limits for everyone who uses it.

## 2b. Let people sign in with Google (no email service needed; required if you chose C)

A "Continue with Google" button appears above the email form when a Google client id is set (or alone, with
`NEXT_PUBLIC_EMAIL_SIGN_IN=off`). Google opens its own popup and hands the page a signed token, which Supabase
checks with Google; the page never leaves, so an unsaved poem stays. If the setting is not there, there is simply
no Google button, and with the email form on nothing else changes.
These steps follow Supabase's Google documentation as read on 2026-10-27; **I have not been able to try them
against real Google or Supabase**, so the checklist in part 7 is how you find out.

1. In **Google Cloud Console** (console.cloud.google.com), make a project (or pick one).
2. **APIs & Services → OAuth consent screen**: choose **External**, fill in the app name (people see it in the
   Google popup), your support email and developer email. The only things the app asks Google for are the
   basics (the person's name and email address); those need no review by Google.
   - While the screen's **publishing status is "Testing"**, only the **test users you list** (up to 100) can
     sign in. To let anyone in, **publish** it ("In production"). Google may ask for things such as a link to
     a privacy policy or the site's address; follow what the console says.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**:
   - **Authorized JavaScript origins**: your site's address, such as `https://YOUR-SITE.vercel.app` (no path, no
     trailing slash). Add `http://localhost:3000` too if you want to try it from `npm run dev` with a real
     Supabase project.
   - **Authorized redirect URIs**: Supabase's callback address, which the Google provider page in the
     Supabase dashboard shows for copying (like `https://YOUR-PROJECT.supabase.co/auth/v1/callback`). The
     button flow does not use it, but Supabase's setup asks for it.
   - Save, and copy the **Client ID** and the **Client secret**.
4. In **Supabase → Authentication → Providers → Google**: switch it on, put the **Client ID** in "Client IDs"
   and the **Client secret** in the secret field, and save.
5. In Vercel add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = the Client ID (it is public, like the other `NEXT_PUBLIC_`
   settings) and **redeploy** (it is read when the app is built).

Good to know:
- **Same address, two ways in:** if someone signed in with an email code and later uses Google with the same
  address, Supabase links them into **one account** (it does this for verified emails, per its documentation),
  so their poems are still there.
- The button's look and text are Google's, not ours. Browsers with strict privacy settings, or extensions
  that block Google's script, may stop it from loading: the dialog then says Google sign-in did not work, and
  the email code is still there.
- The popup can be closed by the person without choosing an account; nothing happens then.

## 3. Get the code to Vercel

Either:

- **GitHub:** create a *private* repository, push this project to it (your commits are already in `main`),
  then in Vercel **Add New → Project → Import** that repository. Vercel recognises Next.js by itself.
- **Command line:** in this folder run `npx vercel` and answer its questions (first time: log in, link or
  create the project). `npx vercel --prod` makes the production deployment.

Do not deploy yet if you can help it: set the settings first (part 4), or the first deployment will be built
without them.

## 4. Settings in Vercel

In the Vercel project: **Settings → Environment Variables**. Add each of these for **Production** (and
Preview too, if you will use previews). The names are in [`.env.example`](.env.example) with what each is for.

| Name | Value | Kind |
|---|---|---|
| `NEXT_PUBLIC_DATA_BACKEND` | `server` | public, read at **build** |
| `NEXT_PUBLIC_SUPABASE_URL` | the Project URL | public, read at **build** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key | public, read at **build** |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | the Google client id (part 2b; required if the email form is off) | public, read at **build** |
| `NEXT_PUBLIC_EMAIL_SIGN_IN` | `off` for Google-only sign-in (option C); leave it out to keep the email form | public, read at **build** |
| `DATABASE_URL` | the transaction pooler string from part 1 | secret |
| `SUPABASE_URL` | the Project URL | config |
| `SUPABASE_PUBLISHABLE_KEY` | the publishable key | config |
| `SUPABASE_SECRET_KEY` | the secret key | **secret** (choose the "Secret" kind so it cannot be read again) |

Never set `PALIMPSEST_TEST_AUTH` or `NEXT_PUBLIC_TEST_AUTH`. They are a made-up sign-in for development; the
server refuses to run with the first one in production, and a build with the second refuses to sign anyone in.

Optional: `DATABASE_POOL_MAX` (connections per instance, default 3) and `DATABASE_CA_CERT` (see
"Troubleshooting"). **Settings → Functions → Function Region**: new projects run in Washington, D.C. (`iad1`);
choose the region **closest to your Supabase project** (Hobby allows one region).

Two things that surprise people:

- **A change to a setting only reaches new deployments.** After changing any of them, redeploy.
- The three `NEXT_PUBLIC_` ones are put into the page **when it is built**. Changing them needs a new build,
  not just a restart.

Then deploy (Vercel does it on import, or `npx vercel --prod`).

## 5. First check: the health page

Open `https://YOUR-SITE/api/health`. It needs no sign-in and shows only what works and what is missing, by
name. You want:

```json
{ "ok": true, "settings": "ok", "database": "ok", "signIn": "ok", "accountDeletion": "ready" }
```

| It says | What to do |
|---|---|
| `settings`: `DATABASE_URL is not set.` (or another name) | Add that setting in Vercel and redeploy. |
| `settings`: `SUPABASE_URL is not a valid address.` | It must be `https://…supabase.co`, with nothing after it. |
| `database`: `could not be reached` | Check `DATABASE_URL`: the password (and its encoding), the `.pooler.supabase.com:6543` host, and `?sslmode=require`. See "Troubleshooting" if it is the certificate. The Vercel function log has the real reason. |
| `database`: `connected, but the poems table is missing` | Run `db/schema.sql` (part 1). |
| `signIn`: `Supabase answered 401 …` | `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is wrong. |
| `signIn`: `Supabase could not be reached` | `SUPABASE_URL` is wrong, or the project is **paused** (below). |
| `accountDeletion`: `not set up` | Add `SUPABASE_SECRET_KEY` and redeploy. |

The health page does not prove that the email code works or that the sign-in in the browser is configured;
those are in the checklist.

## 6. Things to know about the free plans

- **Supabase pauses a free project after about 7 days without activity.** Everything then fails (the health page
  says Supabase could not be reached). Restore it from the Supabase dashboard. Before a demonstration, open
  the site and sign in the day before.
- **Vercel Hobby is for non-commercial use**, one function region, and has usage limits.
- **Backups:** the free Supabase plan is not a backup service. Each person can use **Back up all poems** in
  My Collection to keep a file. Consider doing the same for the database from time to time.
- **Secrets:** if a key was ever shown anywhere it should not have been, make a new one (Supabase → Project
  Settings → API, and Database for the password), update Vercel, redeploy.
- **Rate limiting:** the app itself does not limit how fast one person can call the API. Vercel and Supabase
  have their own limits.

## 7. The checklist: run it once, on the live site

Use a browser you can sign in on, and an email address that can receive mail from Supabase (a member of your
Supabase organization, unless you set up SMTP). Tell me which lines fail and what you saw.

**The page and the settings**
- [ ] `/api/health` is all ok (part 5).
- [ ] Home, Discover, Assisted and the Studio open, and each shows **Sign in** at the top right.
- [ ] Without signing in, you can keep words in the Studio and see Discover and Assisted.

**Signing in by email** (skip this block if `NEXT_PUBLIC_EMAIL_SIGN_IN` is `off`; use an address you have never used with this project)
- [ ] Sign in → type the address → **Send code**. An email arrives and **shows a 6-digit code** (not a link).
- [ ] A wrong code says it is not right. The right code signs you in, and the button says **Account**.
- [ ] Reload the page: you are still signed in.
- [ ] **Account → Sign out**, then sign in again with the same address. A code arrives (this is the *returning
      address* template) and works.
- [ ] Ask for codes quickly, one after another: after a few tries it says to wait.

**Signing in with Google** (only if you did part 2b)
- [ ] The sign-in dialog shows Google's "Continue with Google" button above the email form, with "or" under it.
      With `NEXT_PUBLIC_EMAIL_SIGN_IN=off` it shows the button alone: no email field, no "or".
- [ ] Press it: Google's popup opens, you choose an account, the popup closes, and the page shows **Account**.
      The page did not reload or move.
- [ ] In the Studio with some words kept, press Save while signed out, then use Google: the save form opens and
      the words are still on the page.
- [ ] (Email on only.) Sign out, then sign in **by email code with the same address** as the Google account: you
      are in the same account, with the same poems. (If you are given a separate empty account instead, tell me.)
- [ ] Sign in with Google on a **different** Google account: an empty collection of its own.
- [ ] With the consent screen in "Testing", a Google account that is **not** a listed test user is refused by
      Google; once published, anyone can.
- [ ] Close the Google popup without choosing: nothing breaks (and, with email on, the email form still works).
- [ ] **Account → Delete my account…** for a Google-created account removes it in Supabase (Authentication →
      Users) as for any other.

**Saving and the collection**
- [ ] In the Studio keep some words, press **Save Draft** while signed out: it asks you to sign in, then opens
      the save form. The form says drafts are saved to your account. Save.
- [ ] **My Collection** lists it, with the book and the first lines.
- [ ] Open the poem from another browser or another device, signed in as the same address: it is there.
- [ ] Rename, copy and delete a poem. Open one: its notes and words are all there.
- [ ] In two tabs open the same poem, save in one, then save in the other: the second says the poem was
      changed somewhere else.
- [ ] **Back up all poems**, then sign in as a different address and **Restore from a backup**: the poems appear.
- [ ] Signed out, My Collection says "Sign in to see your collection".

**Bringing poems across** (needs a browser with poems saved in its own storage, as the browser-only version of the
app kept them; if you have none, skip)
- [ ] After signing in, a dialog offers to add them. **Add** them; they appear in My Collection. Doing it again
      from the Account dialog adds nothing twice.

**Deleting an account** (use a spare address)
- [ ] **Account → Delete my account…** asks first. After you confirm, you are signed out.
- [ ] In Supabase: **Authentication → Users** no longer lists the address, and the `poems` table has no rows for it.
- [ ] The same address can sign up again and starts empty.

**The database is private**
- [ ] With the project URL and the anon key, ask for the table directly. It must return nothing:
      `curl "https://YOUR-PROJECT.supabase.co/rest/v1/poems?select=id" -H "apikey: YOUR_PUBLISHABLE_KEY"`
      should answer `[]` or an error, never a poem. (This checks that row level security is on.)

**When things go wrong**
- [ ] On a preview deployment, set a wrong `DATABASE_URL` and redeploy: saving says the server could not be
      reached, and your poem stays on the page.

## 8. Troubleshooting

- **Google: "Error 400: origin_mismatch" (or "invalid_client") in Google's popup.** The site's address is not in
  the OAuth client's **Authorized JavaScript origins** (exact scheme, host and port, no trailing slash), or the
  Client ID in `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is not the one from that client. The `NEXT_PUBLIC_` setting needs a
  redeploy.
- **Google: "access blocked" or "this app is not verified".** The consent screen is in "Testing" and you are not
  a listed test user, or it needs publishing (part 2b, step 2).
- **Google: the button shows, you choose an account, then "Google sign-in did not work".** Supabase refused the
  token: check that the Client ID is in **Supabase → Authentication → Providers → Google → Client IDs** (the
  same one), and that the provider is switched on. The Supabase auth logs say why.
- **Google: no button at all.** `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is missing from the deployed build (redeploy
  after adding it), or Google's script is blocked.
- **"self signed certificate in certificate chain" (or similar) in the Vercel logs.** Supabase's certificate is
  signed by its own authority, which Node does not know. The app handles `?sslmode=require` by encrypting
  without checking the certificate (this is what most hosted setups do). To check it too, download the
  project's CA certificate (Supabase → Project Settings → Database → SSL Configuration) and put its text in
  `DATABASE_CA_CERT`.
- **"too many connections" or slow first requests.** Lower `DATABASE_POOL_MAX` to 1 or 2. Use the transaction
  pooler (port 6543), not the direct connection.
- **A code that works for a returning address is refused for a brand-new one** (or the other way round). The
  two use different email templates (part 2): check both show `{{ .Token }}`. If a new address's code is
  still refused, tell me: the app asks Supabase to check codes as the `email` type, which its documentation
  gives for both, and I would add a fallback.
- **Signed in on the site but every save says "You need to sign in".** The sign-in the browser has is not
  accepted by the server: check `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (server side) match the project the
  `NEXT_PUBLIC_` ones point to.
- **The settings look right but nothing changed.** They only apply to new deployments; redeploy.
- **Logs:** Vercel → the project → **Logs**. The server logs why a request failed (never to the browser).

## 9. What was tested, and what was not

Tested without the real services: the database code on real SQL in an in-process Postgres; the API
(sign-in checks, every refusal, limits, conflicts, deletion) on that database; the browser's side of the API
against the real API code; the whole app in a browser with the poems on a (stand-in) server and a made-up
sign-in (`npm run test:e2e:server`); the connection settings, including the SSL handling; and the health page,
over real HTTP.

**Not tested, and what to watch for:** the real Supabase email and code; Supabase's real error replies (mapped
from its documentation); the call that deletes a user at Supabase; the `pg` driver against a real Postgres and
Supabase's certificate; the per-user lock under real concurrency; the `supabase.sql` statements on Supabase;
Vercel's build and functions; a real network; Safari, phones and screen readers.
