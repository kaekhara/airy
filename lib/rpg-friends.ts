import { createHash } from 'node:crypto';

/** Invite codes contain only uppercase hex so they are easy to read and type. */
export function normalizeFriendCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-F0-9]{18}$/.test(code) ? code : null;
}

export function hashFriendCode(code: string) {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

/** Stable opaque pair key; raw account IDs are not exposed in the key. */
export function friendshipId(firstUid: string, secondUid: string) {
  const pair = [firstUid, secondUid].sort();
  return createHash('sha256').update(`${pair[0]}\0${pair[1]}`, 'utf8').digest('hex');
}

export function safeFriendName(value: unknown) {
  if (typeof value !== 'string') return 'Участник';
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
  return name || 'Участник';
}

export function safeFriendAvatar(value: unknown) {
  const allowed = new Set(['🌸', '🌙', '📚', '🎧', '🐈', '✦']);
  return typeof value === 'string' && allowed.has(value) ? value : '✦';
}
