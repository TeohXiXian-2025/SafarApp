import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../firebase/config';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

/** Uploads into the caller's private trip folder (see storage.rules). Returns the storage path. */
export function uploadTripFile(
  tripId: string,
  uid: string,
  folder: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) return Promise.reject(new Error('File is larger than 10 MB.'));
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `trips/${tripId}/users/${uid}/${folder}/${Date.now()}-${safe}`;
  // iOS sometimes reports HEIC photos with an empty type.
  const contentType = file.type || (/\.hei[cf]$/i.test(file.name) ? 'image/heic' : 'application/octet-stream');
  const task = uploadBytesResumable(ref(storage, path), file, { contentType });
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (s) => onProgress?.(s.bytesTransferred / s.totalBytes),
      (err) => reject(new Error(err.code === 'storage/unauthorized' ? 'Only PDFs and photos up to 10 MB can be uploaded.' : 'Upload failed. Check your connection.')),
      () => resolve(path),
    );
  });
}

export const fileUrl = (path: string) => getDownloadURL(ref(storage, path));
export const deleteFile = (path: string) => deleteObject(ref(storage, path)).catch(() => {});
