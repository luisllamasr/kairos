import { registerMemoryPhoto } from '@/lib/memories';
import { supabase } from '@/lib/supabase';

/** Bucket + DB accept only jpeg/png/webp. Map picker quirks (heic, jpg) to supported types. */
export function normalizeMemoryPhotoMime(mimeType: string | null | undefined): string {
  if (mimeType === 'image/png') return 'image/png';
  if (mimeType === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function newMediaId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function uploadMemoryPhoto(
  base64Data: string,
  memoryId: string,
  mimeType: string,
): Promise<{ mediaId: string | null; error: boolean }> {
  const normalizedMime = normalizeMemoryPhotoMime(mimeType);

  try {
    const mediaId = newMediaId();
    const path = `${memoryId}/${mediaId}.${extensionForMime(normalizedMime)}`;
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const { error: uploadError } = await supabase.storage
      .from('memories')
      .upload(path, bytes, { contentType: normalizedMime, upsert: false });

    if (uploadError) return { mediaId: null, error: true };

    const result = await registerMemoryPhoto({
      memoryId,
      mediaId,
      storagePath: path,
      mimeType: normalizedMime,
      byteSize: bytes.length,
    });

    if (result.error) {
      await supabase.storage.from('memories').remove([path]);
      return { mediaId: null, error: true };
    }

    return { mediaId, error: false };
  } catch {
    return { mediaId: null, error: true };
  }
}
