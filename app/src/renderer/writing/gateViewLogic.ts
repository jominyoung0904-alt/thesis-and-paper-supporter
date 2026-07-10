/**
 * Pure view-logic helpers for `QualityGateView` (Task T19 / SPEC-TSA-001,
 * FR-WRT-002). Deliberately framework-free so it can be unit tested without
 * a DOM environment (matches the pattern in `../settings/wizard/wizardLogic.ts`).
 *
 * FR-WRT-002 allows either a hard block or a clear warning on completion.
 * This module implements the "explicit two-step warning" variant: when the
 * gate result is a failure, "완료로 표시" stays disabled until the user
 * explicitly opts in via an "그래도 완료로 표시하기" override checkbox — so a
 * non-technical user is never stuck at a dead end, but can't complete
 * silently either.
 */

import type { CriterionResult, GateResult } from '../../core/writing/qualityGate';

/** Whether the "검사하기" button should be enabled. Disabled while a check is running. */
export function isRunCheckEnabled(checking: boolean): boolean {
  return !checking;
}

/**
 * Whether the "완료로 표시" button should be enabled.
 *
 * - No result yet, or still checking: disabled (nothing to complete against).
 * - Result passed: always enabled.
 * - Result failed: enabled only if the user has ticked the override checkbox.
 */
export function isMarkCompleteEnabled(
  gateResult: GateResult | null,
  checking: boolean,
  overrideChecked: boolean,
): boolean {
  if (checking || !gateResult) {
    return false;
  }
  if (gateResult.passed) {
    return true;
  }
  return overrideChecked;
}

/** Whether the override checkbox itself should be shown (only relevant on a failed, non-checking result). */
export function shouldShowOverride(gateResult: GateResult | null, checking: boolean): boolean {
  return !checking && gateResult !== null && !gateResult.passed;
}

/** Criterion results sorted so failed criteria surface first (most actionable first). */
export function sortCriteriaForDisplay(results: CriterionResult[]): CriterionResult[] {
  return [...results].sort((a, b) => {
    if (a.passed === b.passed) {
      return 0;
    }
    return a.passed ? 1 : -1;
  });
}

/** Which of the three top-level view states to render. */
export type GateViewPhase = 'idle' | 'checking' | 'result';

export function resolveGateViewPhase(gateResult: GateResult | null, checking: boolean): GateViewPhase {
  if (checking) {
    return 'checking';
  }
  if (gateResult) {
    return 'result';
  }
  return 'idle';
}
