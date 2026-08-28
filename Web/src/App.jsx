import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------
   CONFIG
------------------------------------------------------------------ */

const LENS_URL =
  "https://www.spectacles.com/lens/2b433d83855e48ddb2d6b686bade9b02?type=SNAPCODE&metadata=01";

const LOGO_SRC = "/logo.png";

const TABLE = "photos";

// 6 par page — exactement comme le picker de dots dans le lens.
const PER_PAGE = 6;

/* ------------------------------------------------------------------
   SUPABASE
------------------------------------------------------------------ */

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

function readUrl(row) {
  const raw =
    row.url || row.image_url || row.public_url || row.photo_url || null;

  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();

  if (!/^https?:\/\//i.test(trimmed)) return null;

  return trimmed;
}

function readDate(row) {
  return row.created_at || row.inserted_at || row.uploaded_at || null;
}

/* ------------------------------------------------------------------
   IMAGE VALIDATION

   Important:
   on vérifie les images AVANT d'afficher le nombre total.

   Avant :
   - Supabase renvoyait 24 lignes
   - le mur affichait donc "24 drawings"
   - les images des pages suivantes étaient lazy-loaded
   - en cliquant sur Next, les images mortes déclenchaient onError
   - le compteur descendait progressivement jusqu'à 8

   Maintenant :
   - on récupère les lignes
   - on vérifie que chaque image charge réellement
   - seulement ensuite le mur passe à "ready"
------------------------------------------------------------------ */

function imageExists(url) {
  return new Promise((resolve) => {
    const img = new Image();

    let finished = false;

    const finish = (result) => {
      if (finished) return;
      finished = true;

      clearTimeout(timeout);

      img.onload = null;
      img.onerror = null;

      resolve(result);
    };

    img.onload = () => finish(true);
    img.onerror = () => finish(false);

    // Évite qu'une URL morte bloque le chargement du mur indéfiniment.
    const timeout = setTimeout(() => {
      finish(false);
    }, 10000);

    img.src = url;
  });
}

async function keepLoadablePhotos(rows) {
  const results = await Promise.all(
    rows.map(async (photo) => {
      const ok = await imageExists(photo.url);
      return ok ? photo : null;
    }),
  );

  return results.filter(Boolean);
}

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */

function seed(str) {
  let h = 0;
  const s = String(str);

  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }

  return Math.abs(h);
}

/** Tape sits a few pixels off-centre so the grid still feels handmade. */
function tapeFor(id) {
  const s = seed(id + "tape");

  return {
    shift: (s % 19) - 9,
    spin: ((s % 7) - 3) * 0.7,
  };
}

function formatDate(value) {
  if (!value) return "undated";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "undated";

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------
   APP
------------------------------------------------------------------ */

export default function App() {
  const [rows, setRows] = useState([]);

  const [status, setStatus] = useState("loading");
  // loading | ready | error

  const [errorMsg, setErrorMsg] = useState("");

  const [openIndex, setOpenIndex] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [page, setPage] = useState(0);

  /*
   * Sécurité supplémentaire :
   *
   * les URLs sont déjà validées lors du fetch initial.
   * Mais une image peut disparaître du storage ensuite,
   * donc on garde quand même la possibilité de la retirer.
   */
  const [broken, setBroken] = useState(() => new Set());

  const markBroken = useCallback((id) => {
    setBroken((prev) => {
      if (prev.has(id)) return prev;

      const next = new Set(prev);
      next.add(id);

      return next;
    });
  }, []);

  /* ----------------------------------------------------------------
     FETCH
  ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      setErrorMsg("");

      /*
       * À chaque chargement complet, on repart avec une liste
       * d'images cassées vide.
       */
      setBroken(new Set());

      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);

      if (cancelled) return;

      if (error) {
        setErrorMsg(error.message);
        setStatus("error");
        return;
      }

      /*
       * Première passe :
       * on retire les lignes qui n'ont même pas d'URL HTTP valide.
       */
      const candidates = (data || [])
        .map((row, i) => ({
          id: String(row.id ?? `row-${i}`),
          url: readUrl(row),
          date: readDate(row),
        }))
        .filter((photo) => photo.url !== null);

      /*
       * Deuxième passe :
       * on vérifie que le fichier derrière l'URL existe réellement.
       *
       * C'est cette étape qui corrige le compteur 24 -> 8 au fil
       * des pages.
       */
      const validPhotos = await keepLoadablePhotos(candidates);

      if (cancelled) return;

      setRows(validPhotos);

      /*
       * Une nouvelle liste doit toujours démarrer sur la première page.
       */
      setPage(0);
      setOpenIndex(null);

      setStatus("ready");
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ----------------------------------------------------------------
     PHOTOS
  ---------------------------------------------------------------- */

  const photos = useMemo(() => {
    return rows.filter((photo) => !broken.has(photo.id));
  }, [rows, broken]);

  /*
   * Maintenant ce count est correct dès le premier affichage :
   * rows contient uniquement les images réellement chargeables.
   */
  const count = photos.length;

  const pageCount = Math.max(1, Math.ceil(count / PER_PAGE));

  /*
   * Si une image devient inaccessible après le chargement,
   * le nombre de pages peut diminuer.
   */
  useEffect(() => {
    if (page > pageCount - 1) {
      setPage(Math.max(0, pageCount - 1));
    }
  }, [page, pageCount]);

  const pagePhotos = useMemo(() => {
    const start = page * PER_PAGE;
    const end = start + PER_PAGE;

    return photos.slice(start, end);
  }, [photos, page]);

  /*
   * Si l'image actuellement ouverte disparaît,
   * on ferme proprement la lightbox.
   */
  useEffect(() => {
    if (openIndex !== null && openIndex >= count) {
      setOpenIndex(null);
    }
  }, [count, openIndex]);

  /* ----------------------------------------------------------------
     PAGINATION
  ---------------------------------------------------------------- */

  const goPrev = useCallback(() => {
    setPage((current) => Math.max(0, current - 1));
  }, []);

  const goNext = useCallback(() => {
    setPage((current) => Math.min(pageCount - 1, current + 1));
  }, [pageCount]);

  /* ----------------------------------------------------------------
     OVERLAYS
  ---------------------------------------------------------------- */

  const closeAll = useCallback(() => {
    setOpenIndex(null);
    setHelpOpen(false);
  }, []);

  const overlayUp = openIndex !== null || helpOpen;

  useEffect(() => {
    if (!overlayUp) return;

    function onKey(e) {
      if (e.key === "Escape") {
        closeAll();
        return;
      }

      if (openIndex === null || count === 0) return;

      if (e.key === "ArrowRight") {
        setOpenIndex((i) => {
          if (i === null) return null;
          return (i + 1) % count;
        });
      }

      if (e.key === "ArrowLeft") {
        setOpenIndex((i) => {
          if (i === null) return null;
          return (i - 1 + count) % count;
        });
      }
    }

    document.addEventListener("keydown", onKey);

    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [overlayUp, openIndex, count, closeAll]);

  /*
   * Quand on navigue dans la lightbox,
   * la page du mur située derrière suit automatiquement.
   */
  useEffect(() => {
    if (openIndex === null) return;

    const targetPage = Math.floor(openIndex / PER_PAGE);

    setPage((current) => (current === targetPage ? current : targetPage));
  }, [openIndex]);

  /* ----------------------------------------------------------------
     RENDER
  ---------------------------------------------------------------- */

  return (
    <div className="page">
      <button
        type="button"
        className="helpbtn"
        onClick={() => setHelpOpen(true)}
        aria-label="What is this?"
      >
        ?
      </button>

      {/* ---- logo + call to action ---- */}
      <header className="masthead">
        <Logo />

        <a className="cta" href={LENS_URL} target="_blank" rel="noreferrer">
          Try the lens to share yours here
        </a>
      </header>

      {/* ---- the wooden board ---- */}
      <main className="stage">
        <div className="board">
          {status === "ready" && count > 0 && (
            <span className="count">
              <b>{count}</b> {count === 1 ? "drawing" : "drawings"} pinned
            </span>
          )}

          <div className="boardinner">
            {/* Loading */}
            {status === "loading" && <Skeleton />}

            {/* Error */}
            {status === "error" && (
              <div className="notice">
                <h2>The wall didn't load.</h2>

                <p>
                  Supabase returned: <code>{errorMsg}</code>
                </p>

                <p className="notice-hint">
                  Check that the read policy on <code>{TABLE}</code> allows{" "}
                  <code>anon</code>, and that the storage bucket is public.
                </p>
              </div>
            )}

            {/* Empty */}
            {status === "ready" && count === 0 && (
              <div className="notice">
                <h2>The wall is empty.</h2>

                <p>
                  Finish a puzzle in the lens and hit share to be the first.
                </p>
              </div>
            )}

            {/* Photos */}
            {status === "ready" && count > 0 && (
              <div className="sheets">
                {pagePhotos.map((photo, index) => {
                  const tape = tapeFor(photo.id);

                  const absoluteIndex = page * PER_PAGE + index;

                  return (
                    <button
                      type="button"
                      key={photo.id}
                      className="sheet"
                      style={{
                        "--tape-shift": `${tape.shift}px`,
                        "--tape-spin": `${tape.spin}deg`,
                        "--delay": `${index * 55}ms`,
                      }}
                      onClick={() => setOpenIndex(absoluteIndex)}
                      aria-label={`Open drawing from ${formatDate(photo.date)}`}
                    >
                      <span className="tape" aria-hidden="true" />

                      <img
                        src={photo.url}
                        alt=""
                        loading="lazy"
                        onError={() => markBroken(photo.id)}
                      />

                      <span className="stamp">{formatDate(photo.date)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="ledge" aria-hidden="true" />
        </div>

        {/* ---- pagination ---- */}
        {status === "ready" && pageCount > 1 && (
          <nav className="pager" aria-label="Pages">
            <button
              type="button"
              className="arrow"
              onClick={goPrev}
              disabled={page === 0}
              aria-label="Previous page"
            >
              <Chevron dir="left" />
            </button>

            <span className="pips">
              {Array.from({
                length: pageCount,
              }).map((_, index) => (
                <button
                  type="button"
                  key={index}
                  className={index === page ? "pip pip-on" : "pip"}
                  onClick={() => setPage(index)}
                  aria-label={`Page ${index + 1}`}
                  aria-current={index === page ? "true" : undefined}
                />
              ))}
            </span>

            <button
              type="button"
              className="arrow"
              onClick={goNext}
              disabled={page >= pageCount - 1}
              aria-label="Next page"
            >
              <Chevron dir="right" />
            </button>
          </nav>
        )}
      </main>

      {/* ---- footer ---- */}
      <footer className="outro">
        <div className="dotted-rule" aria-hidden="true" />

        <p className="fineprint">
          Built with Lens Studio for Snap Spectacles · anonymous by design, no
          names attached
        </p>
      </footer>

      {/* ---- help overlay ---- */}
      {helpOpen && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="About Dot to Dot"
          onClick={closeAll}
        >
          <div className="helpcard" onClick={(e) => e.stopPropagation()}>
            <h2>What is this?</h2>

            <p>
              Dot to Dot is a connect-the-dots game for Snap Spectacles. Put a
              sheet of paper down, place a flat hand on it, and a numbered
              puzzle appears on the page.
            </p>

            <p>
              Follow the numbers with a real pencil. When the drawing is done,
              hit share — a photo of your sheet lands on this wall.
            </p>

            <button type="button" className="ghostbtn" onClick={closeAll}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ---- lightbox ---- */}
      {openIndex !== null && photos[openIndex] && (
        <div
          className="overlay overlay-dark"
          role="dialog"
          aria-modal="true"
          aria-label="Drawing"
          onClick={closeAll}
        >
          <button type="button" className="lightbox-close" onClick={closeAll}>
            Close
          </button>

          <figure onClick={(e) => e.stopPropagation()}>
            <img
              src={photos[openIndex].url}
              alt=""
              onError={() => markBroken(photos[openIndex].id)}
            />

            <figcaption>{formatDate(photos[openIndex].date)}</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   BITS
------------------------------------------------------------------ */

function Chevron({ dir }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d={dir === "left" ? "M15 5 L8 12 L15 19" : "M9 5 L16 12 L9 19"}
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Logo() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="logo-fallback">
        <svg
          className="arc"
          viewBox="0 0 240 30"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 26 C 60 -4, 180 -4, 236 26"
            stroke="var(--orange)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="1 13"
          />
        </svg>

        <h1 className="wordmark">Dot to Dot Wall</h1>
      </div>
    );
  }

  return (
    <h1 className="logo-wrap">
      <img
        className="logo"
        src={LOGO_SRC}
        alt="Dot to Dot Wall"
        onError={() => setFailed(true)}
      />
    </h1>
  );
}

function Skeleton() {
  return (
    <div className="sheets" aria-hidden="true">
      {Array.from({
        length: PER_PAGE,
      }).map((_, index) => (
        <div key={index} className="sheet sheet-ghost" />
      ))}
    </div>
  );
}
