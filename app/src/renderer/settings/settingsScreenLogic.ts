/**
 * Pure content/state helpers for `SettingsScreen` (T32, NFR-ACAPI-002 조기
 * 구현). Framework-free so it can be unit-tested without a DOM environment,
 * following the same split used by `wizardLogic.ts`.
 */

import type { IpcAcademicKeyProvider } from '../../shared/ipc-channels';

export interface AcademicKeyCardDefinition {
  provider: IpcAcademicKeyProvider;
  title: string;
  description: string;
  difficultyNote: string;
  /** IP/MAC-restriction caveat shown for kci/scienceon; omitted for googlecse. */
  restrictionNote?: string;
  guideUrl?: string;
  guideLabel?: string;
}

export const ACADEMIC_KEY_CARDS: readonly AcademicKeyCardDefinition[] = [
  {
    provider: 'googlecse',
    title: '구글 학위논문 검색 (RISS)',
    description:
      '국내 석·박사 학위논문(RISS)까지 검색 범위가 넓어져요. 구글 계정으로 하루 100회 무료로 쓸 수 있어요.',
    difficultyNote: '발급 난이도: 쉬움 — 구글 계정만 있으면 몇 분 안에 발급받을 수 있어요.',
    guideUrl: 'https://console.cloud.google.com/apis/library/customsearch.googleapis.com',
    guideLabel: 'Google Cloud 콘솔에서 발급 안내 보기',
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
  saving: boolean;
  message: string | null;
  messageKind: 'error' | 'success' | null;
}

export function createInitialCardState(): AcademicKeyCardState {
  return { input: '', saving: false, message: null, messageKind: null };
}

/** Mirrors `wizardLogic.ts`'s minimal "non-empty, not mid-save" gate for the settings-tab cards. */
export function canSaveAcademicKey(input: string, saving: boolean): boolean {
  return input.trim().length > 0 && !saving;
}
