/**
 * Allow-list check for `shell:open-external` targets (opening a URL in the
 * user's default browser). Only `https://` URLs are ever allowed.
 *
 * This single rule covers both link classes this app ever opens: the
 * setup wizard's LLM-provider key-issuance pages (`PROVIDER_KEY_URLS` in
 * `renderer/settings/wizard/wizardTypes.ts`, all `https://`) and arbitrary
 * paper URLs surfaced by the research pipeline (academic sources only ever
 * return `https://` links). Anything else — `javascript:`, `file:`, plain
 * `http:`, or a malformed string — is rejected outright, so a compromised or
 * malformed URL string can never trigger a local file open or script
 * execution via the OS shell.
 */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
