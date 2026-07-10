/**
 * Section quality-gate definitions (FR-WRT-001, FR-WRT-007).
 *
 * A `SectionGateDefinition` is a pure data description of what "done" means
 * for one paper section. `runQualityGate` (qualityGate.ts) is the single
 * generic engine that evaluates any such definition, so adding a new section
 * (body, conclusion, ...) later only requires adding a definition here — no
 * new evaluation code (FR-WRT-007: same interface, reused as-is).
 */

/** How a single criterion is checked: by an LLM judgment call, or by local code. */
export type GateCheckKind = 'llm' | 'rule';

/** One acceptance criterion within a section's quality gate. */
export interface GateCriterion {
  /** Stable id, referenced by `CriterionResult.criterionId` and the rule registry. */
  id: string;
  /** Short Korean label shown in the UI. */
  label: string;
  /** Longer Korean description of what "passing" means; also fed to the LLM prompt. */
  description: string;
  /** Whether this criterion is judged by the LLM or by a deterministic rule. */
  check: GateCheckKind;
}

/** A full quality-gate definition for one paper section. */
export interface SectionGateDefinition {
  /** Stable section id, e.g. 'introduction'. */
  sectionId: string;
  /** Korean display label, e.g. '서론'. */
  sectionLabel: string;
  criteria: GateCriterion[];
}

/**
 * The only concrete gate definition shipped in phase 1 (FR-WRT-001). Body
 * and conclusion definitions (FR-WRT-007) can be added the same way later —
 * they only need to plug into `runQualityGate` and, for any new rule-based
 * criterion, a matching checker in `qualityGate.ts`'s rule registry.
 */
export const introductionGateDefinition: SectionGateDefinition = {
  sectionId: 'introduction',
  sectionLabel: '서론',
  criteria: [
    {
      id: 'research-gap',
      label: '연구 갭 명시',
      description:
        '선행연구의 한계나 다루지 못한 빈틈이 문장으로 명확히 드러나는가. ' +
        '단순히 주제나 배경을 소개하는 것만으로는 충족되지 않는다.',
      check: 'llm',
    },
    {
      id: 'contribution',
      label: '기여 명시',
      description: '이 연구가 선행연구 대비 무엇을 새로 더하는지(기여)가 문장으로 명시되어 있는가.',
      check: 'llm',
    },
    {
      id: 'citation-presence',
      label: '인용 존재',
      description:
        '문단 수 대비 최소한의 인용 표기((저자, 연도), [n], 각주 등)가 포함되어 있는가. ' +
        '인용이 하나도 없으면 항상 미충족이다.',
      check: 'rule',
    },
  ],
};
