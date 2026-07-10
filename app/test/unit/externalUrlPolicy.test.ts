import { describe, expect, it } from 'vitest';

import { isAllowedExternalUrl } from '../../src/shared/externalUrlPolicy';

describe('isAllowedExternalUrl', () => {
  it('allows a plain https URL', () => {
    expect(isAllowedExternalUrl('https://aistudio.google.com/apikey')).toBe(true);
  });

  it('allows an https URL with a path, query, and fragment', () => {
    expect(isAllowedExternalUrl('https://example.com/paper?id=123#abstract')).toBe(true);
  });

  it('rejects a plain http URL', () => {
    expect(isAllowedExternalUrl('http://example.com')).toBe(false);
  });

  it('rejects a javascript: URL', () => {
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects a javascript: URL disguised with an https-looking payload', () => {
    expect(isAllowedExternalUrl('javascript:https://example.com')).toBe(false);
  });

  it('rejects a file: URL', () => {
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isAllowedExternalUrl('')).toBe(false);
  });

  it('rejects a malformed URL', () => {
    expect(isAllowedExternalUrl('not a url')).toBe(false);
  });
});
