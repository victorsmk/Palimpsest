import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Palimpsest keeps about you, who handles it, and how to have it deleted.',
};

const CONTACT_EMAIL = 'butnaru.victor05@gmail.com';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F3EBDD] text-[#24231F] py-12 px-6 sm:px-12">
      <header className="max-w-3xl mx-auto w-full flex items-center justify-between gap-4 border-b border-[#E4D8C2] pb-6">
        <Link href="/" className="text-2xl font-serif font-bold tracking-tight text-[#24231F]">
          PALIMPSEST
        </Link>
        <Link href="/" className="px-4 py-2 border border-[#24231F] text-[#24231F] rounded text-xs font-medium hover:bg-[#E4D8C2]/50 transition-colors">
          Back to the workshop
        </Link>
      </header>

      <main id="main" tabIndex={-1} className="max-w-3xl mx-auto w-full py-10 outline-none">
        <h1 className="text-3xl font-serif font-bold mb-2">Privacy</h1>
        <p className="text-xs text-[#605C53] mb-8">Last updated 26 October 2026</p>

        <div className="space-y-8 text-[#3D3A33] leading-relaxed">
          <p>
            Palimpsest is a small hobby project. This page says, in plain words, what it keeps about you, who helps it do
            that, and how to have it removed. You can read, try and use the Studio, Discover and Assisted pages without an
            account, and without anything being kept about you on our side.
          </p>

          <section aria-labelledby="keeps">
            <h2 id="keeps" className="text-xl font-serif font-bold mb-2 text-[#24231F]">
              What is kept when you sign in
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Your email address.</strong> If you sign in with Google, it is the address of your Google account,
                which Google gives to the site when you choose to continue. It is used to recognise you when you come back.
              </li>
              <li>
                <strong>Your poems.</strong> What you choose to save: the title, the words you kept, any notes, which text
                it came from, and when it was saved or changed. They are kept in your account so you can open them on
                another device.
              </li>
            </ul>
            <p className="mt-3">
              There is no password. Nothing else from your Google account is asked for or kept: not your contacts, files,
              or anything beyond signing you in.
            </p>
          </section>

          <section aria-labelledby="not">
            <h2 id="not" className="text-xl font-serif font-bold mb-2 text-[#24231F]">
              What is not done
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>No advertising, no tracking of you across other sites, and no analytics tools.</li>
              <li>Your email address and poems are not sold or shared for marketing.</li>
              <li>No cookies are set by Palimpsest itself.</li>
            </ul>
          </section>

          <section aria-labelledby="browser">
            <h2 id="browser" className="text-xl font-serif font-bold mb-2 text-[#24231F]">
              What stays in your browser
            </h2>
            <p>
              Your browser&apos;s own storage holds the sign-in, so that you stay signed in when you reload the page, and
              a small note of whether you chose to bring across poems saved on this device. Signing out removes the
              sign-in from your browser. Words you are working on in the Studio are not sent to us until you save them.
            </p>
          </section>

          <section aria-labelledby="who">
            <h2 id="who" className="text-xl font-serif font-bold mb-2 text-[#24231F]">
              Who else handles it
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Supabase</strong> keeps the accounts and the poems in its database, and does the sign-in checks.
                It keeps the records it needs to run sign-in.
              </li>
              <li>
                <strong>Vercel</strong> hosts the site. Like most hosts, it may keep ordinary server records of visits, such
                as the time, the page asked for, and the visitor&apos;s network address.
              </li>
              <li>
                <strong>Google</strong> is involved only if you choose &ldquo;Continue with Google&rdquo;. Its sign-in
                button loads from Google only when the sign-in window is opened, and Google&apos;s own privacy policy
                applies to what it does.
              </li>
            </ul>
            <p className="mt-3">Each of these has its own privacy policy, which applies to the part it handles.</p>
          </section>

          <section aria-labelledby="delete">
            <h2 id="delete" className="text-xl font-serif font-bold mb-2 text-[#24231F]">
              Deleting your data
            </h2>
            <p>
              When you are signed in, <strong>Account → Delete my account</strong> removes your poems and then your
              account. After it you are signed out, and the same address can start again with an empty collection. You can
              also delete single poems from My Collection. Copies already made, such as a poem you exported or shared
              yourself, are yours and are not touched.
            </p>
          </section>

          <section aria-labelledby="contact">
            <h2 id="contact" className="text-xl font-serif font-bold mb-2 text-[#24231F]">
              Questions
            </h2>
            <p>
              Write to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2 hover:text-[#6C3438]">
                {CONTACT_EMAIL}
              </a>{' '}
              with a question, or if the deletion button does not work for you. This page will be updated here if what is
              kept changes.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
