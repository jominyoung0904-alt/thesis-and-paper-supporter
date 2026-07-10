/**
 * Korean-language progress copy for deep-research runs (FR-RES progress
 * display). Framework-free so it can be unit tested without a DOM.
 *
 * Stage ids mirror `PipelineStage` in `src/core/research-pipeline/types.ts`
 * ('query-gen' | 'searching' | 'screening' | 'report'), but this map is kept
 * as a plain `string` key so the UI degrades gracefully (falls back to a
 * generic "처리 중" label) if the core pipeline ever adds a stage this
 * screen doesn't know about yet.
 */

const RESEARCH_STAGE_ORDER = ['query-gen', 'searching', 'screening', 'report'] as const;

type KnownResearchStage = (typeof RESEARCH_STAGE_ORDER)[number];

const RESEARCH_STAGE_LABELS: Record<KnownResearchStage, string> = {
  'query-gen': '검색어를 만들고 있어요',
  searching: '학술 데이터베이스를 찾아보는 중이에요 (2~3분 정도 걸려요)',
  screening: '관련도를 살펴보는 중이에요',
  report: '리포트를 정리하고 있어요',
};

const FALLBACK_STAGE_LABEL = '처리하고 있어요...';

function isKnownStage(stage: string): stage is KnownResearchStage {
  return (RESEARCH_STAGE_ORDER as readonly string[]).includes(stage);
}

/** Korean-language label for a research-pipeline stage id. Unknown stages get a generic fallback. */
export function researchStageLabel(stage: string): string {
  return isKnownStage(stage) ? RESEARCH_STAGE_LABELS[stage] : FALLBACK_STAGE_LABEL;
}

/** 0-based position of `stage` in the canonical stage order, for a "N / total" indicator. Unknown stages are 0. */
export function researchStageIndex(stage: string): number {
  const index = RESEARCH_STAGE_ORDER.indexOf(stage as KnownResearchStage);
  return index === -1 ? 0 : index;
}

/** Total number of known stages, for a "N / total" indicator. */
export const RESEARCH_STAGE_COUNT = RESEARCH_STAGE_ORDER.length;
