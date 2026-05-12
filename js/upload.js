import { getSupabase } from "./supabase.js";

const BUCKET = "transfer-images";

/**
 * @param {File} file
 * @returns {Promise<{ publicUrl: string } | { error: Error }>}
 */
export async function uploadTransferImage(file) {
  const supabase = await getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const path = `${crypto.randomUUID()}.${safeExt}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (upErr) return { error: upErr };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

/**
 * @param {string} imageUrl full public URL from Supabase storage
 */
export async function deleteTransferImageByUrl(imageUrl) {
  const supabase = await getSupabase();
  if (!supabase || !imageUrl) return;

  try {
    const marker = `/object/public/${BUCKET}/`;
    const idx = imageUrl.indexOf(marker);
    if (idx === -1) return;
    const objectPath = imageUrl.slice(idx + marker.length);
    if (!objectPath) return;
    await supabase.storage.from(BUCKET).remove([objectPath]);
  } catch {
    /* best-effort */
  }
}

export { BUCKET };
