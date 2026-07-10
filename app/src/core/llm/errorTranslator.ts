/**
 * Translates the internal LLM error taxonomy into plain, everyday Korean
 * copy for non-technical graduate-student users (NFR-LLM-004, risk 3).
 *
 * Users must never see a raw HTTP status or English provider message — an
 * untranslated error reads as "the app is broken" and causes churn. This
 * module is the single place where `LlmErrorKind` is turned into user-facing
 * text, so copy changes never touch retry or transport logic.
 */

import { LlmApiError, type LlmErrorKind } from './errors';

/** User-facing translation of any LLM (or non-LLM) failure. */
export interface TranslatedError {
  /** Short headline shown prominently (e.g. in a toast or banner). */
  title: string;
  /** Supporting sentence with next-step guidance. */
  message: string;
  /** Whether the app will (or should) retry this failure automatically. */
  canRetry: boolean;
  /** Present only for rate-limit errors that carried a server-provided hint. */
  retryAfterSec?: number;
  /** Original kind, or `'non-llm'` when the input wasn't an `LlmApiError`. */
  kind: LlmErrorKind | 'non-llm';
}

/** One row of the translation table: static copy, or copy derived from retryAfterSec. */
interface ErrorCopyEntry {
  title: string;
  message: string | ((retryAfterSec?: number) => string);
  canRetry: boolean;
}

/**
 * kind -> Korean copy table.
 *
 * Deliberately kept as a flat, serializable data structure (not inlined into
 * the translation function) so it can later be swapped for a table loaded
 * from remote config — see NFR-LLM-006, which already loads similar
 * user-facing badge copy remotely instead of hardcoding it.
 */
const ERROR_COPY: Record<LlmErrorKind | 'non-llm', ErrorCopyEntry> = {
  'quota-exhausted': {
    title: '오늘의 무료 사용량을 모두 썼어요',
    message: '내일 오후 4~5시쯤 다시 채워져요. 계속 쓰시려면 설정에서 유료 모드로 바꿀 수 있어요.',
    canRetry: false,
  },
  'rate-limit': {
    title: '요청이 잠깐 몰렸어요',
    message: (retryAfterSec) =>
      retryAfterSec && retryAfterSec > 0
        ? `${retryAfterSec}초 뒤에 자동으로 다시 시도할게요.`
        : '잠시 뒤에 자동으로 다시 시도할게요.',
    canRetry: true,
  },
  auth: {
    title: 'API 키에 문제가 있어요',
    message: '설정에서 키를 다시 확인해 주세요. 키가 바뀌었거나 잘못 입력됐을 수 있어요.',
    canRetry: false,
  },
  network: {
    title: '인터넷 연결을 확인해 주세요',
    message: '연결 상태를 확인하는 대로 자동으로 다시 시도할게요.',
    canRetry: true,
  },
  timeout: {
    title: '응답이 너무 오래 걸려요',
    message: '자동으로 다시 시도할게요. 계속 이러면 잠시 후 다시 시도해 주세요.',
    canRetry: true,
  },
  server: {
    title: 'AI 서비스가 잠시 불안정해요',
    message: '자동으로 다시 시도할게요. 계속 이러면 잠시 후 다시 이용해 주세요.',
    canRetry: true,
  },
  'bad-request': {
    title: '예상하지 못한 문제가 생겼어요',
    message: '문제가 계속되면 화면을 캡처해서 문의해 주세요.',
    canRetry: false,
  },
  unknown: {
    title: '예상하지 못한 문제가 생겼어요',
    message: '문제가 계속되면 화면을 캡처해서 문의해 주세요.',
    canRetry: false,
  },
  'non-llm': {
    title: '예상하지 못한 문제가 생겼어요',
    message: '문제가 계속되면 화면을 캡처해서 문의해 주세요.',
    canRetry: false,
  },
};

/**
 * Converts any thrown value into a {@link TranslatedError}. Safe for values
 * that are not an {@link LlmApiError} (plain `Error`, string, etc.) — those
 * are reported under `kind: 'non-llm'` with the same generic guidance copy,
 * so a caller never has to guard against an unclassified crash.
 */
export function translateLlmError(err: unknown): TranslatedError {
  const kind: LlmErrorKind | 'non-llm' = err instanceof LlmApiError ? err.kind : 'non-llm';
  const retryAfterSec = err instanceof LlmApiError ? err.retryAfterSec : undefined;
  const entry = ERROR_COPY[kind];
  const message = typeof entry.message === 'function' ? entry.message(retryAfterSec) : entry.message;

  return {
    title: entry.title,
    message,
    canRetry: entry.canRetry,
    retryAfterSec,
    kind,
  };
}
