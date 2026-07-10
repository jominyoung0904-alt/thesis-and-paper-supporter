/**
 * Deep-research detailed mode ("상세검색", `input.detailed`) — behavior.
 *
 * Covers the paid-mode second pass: an augmentation search + screen that runs
 * after the standard first pass, keeps only papers the first pass missed,
 * screens just those, merges the verdicts, and stays within the ≤3-extra-LLM
 * -call budget. Also asserts the default (detailed omitted/false) preserves the
 * exact single-pass behavior. Checkpoint integration lives in the sibling
 * `researchPipelineDetailedCheckpoint.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { paper } from './researchPipelineTestHelpers';
import { AUGMENT_TERMS, FIRST_EN, FIRST_KO, makeLlm, run, termClient } from './researchPipelineDetailedHelpers';

describe('runDeepResearch — detailed mode (상세검색)', () => {
  it('runs a second augmentation pass, dedups against the first pass, and screens only new papers', async () => {
    const { adapter, calls } = makeLlm(AUGMENT_TERMS);
    const first = paper({ title: '1차 논문' });
    const second = paper({ title: '보강 논문' });
    const kci = termClient('kci', {
      국문검색어1: [first],
      국문검색어2: [first],
      보강국문1: [second],
      보강국문2: [second],
    });

    const result = await run({ llm: adapter, clients: [kci], detailed: true });

    expect(result.papers.map((p) => p.paper.title)).toEqual(['1차 논문', '보강 논문']);
    // Augmentation queries are merged into the reported query set.
    expect(result.queries.ko).toEqual(['국문검색어1', '국문검색어2', '보강국문1', '보강국문2']);
    // Exactly one augmentation query-gen call (no retry — budget bound).
    expect(calls.filter((c) => c.stage === 'augment')).toHaveLength(1);
    // Two screening calls: the first pass, then the new-papers-only second pass.
    const screeningCalls = calls.filter((c) => c.stage === 'screening');
    expect(screeningCalls).toHaveLength(2);
    expect(screeningCalls[1]?.content).toContain('보강 논문');
    expect(screeningCalls[1]?.content).not.toContain('1차 논문');
  });

  it('excludes second-pass papers whose title duplicates a first-pass paper', async () => {
    const { adapter, calls } = makeLlm(AUGMENT_TERMS);
    const first = paper({ title: '중복 제목 논문' });
    const dupOfFirst = paper({ title: '중복 제목 논문!!!  ', externalId: 'other' });
    const genuinelyNew = paper({ title: '진짜 새 논문' });
    const kci = termClient('kci', {
      국문검색어1: [first],
      국문검색어2: [first],
      보강국문1: [dupOfFirst],
      보강국문2: [genuinelyNew],
    });

    const result = await run({ llm: adapter, clients: [kci], detailed: true });

    expect(result.papers.map((p) => p.paper.title)).toEqual(['중복 제목 논문', '진짜 새 논문']);
    const secondScreening = calls.filter((c) => c.stage === 'screening')[1];
    expect(secondScreening?.content).toContain('진짜 새 논문');
    expect(secondScreening?.content).not.toContain('중복 제목 논문');
  });

  it('skips the second search when every augmentation term merely duplicates a first-pass term', async () => {
    const dupAugment = JSON.stringify({ ko: FIRST_KO, en: FIRST_EN });
    const { adapter, calls } = makeLlm(dupAugment);
    const log: string[] = [];
    const first = paper({ title: '1차 논문' });
    const kci = termClient('kci', { 국문검색어1: [first], 국문검색어2: [first] }, log);

    const result = await run({ llm: adapter, clients: [kci], detailed: true });

    expect(result.papers.map((p) => p.paper.title)).toEqual(['1차 논문']);
    expect(calls.filter((c) => c.stage === 'augment')).toHaveLength(1); // the call happened
    expect(calls.filter((c) => c.stage === 'screening')).toHaveLength(1); // but no second screening
    expect(log).toEqual(['국문검색어1', '국문검색어2']); // and no second search
  });

  it('skips the second screening when the augmentation search finds no genuinely new papers', async () => {
    const { adapter, calls } = makeLlm(AUGMENT_TERMS);
    const first = paper({ title: '1차 논문' });
    const kci = termClient('kci', {
      국문검색어1: [first],
      국문검색어2: [first],
      보강국문1: [], // augmentation search returns nothing usable
      보강국문2: [],
    });

    const result = await run({ llm: adapter, clients: [kci], detailed: true });

    expect(result.papers).toHaveLength(1);
    expect(calls.filter((c) => c.stage === 'screening')).toHaveLength(1);
    // Augmentation queries are still merged even when they yield no new papers.
    expect(result.queries.ko).toContain('보강국문1');
  });

  it('caps additional LLM calls at 3: augmentation query-gen (1) + new-paper screening (≤2 batches)', async () => {
    const { adapter, calls } = makeLlm(AUGMENT_TERMS);
    const first = paper({ title: '1차 논문' });
    const manyNew = Array.from({ length: 50 }, (_, i) => paper({ title: `보강 논문 ${i}` }));
    const kci = termClient('kci', {
      국문검색어1: [first],
      국문검색어2: [first],
      보강국문1: manyNew,
      보강국문2: [],
    });

    const result = await run({ llm: adapter, clients: [kci], detailed: true });

    // 50 new papers are capped to 40 (two screening batches) → 41 total.
    expect(result.papers).toHaveLength(41);
    const additional =
      calls.filter((c) => c.stage === 'augment').length +
      calls.filter((c) => c.stage === 'screening').length -
      1; // minus the first-pass screening call
    expect(additional).toBeLessThanOrEqual(3);
    expect(additional).toBe(3); // augment(1) + two second-pass batches(2)
  });

  it('emits detailed-pass progress with the "상세검색" Korean prefix on existing stages', async () => {
    const { adapter } = makeLlm(AUGMENT_TERMS);
    const first = paper({ title: '1차 논문' });
    const second = paper({ title: '보강 논문' });
    const kci = termClient('kci', {
      국문검색어1: [first],
      국문검색어2: [first],
      보강국문1: [second],
      보강국문2: [second],
    });
    const details: string[] = [];

    await run({ llm: adapter, clients: [kci], detailed: true, onProgress: (e) => details.push(e.detail ?? '') });

    expect(details.some((d) => d.startsWith('상세검색: 보강 검색 중'))).toBe(true);
    expect(details.some((d) => d.startsWith('상세검색: 새로 찾은'))).toBe(true);
  });

  it('does NOT run any augmentation pass when detailed is false (behavior unchanged)', async () => {
    const { adapter, calls } = makeLlm(AUGMENT_TERMS);
    const first = paper({ title: '1차 논문' });
    const kci = termClient('kci', { 국문검색어1: [first], 국문검색어2: [first] });

    const result = await run({ llm: adapter, clients: [kci], detailed: false });

    expect(result.papers).toHaveLength(1);
    expect(calls.filter((c) => c.stage === 'augment')).toHaveLength(0);
    expect(calls.filter((c) => c.stage === 'screening')).toHaveLength(1);
  });
});
