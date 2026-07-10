import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSettings } from '../../src/main/config/defaultSettings';
import { fetchRemoteConfig, mergeRemoteIntoSettings } from '../../src/main/config/remoteConfig';
import type { RemoteConfigOverride } from '../../src/main/config/remoteConfig';

const TEST_URL = 'https://example.invalid/endpoints.json';

function stubFetchOnce(response: { ok: boolean; json: () => Promise<unknown> }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response as unknown as Response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRemoteConfig', () => {
  it('returns ok:true with parsed data on a successful response', async () => {
    const payload: RemoteConfigOverride = {
      endpoints: { claude: 'https://custom.claude.example' },
      announcement: '점검 예정 안내',
    };
    stubFetchOnce({ ok: true, json: () => Promise.resolve(payload) });

    const result = await fetchRemoteConfig(TEST_URL, 1000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(payload);
    }
  });

  it('returns a Korean userMessage and http-error reason on a non-2xx response', async () => {
    stubFetchOnce({ ok: false, json: () => Promise.resolve({}) });

    const result = await fetchRemoteConfig(TEST_URL, 1000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('http-error');
      expect(result.userMessage).toMatch(/연결하지 못했어요/);
    }
  });

  it('returns reason:parse-error when the response body is not valid JSON', async () => {
    stubFetchOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });

    const result = await fetchRemoteConfig(TEST_URL, 1000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('parse-error');
    }
  });

  it('returns reason:network when fetch rejects with a generic error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));

    const result = await fetchRemoteConfig(TEST_URL, 1000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('network');
    }
  });

  it('returns reason:timeout when the request is aborted before completing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      }),
    );

    const result = await fetchRemoteConfig(TEST_URL, 5);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('timeout');
      expect(result.userMessage).toMatch(/로컬 기본값/);
    }
  });

  it('never throws — a rejected fetch always resolves to a RemoteConfigFailure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

    await expect(fetchRemoteConfig(TEST_URL, 1000)).resolves.toEqual(
      expect.objectContaining({ ok: false }),
    );
  });
});

describe('mergeRemoteIntoSettings', () => {
  it('overrides only the endpoints provided by the remote payload (allowlisted host)', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      endpoints: { claude: 'https://rotated.anthropic.com' },
    });

    expect(merged.endpoints.claude).toBe('https://rotated.anthropic.com');
    expect(merged.endpoints.gemini).toBe(settings.endpoints.gemini);
  });

  it('preserves user-owned preference keys (llm, proxy, remoteConfigUrl) even if remote sends endpoints', () => {
    const settings = createDefaultSettings();
    settings.llm.provider = 'openai';
    settings.proxy = { enabled: true, url: 'http://proxy.local:8080' };
    settings.remoteConfigUrl = 'https://mine.example/endpoints.json';

    const merged = mergeRemoteIntoSettings(settings, {
      endpoints: { openai: 'https://eu.openai.com' },
    });

    expect(merged.llm).toEqual({ provider: 'openai', mode: 'free' });
    expect(merged.proxy).toEqual({ enabled: true, url: 'http://proxy.local:8080' });
    expect(merged.remoteConfigUrl).toBe('https://mine.example/endpoints.json');
  });

  // Security regression tests (audit C1/H2): a hostile remote config must
  // never be able to point an endpoint (and thus the user's API key) at an
  // attacker-controlled host.
  it('drops remote endpoint overrides whose host is not on the service allowlist', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      endpoints: {
        claude: 'https://attacker.example',
        gemini: 'https://evil-googleapis.com.attacker.example',
      },
    });

    expect(merged.endpoints.claude).toBe(settings.endpoints.claude);
    expect(merged.endpoints.gemini).toBe(settings.endpoints.gemini);
  });

  it('drops non-https and malformed remote endpoint overrides', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      endpoints: {
        claude: 'http://api.anthropic.com',
        openai: 'not a url',
      },
    });

    expect(merged.endpoints.claude).toBe(settings.endpoints.claude);
    expect(merged.endpoints.openai).toBe(settings.endpoints.openai);
  });

  it('keeps allowlisted overrides while dropping hostile ones in the same payload', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      endpoints: {
        claude: 'https://api2.anthropic.com',
        gemini: 'https://attacker.example',
      },
    });

    expect(merged.endpoints.claude).toBe('https://api2.anthropic.com');
    expect(merged.endpoints.gemini).toBe(settings.endpoints.gemini);
  });

  it('rejects a non-https remoteConfigUrl before any fetch happens (invalid-url)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchRemoteConfig('http://insecure.example/endpoints.json', 1000);

    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'invalid-url' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns settings unchanged when the remote payload has no endpoints', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, { announcement: '공지' });

    expect(merged).toEqual(settings);
  });
});
