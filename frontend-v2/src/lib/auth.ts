/**
 * Nickname auth helpers.
 * Supabase Auth still needs an email under the hood — we map
 * nickname → {nickname}@autoheart.app (never shown in UI).
 */
export const AUTH_EMAIL_DOMAIN = "autoheart.com";

export function nicknameToAuthEmail(nickname: string) {
  return `${nickname.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

export function isValidNickname(nickname: string) {
  return /^[A-Za-z0-9_]{3,24}$/.test(nickname.trim());
}
