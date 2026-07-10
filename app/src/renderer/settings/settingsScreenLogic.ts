/**
 * Pure content/state helpers for `SettingsScreen` (T32, NFR-ACAPI-002 조기
 * 구현; naverdoc card added SPEC-TSA-001 후속 T33). Framework-free so it can
 * be unit-tested without a DOM environment, following the same split used by
 * `wizardLogic.ts`.
 */

import type { IpcAcademicKeyProvider } from '../../shared/ipc-channels';

/** Extra field labels for a card that collects two credential inputs instead of one (naverdoc only). */
export interface DualFieldSpec {
  primaryLabel: string;
  primaryPlaceholder: string;
  secondaryLabel: string;
  secondaryPlaceholder: string;
}

export interface AcademicKeyCardDefinition {
  provider: IpcAcademicKeyProvider;
  title: string;
  description: string;
  difficultyNote: string;
  /** IP/MAC-restriction caveat shown for kci/scienceon; omitted for naverdoc. */
  restrictionNote?: string;
  guideUrl?: string;
  guideLabel?: string;
  /** Ordered issuance steps shown in a foldable "발급 방법 보기" block. Naverdoc only. */
  steps?: readonly string[];
  /** When set, this card collects Client ID + Client Secret instead of one raw key (naverdoc only). */
  dualField?: DualFieldSpec;
}

export const ACADEMIC_KEY_CARDS: readonly AcademicKeyCardDefinition[] = [
  {
    provider: 'naverdoc',
    title: '네이버 전문자료 검색 (학위논문·보고서)',
    description:
      '국내 학위논문·보고서까지 검색 범위가 넓어져요. 네이버 계정으로 2~3분이면 발급돼요. (하루 25,000회 무료)',
    difficultyNote: '발급 난이도: 쉬움 — 네이버 계정만 있으면 몇 분 안에 발급받을 수 있어요.',
    guideUrl: 'https://developers.naver.com/apps/#/register',
    guideLabel: '네이버 개발자센터에서 발급받기',
    steps: [
      'developers.naver.com에 접속해 애플리케이션을 등록해 주세요.',
      "사용 API에서 '검색'을 선택해 주세요.",
      "WEB 설정의 URL 칸에 http://localhost 를 입력해 주세요.",
      '등록 후 발급된 Client ID와 Client Secret을 아래에 입력해 주세요.',
    ],
    dualField: {
      primaryLabel: 'Client ID',
      primaryPlaceholder: 'Client ID를 입력해 주세요',
      secondaryLabel: 'Client Secret',
      secondaryPlaceholder: 'Client Secret을 입력해 주세요',
    },
  },
  {
    provider: 'kci',
    title: 'KCI (한국학술지인용색인)',
    description: '국내 학술지 논문 검색에 개인 키를 우선 사용해요.',
    difficultyNote: '발급 난이도: 보통 — 공공데이터포털에서 신청 후 승인까지 시간이 걸릴 수 있어요.',
    restrictionNote: '발급받은 컴퓨터에서만 동작하는 개인용 옵션이에요.',
  },
  {
    provider: 'scienceon',
    title: 'ScienceON',
    description: '과학기술 분야 논문 검색에 개인 키를 우선 사용해요.',
    difficultyNote: '발급 난이도: 보통 — KISTI의 승인 절차를 거쳐야 해요.',
    restrictionNote: '발급받은 컴퓨터에서만 동작하는 개인용 옵션이에요.',
  },
];

export interface AcademicKeyCardState {
  input: string;
  /** Second field's value, used only by dual-field cards (naverdoc's Client Secret). */
  secondInput: string;
  saving: boolean;
  message: string | null;
  messageKind: 'error' | 'success' | null;
}

export function createInitialCardState(): AcademicKeyCardState {
  return { input: '', secondInput: '', saving: false, message: null, messageKind: null };
}

/** Mirrors `wizardLogic.ts`'s minimal "non-empty, not mid-save" gate for the settings-tab cards. */
export function canSaveAcademicKey(input: string, saving: boolean): boolean {
  return input.trim().length > 0 && !saving;
}

/** Dual-field variant (naverdoc): both Client ID and Client Secret must be non-empty. */
export function canSaveDualFieldKey(input: string, secondInput: string, saving: boolean): boolean {
  return input.trim().length > 0 && secondInput.trim().length > 0 && !saving;
}

/**
 * Combines naverdoc's two fields into `KeyStore`'s single-string storage
 * format: `${clientId}:${clientSecret}` (see `keyStore.ts`'s
 * `parseNaverCredential`, the counterpart parser on the main-process side).
 */
export function combineNaverCredential(clientId: string, clientSecret: string): string {
  return `${clientId.trim()}:${clientSecret.trim()}`;
}
