import { put, del } from "@vercel/blob";

/**
 * Thin wrapper around Vercel Blob. Requires BLOB_READ_WRITE_TOKEN at runtime
 * (set automatically when a Blob store is linked to the Vercel project) —
 * not available in local sandboxes, so uploads can't be integration-tested
 * outside Vercel. `addRandomSuffix: true` avoids collisions between
 * concurrent uploads that happen to pick the same pathname.
 */
export async function uploadFile(
  pathname: string,
  data: Buffer | Blob,
  contentType: string
): Promise<{ url: string }> {
  const blob = await put(pathname, data, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });
  return { url: blob.url };
}

export async function deleteFile(url: string): Promise<void> {
  await del(url);
}
