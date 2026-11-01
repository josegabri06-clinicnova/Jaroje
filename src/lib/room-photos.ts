/**
 * Centralized Room & Common Area Photos Helper
 * All photos are hosted on Supabase Storage ('room-photos' public bucket)
 * in optimized WebP format (max 1200px width, ~80% lighter than raw JPEGs).
 */

const SUPABASE_STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://acbvhhzjbotgtynafemy.supabase.co'}/storage/v1/object/public/room-photos`;

export function getRoomPhotoUrl(category: string, index: number): string {
  return `${SUPABASE_STORAGE_BASE}/${category}/${index}.webp`;
}

export function getRoomPhotos(category: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => getRoomPhotoUrl(category, i + 1));
}

export const COMMON_PHOTOS = getRoomPhotos('general', 20);

export const DEFAULT_FALLBACK_PHOTO = getRoomPhotoUrl('general', 1);
