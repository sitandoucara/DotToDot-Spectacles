import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BUCKET = "photos";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { image_base64, content_type } = await req.json();

    if (!image_base64) return json({ error: "Missing image_base64" }, 400);

    const contentType = content_type || "image/jpeg";
    const ext = contentType === "image/png" ? "png" : "jpg";

    const bytes = Uint8Array.from(atob(image_base64), (c) => c.charCodeAt(0));

    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr) return json({ error: `upload failed: ${upErr.message}` }, 500);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = pub.publicUrl;

    const { error: insErr } = await supabase
      .from("photos")
      .insert({ url, storage_path: path });
    if (insErr) console.error("insert failed:", insErr.message);

    return json({ url, path }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
