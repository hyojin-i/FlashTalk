const DEFAULT_STORAGE_BUCKET = "flashtalk-files";
const PUBLIC_OBJECT_PREFIX = "/storage/v1/object/public/";

function publicStorageBucket(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET?.trim() ||
    DEFAULT_STORAGE_BUCKET
  );
}

function publicSupabaseOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Extracts the object path inside the bucket from a Supabase public storage URL. */
function extractObjectPathFromPublicUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    const prefixIndex = url.pathname.indexOf(PUBLIC_OBJECT_PREFIX);
    if (prefixIndex < 0) return null;

    const afterPublic = url.pathname.slice(
      prefixIndex + PUBLIC_OBJECT_PREFIX.length
    );
    const slashIndex = afterPublic.indexOf("/");
    if (slashIndex < 0) return null;

    return decodeURIComponent(afterPublic.slice(slashIndex + 1));
  } catch {
    return null;
  }
}

/**
 * Builds a Supabase Storage public URL for browser GET download.
 * Uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET.
 */
export function buildSupabaseFileDownloadUrl(
  fileUrl: string,
  fileName: string
): string {
  const origin = publicSupabaseOrigin();
  const bucket = publicStorageBucket();
  const objectPath = extractObjectPathFromPublicUrl(fileUrl);

  let baseUrl = fileUrl;
  if (origin && objectPath) {
    const encodedPath = objectPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    baseUrl = `${origin}${PUBLIC_OBJECT_PREFIX}${bucket}/${encodedPath}`;
  }

  const downloadUrl = new URL(baseUrl);
  downloadUrl.searchParams.set("download", fileName);
  return downloadUrl.toString();
}

/**
 * Procedure: extract fileUrl from FileMessage → GET Supabase Storage via &lt;a&gt; → save locally.
 */
export function downloadFileFromUrl(fileUrl: string, fileName: string): void {
  if (!fileUrl.trim()) return;

  const safeName = fileName.trim() || "download";
  const href = buildSupabaseFileDownloadUrl(fileUrl, safeName);

  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = safeName;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
