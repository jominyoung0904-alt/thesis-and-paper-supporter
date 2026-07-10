/**
 * Deep-research detailed mode ("상세검색") — checkpoint integration.
 *
 * The detailed second pass persists a 'detailed-screening' checkpoint holding
 * the MERGED first+second set, so a report failure resumes straight to report
 * without re-running the augmentation search or screening. Split from
 * `researchPipelineDetailed.test.ts` to stay under the 300-line file limit.
 */

import { describe, expect, it } from 'vitest';

import type { CheckpointState } from '../../src/core/research-pipeline/checkpoint';
import { paper } from './researchPipelineTestHelpers';
import { AUGMENT_TERMS, createMemoryCheckpoint, makeLlm, run, termClient } from './researchPipelineDetailedHelpers';

describe('runDeepResearch — detailed mode checkpointing', () => {
  it('saves a "detailed-screening" checkpoint holding the merged set, then clears on success', async () => {
    const { adapter } = makeLlm(AUGMENT_TERMS);
    const first = paper({ title: '1차 논문' });
    const second = paper({ title: '보강 논문' });
    const kci = termClient('kci', {
      국문검색어1: [first],
      국문검색어2: [first],
      보강국문1: [second],
      보강국문2: [second],
    });
    const checkpoint = createMemoryCheckpoint();

    await run({ question: 'q', llm: adapter, clients: [kci], detailed: true, checkpoint: checkpoint.hooks });

    const stages = checkpoint.saved.map((s) => s.completedStage);
    expect(stages).toEqual(['searching', 'screening', 'detailed-screening']);
    const merged = checkpoint.saved.find((s) => s.completedStage === 'detailed-screening');
    expect(merged?.screened?.map((s) => s.paper.title)).toEqual(['1차 논문', '보강 논문']);
    expect(checkpoint.state).toBeNull(); // cleared on success
  });

  it('resumes from a "detailed-screening" checkpoint straight to report, running no new searches or screening', async () => {
    const question = 'q';
    const log: string[] = [];
    const kci = termClient('kci', {}, log);
    const { adapter, calls } = makeLlm(AUGMENT_TERMS);
    const seeded: CheckpointState = {
      version: 2,
      savedAt: new Date().toISOString(),
      question,
      queries: { ko: ['국문검색어1', '보강국문1'], en: ['english one', 'aug eng1'] },
      papers: [paper({ title: '1차 논문' }), paper({ title: '보강 논문' })],
      failedSources: [],
      screened: [
        { paper: paper({ title: '1차 논문' }), relevance: 'high' },
        { paper: paper({ title: '보강 논문' }), relevance: 'high' },
      ],
      completedStage: 'detailed-screening',
    };
    const checkpoint = createMemoryCheckpoint(seeded);
    const stages: string[] = [];

    const result = await run({
      question,
      llm: adapter,
      clients: [kci],
      detailed: true,
      checkpoint: checkpoint.hooks,
      onProgress: (e) => stages.push(e.stage),
    });

    expect(result.papers).toHaveLength(2);
    expect(log).toEqual([]); // no academic search re-run
    expect(calls.filter((c) => c.stage === 'screening')).toHaveLength(0); // no screening re-run
    expect(calls.filter((c) => c.stage === 'augment')).toHaveLength(0); // no augmentation re-run
    expect(stages).toEqual(['report']); // only report ran
  });
});
