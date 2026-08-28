# DOT TO DOT — Spectacles

> A cozy connect-the-dots puzzle you play on a real sheet of paper with Snap Spectacles. Place a flat hand on the page, follow the numbers with a real pencil, and reveal a hidden shape. When you're done, photograph your drawing and pin it to a shared wall anyone can browse from a phone or laptop.

https://github.com/user-attachments/assets/55e66d1b-99f7-43d0-a197-85bee2b9c34b

---

## About

Dot to Dot is a relaxing connect-the-dots game played in augmented reality. The user puts a sheet of paper down, rests a flat hand on it, and the Lens projects a numbered dot puzzle onto the page. Following the numbers in order with a real pencil reveals the hidden illustration — and once it's finished, a bonus button shows a colored version of the same drawing for inspiration.

What makes this more than a single-session game is what happens **after** the drawing. The Lens photographs the finished sheet through the Spectacles camera, uploads it to Supabase, and the drawing appears on a public wall — a companion web app anyone can open, with no account and no name attached. Draw, share, come back later and see what other people made.

Placement relies on Snap's `SurfacePlacement` package, configured here in flat-palm mode so the user can hold a pencil in the other hand. Everything after detection is custom: the placed elements are reorganized into a shared parent container so one lies flat on the paper while another floats upright in front of the user, both anchored to the same world position. Picker, range filter, sliders, position handles, finish flow, fun mode, music toggle, home button, capture and share are all built from scratch as independent TypeScript controllers.

> **Note on detection:** the Lens does not scan or detect the paper itself. Calibration is triggered by **hand detection** alone, so the puzzle appears wherever the user places a flat hand — even on a bare table, you'll get a paper-shaped frame on the empty surface. The on-paper elements are pre-sized to match a real A4 sheet, which is why an actual sheet gives the most natural experience.

---

## Features

**Phase 1 — Start**

- Floating start board in front of the camera with on-screen instructions
- Flat-palm detection, chosen so the user can keep a pencil in the other hand
- Animated paper loader synchronized with the calibration progress
- Once detected, the placed elements stay coplanar with the paper — the puzzle on the page, the reference upright in front of the user

**Phase 2 — Play**

- Paginated picker of 16 dot puzzles, 6 per page, with next/previous navigation
- **Difficulty range filter** — a two-handle slider sets a min and max dot count (15 to 64) and the picker only shows puzzles in that range. The handles can never cross, and a live fill bar shows the selected span
- Live scale via a one-handed slider
- Live repositioning with two drag handles — one for the Y axis, one for X and Z together
- Background music with a dedicated on/off toggle
- Finish + bonus reveal — swaps the puzzle for a decorated version and shows a colored illustration
- Home button — full reset of every controller back to its initial state

**Phase 3 — Fun mode**

- After finishing a puzzle, a pair of eyes appears on the sheet and follows the user's hand
- The dominant hand's index tip drives the gaze across 8 directions plus a centered rest state, with a different eye set per puzzle
- Direction is smoothed, and hysteresis is applied on both the sector boundaries and the dead zone, so the eyes hold their look instead of flickering between two neighbouring directions

**Phase 4 — Capture and share**

- Countdown capture (3 — 2 — 1 — Go) that photographs the finished sheet through the Spectacles camera at native resolution
- A floating label follows the user's head during the countdown, so it stays readable while looking down at the paper
- The captured photo is shown in a frame, and a Share button uploads it to Supabase through an Edge Function
- Failure is never silent: if no image could be captured, the frame and the Share button both stay hidden, so a stale placeholder can never be uploaded
- Tapping Share again on the same photo doesn't create a duplicate

**The Wall (web companion)**

- Every shared drawing, pinned to a wooden board, 6 per page with the same prev/next pagination as the in-Lens picker
- Click any drawing to open it full size; arrow keys browse the whole wall
- Anonymous by design — no login, no username, no personal data. Just the drawing and the date
- Rows whose image is missing or unreadable are dropped from the wall rather than shown broken
- Responsive: 3×2 on desktop, sized to fit one screen without scrolling; 2×3 on mobile

---

## Quick Start

The project is a monorepo with three independent pieces:

```
DotToDot/
├── Lens/           Lens Studio project (the game)
├── EdgeFunction/   Supabase Edge Function (receives and stores photos)
├── Web/            React + Vite app (the public wall)
└── README.md
```

`Lens/` runs on its own — the game is fully playable without any backend. `EdgeFunction/` and `Web/` are only needed for the capture-and-share loop.

### 1. Clone the repository

```bash
git clone https://github.com/sitandoucara/DotToDot-Spectacles.git
cd DotToDot-Spectacles
```

### 2. Set up Supabase (free tier is plenty)

Create a project at [supabase.com](https://supabase.com).

**Create the storage bucket.** Go to **Storage → New bucket**, name it `photos`, toggle **Public**, create. Public means the URLs returned by the Edge Function can be opened directly by the web app without signing.

**Create the table.** Go to **SQL Editor → New query**, paste this and run it:

```sql
-- One row per shared drawing.
create table public.photos (
  id           uuid        primary key default gen_random_uuid(),
  url          text        not null,
  storage_path text,
  created_at   timestamptz not null default now()
);

alter table public.photos enable row level security;

-- The web app reads the wall with the anon key, so it needs this policy.
create policy "public read photos"
  on public.photos
  for select
  to anon
  using (true);
```

> **Do not add an INSERT policy.** The Edge Function writes with the service-role key, which bypasses RLS entirely — that's the whole point of routing uploads through a function. An INSERT policy for `anon` would let anyone write to the wall directly.

### 3. Deploy the Edge Function

```bash
cd EdgeFunction
npm i -g supabase          # once
supabase login             # once
supabase link --project-ref <your-project-ref>
supabase functions deploy upload-photo
```

`<your-project-ref>` is the subdomain of your project URL — `abcd1234` in `https://abcd1234.supabase.co`.

Keep the default JWT verification: the Lens sends the anon key as a Bearer token, which satisfies it.

Two values come out of this step, and you'll need both:

| Value        | Where to find it                                                   |
| ------------ | ------------------------------------------------------------------ |
| Function URL | `https://<your-project-ref>.supabase.co/functions/v1/upload-photo` |
| Anon key     | **Project Settings → API → Project API keys → `anon public`**      |

### 4. Set up the Lens

1. Open `Lens/Learn_draw_spec.esproj` in **Lens Studio 5.15.4** (or compatible).
2. In **Project Settings → Permissions**, enable **Experimental APIs** and camera access, and allow outbound requests to `*.supabase.co`. Without this, capture and upload both fail.
3. Select the object carrying the `SharePhoto` script and fill in:
   - `edgeFunctionUrl` — the function URL from step 3
   - `supabaseAnonKey` — the anon key from step 3
   - `internetModule` — drag an Internet Module asset here
   - `remoteMediaModule` — drag a Remote Media Module asset here
4. Preview, or publish to Lens Explorer for Spectacles.

> The game is fully playable without steps 2 and 3 — you just won't be able to share. Capture itself only works on the actual Spectacles: `requestImage()` does not exist in Lens Studio Preview.

### 5. Set up the Wall

```bash
cd Web
npm install
```

Create `Web/.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then:

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Two things you may want to edit at the top of `Web/src/App.jsx`: `LENS_URL` (where the "Try the lens" button points) and `LOGO_SRC`. Drop your own logo at `Web/public/logo.png` and a wood texture at `Web/public/wood.jpg` — the app falls back to a drawn wordmark and a CSS gradient if either is missing.

---

## How It Works

### Detection

When the Lens starts, a floating start board prompts the user to place a flat hand on their paper. Detection is handled by `SurfacePlacement` in `NEAR_SURFACE` mode with palm confirmation. Once the hand is detected and the gaze is on the page, the paper-loader animation runs. When calibration completes, the customization kicks in: the rotation returned by the package is flattened (`-Math.PI / 2` on X) and propagated through a global, so every phase 2 element ends up coplanar with the surface.

### The picker and the range filter

`RangeSlider` owns two handles on a single X axis. Each handle's local X maps to a dot count between 15 and 64, and a clamp in `onTranslationUpdate` keeps a minimum gap between them so they can never cross or visually touch. The fill bar between them is driven from its center pivot: its X position is the midpoint of the two handles, its X scale is the current gap divided by the total width — which means it works no matter which handle moved. Whenever either value changes, `RangeSlider` calls `applyFilter` on `DotPickerController`, which re-filters the 16 puzzles and repaginates.

### Capture

This was the hardest part of the project, and the fix isn't obvious.

A texture returned by `requestCamera()` is demand-driven: if nothing consumes it, the pipeline may never actually stream, and the texture stays empty. `requestCamera()` returning successfully only proves the camera was reserved — not that it's producing frames. With the pipeline asleep, the native still-capture task never completes, and a retry fired into that same unfinished task slot returns the same error rather than a fresh attempt.

So `TakePhoto` registers a permanent `onNewFrame` listener to keep the camera pipeline live, and never calls `requestImage()` until a fresh frame has actually arrived. Only one still capture is in flight at a time, and between retries it waits for both a delay and a new frame. If the still capture is unavailable anyway, it falls back to freezing the live camera texture — encoding it to JPEG, which captures that instant, then decoding it back into a new static texture. Assigning the live texture directly would show video, not a photo.

### Share

The Lens never talks to Storage directly. It reads the texture already on the photo frame, encodes it as JPEG base64, and POSTs it to the Edge Function, which decodes it, uploads it to the bucket with the service-role key, inserts a row, and returns the public URL.

The contract between the two sides is deliberately minimal, which is why the Lens script could be rewritten several times without ever touching the backend:

```
POST  →  { "image_base64": "<raw base64 JPEG, no data: prefix>",
           "content_type": "image/jpeg" }

200   ←  { "url": "https://<project>.supabase.co/storage/v1/object/public/photos/<uuid>.jpg" }
```

The Lens reads exactly `json.url` and ignores everything else in the body, so the function is free to return extra fields. Any non-200 is treated as a failure and its body is logged.

An `applyDownloadedTexture` toggle on `SharePhoto` closes the loop for demos: after a successful upload it re-downloads the file from Supabase and displays that, so what's on screen is provably the stored file rather than the local camera texture. Leave it off for normal use.

### The wall

The web app is a React + Vite SPA that reads the `photos` table with the anon key and renders the rows as sheets taped to a wooden board, 6 per page. There is no pairing, no code, no account — the wall is the same for everyone. Rows without a usable `http(s)` URL are filtered out before render, and any image that fails to load is dropped from both the page and the count, so a deleted file never leaves a broken frame behind.

---

## Scripts

Game logic lives in `Lens/Assets/All_assets/Scripts/`. The placement entry point lives inside the `SurfacePlacement.lspkg` package as `GlobalUI.ts` — renamed from the `Example.ts` shipped with the package, and modified to hook into this project's start board, paper loader and game container.

| Script                   | Role                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GlobalUI.ts`            | Entry point (inside `SurfacePlacement.lspkg`). Hides phase 2 UI, starts `SurfacePlacementController`, places the game and transmitter containers on detection.                     |
| `DotPickerController.ts` | Paginated 6-per-page grid over 16 puzzles. Handles filtering, selection, labels, and texture swaps for `on_paper` and `show_dot`.                                                  |
| `RangeSlider.ts`         | Two-handle min/max slider (15–64 dots) with a non-crossing clamp and a center-pivot fill bar. Drives the picker's filter.                                                          |
| `ScaleSlider.ts`         | One-axis interactable ball that drives `on_paper.localScale` between a min and max. Always re-centered on activation.                                                              |
| `Positionner.ts`         | Two drag handles that translate the targets in world space — one on Y, one on X and Z.                                                                                             |
| `FinishController.ts`    | Finish button (decorated texture + visibility groups) and the show/hide bonus toggle.                                                                                              |
| `WiggleEyes.ts`          | Eyes that follow the dominant hand's index tip across 8 directions plus center, with smoothing and hysteresis, and a distinct texture set per puzzle.                              |
| `TakePhoto.ts`           | Countdown, head-following label, camera pipeline keep-alive, validated still capture with retries, live-texture freeze fallback, and strictly separated success and failure paths. |
| `SharePhoto.ts`          | Reads the texture off the photo frame, encodes JPEG base64, POSTs to the Edge Function, guards against duplicate uploads, and optionally re-downloads the stored file as proof.    |
| `MusicToogle.ts`         | On/off toggle for the background music, with hover textures and mode-aware repositioning.                                                                                          |
| `HomeController.ts`      | Home button — orchestrates `reset()` on every other controller in sequence.                                                                                                        |

The rest of `SurfacePlacement.lspkg` is Snap's original release, with one modified script (`TableTop.ts`) that integrates the start board and paper loader hooks expected by `GlobalUI.ts`. Every other file inside the package is untouched.

The web app and the function are small and flat:

| File                                                    | Role                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `Web/src/App.jsx`                                       | Supabase fetch, pagination, lightbox, help modal, and the whole wall UI.            |
| `Web/src/styles.css`                                    | All styling, including the wooden board and the desktop one-screen layout.          |
| `EdgeFunction/supabase/functions/upload-photo/index.ts` | Decodes the base64, uploads to the bucket, inserts the row, returns the public URL. |

---

## Architecture

```
┌──────────────────────────────┐
│  Spectacles (Lens)           │
│  - Flat-palm placement       │
│  - Play, finish, fun mode    │
│  - Camera capture            │
└──────────────┬───────────────┘
               │  POST { image_base64, content_type }
               ▼
     ┌──────────────────────────────┐
     │  Supabase Edge Function      │
     │  upload-photo (Deno)         │
     │  - decode base64             │
     │  - upload (service role)     │
     │  - insert row                │
     └──────────────┬───────────────┘
                    │  { url }
                    ▼
     ┌──────────────────────────────┐
     │  Supabase                    │
     │  - storage bucket `photos`   │
     │  - table `photos`            │
     └──────────────┬───────────────┘
                    │  read with anon key (SELECT policy)
                    ▼
        ┌──────────────────────────┐
        │  The Wall (React + Vite) │
        │  - paginated board       │
        │  - anonymous, no login   │
        └──────────────────────────┘
```

The service-role key never leaves the server — it is auto-injected into the deployed Edge Function. The Lens only ever holds the anon key.

---

## Built With

| Tool                                                  | Purpose                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Lens Studio 5.15.4](https://ar.snap.com/lens-studio) | AR development environment for Spectacles                                                          |
| TypeScript                                            | All Lens controllers and the Edge Function                                                         |
| SpectaclesInteractionKit                              | Hand tracking, `Interactable`, `InteractableManipulation`                                          |
| SpectaclesUIKit                                       | UI primitives                                                                                      |
| SurfacePlacement                                      | Snap's surface detection package, configured in flat-palm mode with `TableTop.ts` lightly modified |
| CameraModule                                          | Still capture and the live camera stream used for the freeze fallback                              |
| [Supabase](https://supabase.com)                      | Storage, Postgres, Row Level Security, and the Edge Function runtime                               |
| React + Vite                                          | The web companion                                                                                  |

---

## Notes

A few things worth flagging so users and contributors aren't surprised:

- **Most puzzle artwork is placeholder.** Puzzles 2 and 4 ship with real illustrations so you can test the full loop end to end. The other 14 are placeholders labelled `dot N visual`. The demo video shows the official Dot to Dot puzzles, which aren't included here. Everything else — UI, controllers, materials, animations, frames, buttons, music — is in the repo. To use your own, drop illustrations into `img/dots/`, `img/show_dot/`, `img/paper_dot/` and `img/bonus/` and rewire them in the `DotPickerController` inputs.
- **Capture is device-only.** `requestImage()` does not exist in Lens Studio Preview. The countdown runs and then reports that no image was available — expected in the editor, not a bug.
- **The wall is public and anonymous.** Anyone running the Lens with your credentials can pin a photo, and anyone can see it. There is no moderation layer in this repo. If you deploy your own wall publicly, make that choice deliberately.
- **The anon key is meant to be public**, but with the SELECT policy above, anyone holding it can read the table. That's intended here — the wall is public — but keep it in mind if you adapt this to private data.

---

## Contributing

Dot to Dot is open source and contributions are welcome. The custom logic lives in `Lens/Assets/All_assets/Scripts/`, `Lens/Assets/SurfacePlacement.lspkg/GlobalUI.ts`, `Web/src/` and `EdgeFunction/supabase/functions/` — every other file is Lens Studio's auto-generated output, art assets, or Snap's official packages.

**Good first contributions:**

- **New puzzles** — drop textures into the four image folders and wire them in `DotPickerController`
- **A different paper format** (A5, letter) — the changes are localized to the `on_paper` mesh and the inspector positions
- **Moderation on the wall** — a reporting flow, or a review queue before a drawing goes public
- **Richer wall views** — filter by date, by puzzle, or a "drawing of the day"
- **A generative or animated finish step** instead of the static decorated texture

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Credits

Designed and developed by **Sitan Doucara** ([Si.Graph](https://github.com/sitandoucara)).

Built on top of Snap's [SurfacePlacement](https://ar.snap.com/lens-studio) package, configured for flat-palm detection and customized for paper-based gameplay. Cloud sharing built on [Supabase](https://supabase.com). Made for [Spectacles](https://ar.snap.com/spectacles).

---

Website link : https://dottodotwall.netlify.app/
