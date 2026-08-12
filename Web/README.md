# Dot to Dot — The Wall

A public wall of every drawing shared from the Dot to Dot lens for Snap
Spectacles. Reads straight from Supabase, no accounts, no names.

## Run it

```bash
cd dot-wall
npm install
cp .env.example .env.local     # then paste your anon key into .env.local
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Deploy it

```bash
npm i -g vercel
vercel
```

Accept the defaults. When it asks, add the two environment variables in the
Vercel dashboard (Settings → Environment Variables):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then `vercel --prod`.

## What it expects from Supabase

A table (default name `photos`) readable by `anon`, containing at least:

| what        | accepted column names                              |
| ----------- | -------------------------------------------------- |
| image URL   | `url`, `image_url`, `public_url`, `photo_url`       |
| timestamp   | `created_at`, `inserted_at`, `uploaded_at`          |

Rows with no usable URL are skipped rather than shown broken.

The storage bucket must be public, which it already is if the URLs returned
by the edge function open in a browser.

## Things you may want to edit

Both are at the top of `src/App.jsx`:

- `LENS_URL` — where the "Open the lens" button points
- `TABLE` — the Supabase table name
