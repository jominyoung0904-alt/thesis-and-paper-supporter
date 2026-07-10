/**
 * IPC handlers for personal academic-search key management (T32,
 * NFR-ACAPI-002 조기 구현): saving a per-provider key from the Settings tab,
 * and reporting which providers currently have a key registered.
 *
 * Split out of `handlers.ts` to keep that file under the project's
 * per-file line limit — this module is still registered from
 * `registerIpcHandlers` (the single composition root for all channels).
 */

import { ipcMain } from 'electron';

import type { AppSettings } from '../config/defaultSettings';
import { parseNaverCredential } from '../config/keyStore';
import type { KeyStore } from '../config/keyStore';
import { NaverDocClient } from '../../core/academic-api/naverDocClient';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AcademicKeyStatus, SaveAcademicKeyRequest, SaveAcademicKeyResult } from '../../shared/ipc-channels';
import { isBoundedAcademicKey, isValidAcademicKeyProvider, isValidNaverCredentialFormat } from './academicKeyGuards';

export interface AcademicKeyHandlerDeps {
  keyStore: KeyStore;
  getSettings: () => AppSettings;
}

const INVALID_REQUEST_MESSAGE = '잘못된 요청이에요. 앱을 다시 시작한 뒤 시도해 주세요.';

/**
 * Shown alongside a *successful* kci/scienceon save: unlike naverdoc, these
 * two are never verified against a live call here (research.md documents
 * both as IP/MAC allow-list restricted at issuance — a successful save from
 * this machine does not guarantee the key will actually work at request
 * time), so the user gets an upfront expectation instead of a silent later
 * failure.
 */
const IP_MAC_RESTRICTION_NOTICE = '이 키는 발급 시 등록한 컴퓨터/네트워크에서만 동작할 수 있어요.';

/** Shown for both a malformed Client ID/Secret pair and a failed live verification call. */
const NAVER_CREDENTIAL_FAILURE_MESSAGE = 'Client ID와 Secret을 다시 확인해 주세요.';

/** Registers `settings:save-academic-key` and `settings:get-academic-key-status`. */
export function registerAcademicKeyHandlers(deps: AcademicKeyHandlerDeps): void {
  const { keyStore, getSettings } = deps;

  ipcMain.handle(
    IpcChannels.SETTINGS_SAVE_ACADEMIC_KEY,
    async (_event, payload: SaveAcademicKeyRequest): Promise<SaveAcademicKeyResult> => {
      const provider = payload?.provider;
      const key = payload?.key;

      if (!isValidAcademicKeyProvider(provider) || !isBoundedAcademicKey(key)) {
        return { ok: false, message: INVALID_REQUEST_MESSAGE };
      }

      if (provider === 'naverdoc') {
        return saveNaverDocKey(keyStore, getSettings(), key);
      }

      // kci/scienceon: saved without a live connectivity check (see
      // IP_MAC_RESTRICTION_NOTICE doc comment above).
      const saveResult = keyStore.saveKey(provider, key);
      if (!saveResult.ok) {
        return { ok: false, message: saveResult.userMessage };
      }
      return { ok: true, message: IP_MAC_RESTRICTION_NOTICE };
    },
  );

  ipcMain.handle(IpcChannels.SETTINGS_GET_ACADEMIC_KEY_STATUS, async (): Promise<AcademicKeyStatus> => {
    const stored = keyStore.listStoredProviders();
    return {
      kci: stored.includes('kci'),
      scienceon: stored.includes('scienceon'),
      naverdoc: stored.includes('naverdoc'),
    };
  });
}

/**
 * naverdoc is the one provider verified against a live call before saving (a
 * single `query=test` search) — its Client ID/Secret pairing is cheap to
 * check up-front and the 25,000/day free quota makes a silent bad-credential
 * failure annoying to discover later during an actual research run.
 */
async function saveNaverDocKey(keyStore: KeyStore, settings: AppSettings, key: string): Promise<SaveAcademicKeyResult> {
  if (!isValidNaverCredentialFormat(key)) {
    return { ok: false, message: NAVER_CREDENTIAL_FAILURE_MESSAGE };
  }

  // Guaranteed non-null: isValidNaverCredentialFormat just confirmed it parses.
  const credential = parseNaverCredential(key)!;
  const client = new NaverDocClient({
    baseUrl: settings.endpoints.naver,
    clientId: credential.clientId,
    clientSecret: credential.clientSecret,
    mockMode: false,
  });
  const verifyResult = await client.search('test', { limit: 1 });
  if (!verifyResult.ok) {
    return { ok: false, message: NAVER_CREDENTIAL_FAILURE_MESSAGE };
  }

  const saveResult = keyStore.saveKey('naverdoc', key);
  if (!saveResult.ok) {
    return { ok: false, message: saveResult.userMessage };
  }
  return { ok: true };
}
