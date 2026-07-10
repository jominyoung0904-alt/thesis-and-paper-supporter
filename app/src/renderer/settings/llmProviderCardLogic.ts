/**
 * Pure state/validation helpers for `LlmProviderCard` — the settings-tab
 * card that lets the user change LLM provider/mode/key after first run
 * (실사용 피드백: once onboarding finished there was no way back in to
 * switch provider, mode, or key). Framework-free, following the same split
 * used by `settingsScreenLogic.ts` and `wizard/wizardLogic.ts`.
 *
 * Deliberately reuses `wizard/wizardLogic.ts`'s key-format validation and
 * `wizard/wizardTypes.ts`'s provider labels/guide URLs rather than
 * redefining them here — this card is the wizard's post-onboarding
 * counterpart, not a separate feature.
 */

import type { IpcLlmMode, IpcLlmProvider } from '../../shared/ipc-channels';
import { validateApiKeyFormat } from './wizard/wizardLogic';

/** Current provider/mode/key-presence snapshot, as reported by `settings:get-llm-status`. */
export interface LlmStatusView {
  provider: IpcLlmProvider;
  mode: IpcLlmMode;
  hasKey: boolean;
}

export interface LlmProviderCardState {
  /** `null` until the first `getLlmStatus()` call resolves. */
  status: LlmStatusView | null;
  provider: IpcLlmProvider;
  mode: IpcLlmMode;
  apiKey: string;
  saving: boolean;
  message: string | null;
  messageKind: 'success' | 'error' | null;
}

/**
 * Starting selection defaults to gemini/free — overwritten as soon as the
 * real status loads (see `LlmProviderCard`'s mount effect). Matches
 * `createDefaultSettings()`'s own default so the card never briefly shows a
 * selection the backend doesn't actually have.
 */
export function createInitialLlmProviderCardState(): LlmProviderCardState {
  return {
    status: null,
    provider: 'gemini',
    mode: 'free',
    apiKey: '',
    saving: false,
    message: null,
    messageKind: null,
  };
}

/** Korean labels for free/paid mode, paired with `PROVIDER_LABELS` (wizardTypes.ts) for provider names. */
export const MODE_LABELS: Record<IpcLlmMode, string> = {
  free: '무료 모드',
  paid: '유료 모드',
};

/** Free mode is Gemini-only this sprint — mirrors `wizardReducer`'s `SELECT_MODE` constraint. */
export function isProviderAllowedForMode(mode: IpcLlmMode, provider: IpcLlmProvider): boolean {
  return mode === 'paid' || provider === 'gemini';
}

/**
 * Provider to select right after a mode change. Locks to `gemini` when
 * switching to free mode; otherwise keeps whatever provider was already
 * selected — the same rule `wizardReducer`'s `SELECT_MODE` action applies.
 */
export function resolveProviderForMode(mode: IpcLlmMode, currentProvider: IpcLlmProvider): IpcLlmProvider {
  return mode === 'free' ? 'gemini' : currentProvider;
}

/** Whether the [연결 확인 후 변경] button may be pressed. */
export function canChangeLlmConnection(apiKey: string, saving: boolean): boolean {
  return validateApiKeyFormat(apiKey).ok && !saving;
}

/** "지금은 Gemini · 무료 모드를 사용 중이에요" — or a loading placeholder before the first status arrives. */
export function describeCurrentStatus(
  status: LlmStatusView | null,
  providerLabels: Record<IpcLlmProvider, string>,
): string {
  if (!status) {
    return '지금 연결 상태를 확인하고 있어요...';
  }
  const providerLabel = providerLabels[status.provider];
  const modeLabel = MODE_LABELS[status.mode];
  const keyNote = status.hasKey ? '' : ' (키 미등록)';
  return `지금은 ${providerLabel} · ${modeLabel}을 사용 중이에요${keyNote}.`;
}

/** Shown after a successful `saveProviderAndKey` call. */
export function connectionChangedMessage(
  provider: IpcLlmProvider,
  providerLabels: Record<IpcLlmProvider, string>,
): string {
  return `변경됐어요! 이제 ${providerLabels[provider]}로 대화해요.`;
}

/**
 * Appends the "기존 연결은 그대로예요" reassurance to whatever Korean error
 * message `saveProviderAndKey` returned — a failed connectivity check never
 * touches the previously saved provider/key (see `settingsHandlers.ts`), so
 * the user should never worry the app just broke.
 */
export function connectionFailureMessage(rawMessage: string | undefined): string {
  const base = rawMessage ?? '연결을 확인하지 못했어요.';
  return `${base} 기존 연결은 그대로예요.`;
}
