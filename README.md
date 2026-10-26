# Palimpsest

A found-poetry and erasure workshop. Read the specification in [specifications.md](specifications.md).

- Plans and ideas: [ROADMAP.md](ROADMAP.md). How the data layer and the backend work: [BACKEND.md](BACKEND.md).
- **Try the version with accounts on your own computer, with no account or key:** double-click `dev-demo.bat`
  (or run `npm run dev:demo`) and open http://localhost:3200. Poems are kept by a "server" that is part of that
  process; sign in with any email address and the code `123456`. It starts empty and forgets everything when
  stopped. `npm run dev` (or `dev.bat`) is still the normal version, with poems in your browser.
- Putting it online (Supabase and Vercel), with a checklist: [DEPLOYMENT.md](DEPLOYMENT.md).
- Tests: `npm test` (unit), `npm run test:e2e` (the browser suite on a production build, see [e2e/README.md](e2e/README.md)), `npm run test:e2e:server` (the server-backed version of the app).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
