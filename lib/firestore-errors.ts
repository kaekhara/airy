/** Detect a Firestore IAM denial without exposing provider text or request data. */
export function isFirestorePermissionDenied(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 7 || code === '7') return true;
  if (typeof code !== 'string') return false;
  const normalized = code.toLowerCase().replaceAll('_', '-');
  return normalized === 'permission-denied' || normalized === 'firestore/permission-denied';
}
