# Dime! Portfolio Tracker

A website that turns your Dime! trade confirmation emails into a transaction
history and portfolio dashboard, without you having to set anything up.

**Live:** https://dime-portfolio-tracker.dreamnattapat.workers.dev

It's the web version of
[dime-auto-log-transactions](https://github.com/dreamnattapat/dime-auto-log-transactions):
same parsing and analytics, but nobody needs to clone a repo or install Python.

## Privacy model

**Everything runs in the user's browser.** The site is static files only:

```
User's browser                                 Site host (Cloudflare Workers)
├─ Sign in with Google (Google's own page)     └─ HTML/JS files only
├─ fetch Dime! emails directly from Gmail
├─ decrypt PDFs with the birthdate (pdf.js)
├─ parse + compute P&L
└─ store in IndexedDB on this device
```

- **Gmail password:** typed only on Google's sign-in page. The site never sees it.
- **Gmail access:** a read-only access token that lasts about 1 hour, kept in
  memory and only ever sent to Google. "Disconnect" revokes it.
- **Birthdate (PDF password):** kept in memory, never stored or sent anywhere.
  Reloading the page forgets it.
- **Transactions:** stored in this browser's IndexedDB. Gmail is the source of
  truth, so clearing it and re-syncing rebuilds everything.

Anyone can verify this in the browser's network tab: requests go only to
`googleapis.com` / `accounts.google.com` and to the site itself.

## Google Cloud setup (one-time)

You can reuse the Google Cloud project from `dime-auto-log-transactions`. The
Gmail API is already enabled there. No billing is needed.

1. Open [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients)
   and click **Create client**.
2. Application type: **Web application** (the old Desktop client won't work in
   a browser).
3. **Authorized JavaScript origins:** add `http://localhost:5173` and
   `https://dime-portfolio-tracker.dreamnattapat.workers.dev`. No redirect URIs
   are needed.
4. Copy the client ID into `.env.local`:
   ```bash
   cp .env.example .env.local
   # then edit VITE_GOOGLE_CLIENT_ID
   ```
   The client ID is public (it ships in the page). There's no client secret in
   this setup.
5. Under [Audience](https://console.cloud.google.com/auth/audience), click
   **Publish app** (status **In production**, unverified). Anyone with a Google
   account can then sign in, after Google's "unverified app" warning, which the
   site explains next to the sign-in button. Google caps unverified apps at
   **100 new users in total**.

   The alternative is to stay in **Testing** and add each user's Gmail address
   as a test user (up to 100).

Removing the warning and the cap needs Google's restricted-scope verification:
a domain you own, a homepage and privacy policy on it, a demo video, and a few
weeks of review. Because no Gmail data reaches a server, the app has a strong
case for exemption from the paid annual security assessment (CASA).

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest unit tests
npm run lint     # oxlint
npm run build    # type-check + production build into dist/
npm run deploy   # build + publish to Cloudflare (needs `npx wrangler login` once)
```

## Deployment

The site is static files served by Cloudflare Workers (`wrangler.jsonc`), with
security headers from `public/_headers`. Its Content-Security-Policy only lets
the page talk to itself and Google, so the browser blocks any attempt to send
user data elsewhere. Keep it that way when adding features.

**Every push to `main` deploys automatically** (Cloudflare Workers Builds,
connected to this GitHub repo). `npm run deploy` from a laptop also works, for
publishing without a push.

`VITE_GOOGLE_CLIENT_ID` is baked in at build time: from `.env.local` when
deploying from a laptop, or from the build variable of the same name (Worker →
Settings → Build → Variables and secrets) when Cloudflare builds from GitHub.

## Project structure

| Path | What it does | Python equivalent |
|---|---|---|
| `src/lib/google/auth.ts` | Google sign-in, Gmail access token | `gmail_client.get_gmail_service` |
| `src/lib/google/gmail.ts` | Find Dime! emails, download PDFs | `gmail_client.py` |
| `src/lib/pdf.ts` | Decrypt PDF, extract text lines (pdf.js) | `pdf_parser.extract_text` |
| `src/lib/dime/parser.ts` | Regexes → transaction fields | `pdf_parser.parse_fields` |
| `src/lib/db.ts` | Local database (IndexedDB via Dexie) | `.xlsx` + `processed_ids.json` |
| `src/lib/sync.ts` | Sync new emails into the database | `main.py` |
| `src/components/PdfInspector.tsx` | Show raw PDF text + parse result | `scripts/dump_pdf_text.py` |
| `src/components/ui/` | shadcn/ui components (generated; editable) | |

If Dime! changes its PDF layout, open the site, enter the birthdate, click
**Inspect latest PDF**, and adjust `src/lib/dime/parser.ts` to match the raw
text (add a test case in `parser.test.ts` while you're there).

## Roadmap

- [x] Sign in → fetch → parse → store
- [x] Parser handles the pdf.js layout (each order split over three lines)
- [ ] Port analytics: FIFO realized P&L, win rate, open positions
- [ ] Price proxy (Cloudflare Worker → Yahoo Finance; ticker symbols only)
- [ ] S&P 500 mirror portfolio, XIRR, chart (Lightweight Charts)
- [ ] Excel/CSV export
- [x] Deploy to Cloudflare Workers
