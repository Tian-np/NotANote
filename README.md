# NotANote(https://tian-np.github.io/NotANote)

A small, **private** notes app you can host on **GitHub Pages** or **Vercel**. Notes are **encrypted in the browser** with Web Crypto (PBKDF2 + AES-GCM).

**Two modes**

- **Cloud (recommended for multiple devices)** — if you set Supabase environment variables, the app shows **email + password** sign-in and stores only the **encrypted vault blob** in your Supabase project (Auth + Postgres). Plain notes never hit the server in readable form.
- **Local-only** — if Supabase env vars are missing, the app keeps the previous behaviour: encrypted vault in **browser `localStorage` only** (no account).

## Features

- **Notes** — free-form text with titles.
- **Logins** — store **website URL**, **login ID**, and **password** with one-click copy.
- **Password visibility toggle** on password fields.
- **Account (cloud)** — register / log in / log out; same password is used to **encrypt the vault** and sign in.
- **Master password (local mode)** — create, unlock, change password (re-encrypts the vault).
- **Encrypted backup** — export/import JSON.
- **Modern UI** — dark theme, responsive layout.

## Supabase (multi-device + login)

1. Create a free project at [supabase.com](https://supabase.com).
2. **Project Settings → API**: copy **Project URL** and **anon public** key.
3. In the repo root, copy `.env.example` to `.env.local` and set:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

4. **SQL Editor**: run the script in `supabase/schema.sql` once (creates `user_vaults` + RLS policies).
5. **Authentication → Providers**: ensure **Email** is enabled. For quick testing you can turn off “Confirm email” under Auth settings; for production, keep confirmations on (users confirm email, then sign in — the app creates their vault on first successful login if needed).

Rebuild or restart `npm run dev` after changing env vars.

**Deploying with cloud mode:** add the same `VITE_SUPABASE_*` variables in **Vercel → Environment Variables**, or in **GitHub Actions** secrets and pass them into the build step so they are present when `npm run build` runs.

## Local development

Stack: **React**, **Vite**, **Tailwind CSS**, **shadcn/ui** (Radix primitives).

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Build

```bash
npm run build
```

Static files are written to `dist/`.

### Base path (GitHub Pages)

Project Pages URLs look like `https://<user>.github.io/<repo>/`. For repo `NotANote`, set the base path when building:

```bash
# Windows PowerShell
$env:VITE_BASE="/NotANote/"; npm run build

# macOS / Linux
VITE_BASE=/NotANote/ npm run build
```

The included GitHub Action sets `VITE_BASE=/NotANote/` automatically. If you rename the repo, change that value in `.github/workflows/pages.yml` and in your build command.

## Deploy — GitHub Pages

1. Push this project to your GitHub repo (for example `Tian-np/NotANote`).
2. Repo **Settings → Pages → Build and deployment**: set **Source** to **GitHub Actions** (not Deploy from a branch).
3. Push to `main` or `master`. The workflow **Deploy GitHub Pages** builds with the correct base path and publishes `dist/`.
4. After the first run, your site will be at `https://tian-np.github.io/NotANote/` (adjust user and repo to match yours).

### If deploy fails with `HttpError: Not Found` / `Creating Pages deployment failed`

That almost always means **GitHub Pages is not turned on for this repo**, or the source is not **GitHub Actions**.

1. Open **Settings → [Pages](https://github.com/Tian-np/NotANote/settings/pages)** for the repo.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (not “Deploy from a branch”). Save if the UI asks you to.
3. Re-run the failed workflow: **Actions → Deploy GitHub Pages → Re-run all jobs** (or push an empty commit).

Until Source is **GitHub Actions**, the **deploy** job cannot create a Pages deployment and `actions/deploy-pages` returns **404**.

## Deploy — Vercel

1. Import the GitHub repository in [Vercel](https://vercel.com).
2. Framework preset: **Vite**. Build: `npm run build`, output: `dist`.
3. Do **not** set `VITE_BASE` on Vercel (leave default `/` for the root domain).

## Security notes

- **Cloud mode:** anyone with your **account password** can decrypt the vault. Use a strong password and **export backups** regularly. The Supabase **anon** key is public in the frontend; security relies on **RLS** (users can only read/write their own row) and **encryption** (server stores ciphertext only).
- **Local mode:** anyone with your **master password** can read the vault. **Import backup** expects the **same password** used when the file was exported.
- Clearing site data or private browsing without a backup can **lose** local vault data; use cloud mode and/or encrypted exports for durability.

## License

MIT
