import { describe, expect, it } from 'vitest';

import type { GateResult } from '../../src/core/writing/qualityGate';
import {
  isMarkCompleteEnabled,
  isRunCheckEnabled,
  resolveGateViewPhase,
  shouldShowOverride,
  sortCriteriaForDisplay,
} from '../../src/renderer/writing/gateViewLogic';

const passedResult: GateResult = {
  sectionId: 'introduction',
  passed: true,
  results: [
    { criterionId: 'research-gap', passed: true, feedback: '연구 갭이 명확해요.' },
    { criterionId: 'contribution', passed: true, feedback: '기여가 명확해요.' },
  ],
  summary: '서론 섹션이 2개 기준을 모두 충족했어요.',
};

const failedResult: GateResult = {
  sectionId: 'introduction',
  passed: false,
  results: [
    { criterionId: 'research-gap', passed: true, feedback: '연구 갭이 명확해요.' },
    { criterionId: 'contribution', passed: false, feedback: '기여가 불명확해요.' },
    { criterionId: 'citation-presence', passed: false, feedback: '인용이 부족해요.' },
  ],
  summary: '3개 기준 중 1개를 충족했어요. 기여 명시을(를) 보완해 주세요.',
};

describe('isRunCheckEnabled', () => {
  it('is enabled when not currently checking', () => {
    expect(isRunCheckEnabled(false)).toBe(true);
  });

  it('is disabled while a check is in progress', () => {
    expect(isRunCheckEnabled(true)).toBe(false);
  });
});

describe('isMarkCompleteEnabled', () => {
  it('is disabled when there is no result yet', () => {
    expect(isMarkCompleteEnabled(null, false, false)).toBe(false);
  });

  it('is disabled while checking, even with a stale prior result', () => {
    expect(isMarkCompleteEnabled(passedResult, true, false)).toBe(false);
  });

  it('is enabled when the gate passed, regardless of the override checkbox', () => {
    expect(isMarkCompleteEnabled(passedResult, false, false)).toBe(true);
    expect(isMarkCompleteEnabled(passedResult, false, true)).toBe(true);
  });

  it('is disabled on a failed gate until the override checkbox is checked', () => {
    expect(isMarkCompleteEnabled(failedResult, false, false)).toBe(false);
  });

  it('is enabled on a failed gate once the override checkbox is checked', () => {
    expect(isMarkCompleteEnabled(failedResult, false, true)).toBe(true);
  });
});

describe('shouldShowOverride', () => {
  it('is false when there is no result yet', () => {
    expect(shouldShowOverride(null, false)).toBe(false);
  });

  it('is false while checking', () => {
    expect(shouldShowOverride(failedResult, true)).toBe(false);
  });

  it('is false when the gate passed', () => {
    expect(shouldShowOverride(passedResult, false)).toBe(false);
  });

  it('is true when the gate failed and checking has finished', () => {
    expect(shouldShowOverride(failedResult, false)).toBe(true);
  });
});

describe('sortCriteriaForDisplay', () => {
  it('moves failed criteria before passed criteria', () => {
    const sorted = sortCriteriaForDisplay(failedResult.results);
    expect(sorted.map((r) => r.passed)).toEqual([false, false, true]);
  });

  it('preserves relative order within the same passed/failed group (stable sort)', () => {
    const sorted = sortCriteriaForDisplay(failedResult.results);
    expect(sorted.map((r) => r.criterionId)).toEqual(['contribution', 'citation-presence', 'research-gap']);
  });

  it('does not mutate the input array', () => {
    const original = [...failedResult.results];
    sortCriteriaForDisplay(failedResult.results);
    expect(failedResult.results).toEqual(original);
  });

  it('returns all-passed results unchanged in order', () => {
    const sorted = sortCriteriaForDisplay(passedResult.results);
    expect(sorted.map((r) => r.criterionId)).toEqual(['research-gap', 'contribution']);
  });
});

describe('resolveGateViewPhase', () => {
  it('is idle when there is no result and not checking', () => {
    expect(resolveGateViewPhase(null, false)).toBe('idle');
  });

  it('is checking whenever checking is true, even with a stale result', () => {
    expect(resolveGateViewPhase(passedResult, true)).toBe('checking');
  });

  it('is result once a gate result exists and checking has finished', () => {
    expect(resolveGateViewPhase(passedResult, false)).toBe('result');
    expect(resolveGateViewPhase(failedResult, false)).toBe('result');
  });
});
