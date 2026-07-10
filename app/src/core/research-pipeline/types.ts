/**
 * Shared types and small utilities for the deep-research pipeline
 * (FR-RES-001~006, FR-RES-009).
 *
 * The pipeline is a pure orchestrator: it depends only on the injected
 * `LlmAdapter` and `AcademicClient` contracts and never touches a vendor SDK
 * or the network directly. All bibliographic data flows from
 * `PaperMetadata` (the deterministic academic-API source) — the LLM is only
 * ever asked for search terms, relevance labels, and prose, never for
 * citations (FR-RES-005).
 */

import type { LlmAdapter, LlmResponse } from '../llm';
import type { AcademicClient, AcademicSource, PaperMetadata, SearchFailureReason } from '../academic-api/types';
import type { SerializedMemory } from '../memory/serializer';

/** Relevance verdict assigned by the screening step (FR-RES-003). */
export type RelevanceLabel = 'high' | 'medium' | 'low';

/** A paper paired with its screening verdict. */
export interface ScreenedPaper {
  paper: PaperMetadata;
  relevance: RelevanceLabel;
}

/** A source whose lookup failed, kept as data for transparent reporting (FR-RES-009). */
export interface FailedSource {
  source: AcademicSource;
  reason: SearchFailureReason;
}

/** Search terms produced by the query-generation step (FR-RES-001). */
export interface GeneratedQueries {
  ko: string[];
  en: string[];
}

/** Coarse pipeline stages surfaced to the UI and (later, T16) the checkpoint store. */
export type PipelineStage = 'query-gen' | 'searching' | 'screening' | 'report';

/** A progress signal emitted at each stage boundary. */
export interface ProgressEvent {
  stage: PipelineStage;
  detail?: string;
}

/** Aggregated LLM usage across the whole run (consumed by T28/T31 budgeting). */
export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/** Dependency-injected input for a single deep-research run. */
export interface DeepResearchInput {
  /** The user's free-text prior-research question. */
  question: string;
  /** Serialized project memory, auto-injected into every prompt (FR-MEM-003). */
  memory: SerializedMemory;
  /** Primary LLM used for query-gen and report assembly. */
  llm: LlmAdapter;
  /** Optional lighter model for screening; falls back to {@link llm} when omitted. */
  screeningLlm?: LlmAdapter;
  /** Academic clients to fan out across (KCI/ScienceON=ko, SemanticScholar=en). */
  clients: AcademicClient[];
  /** Model id for {@link llm}. */
  model: string;
  /** Model id for {@link screeningLlm}; falls back to {@link model} when omitted. */
  screeningModel?: string;
  /** Optional progress callback; the join point for T16 checkpointing. */
  onProgress?: (event: ProgressEvent) => void;
}

/** The full result of a deep-research run. */
export interface DeepResearchResult {
  report: string;
  papers: ScreenedPaper[];
  queries: GeneratedQueries;
  failedSources: FailedSource[];
  usage: UsageTotals;
}

/**
 * Human-readable Korean labels for each academic source, used in references.
 * `googlecse` is kept for backward compatibility with reports/papers already
 * saved from before SPEC-TSA-001 후속 T33 (Google CSE closed to new
 * customers and replaced by `naverdoc`) — it is no longer assembled into a
 * real client, see `academicClients.ts`.
 */
export const SOURCE_LABELS: Record<AcademicSource, string> = {
  kci: 'KCI',
  scienceon: 'ScienceON',
  semanticscholar: 'Semantic Scholar',
  openalex: '국내외 통합(OpenAlex)',
  googlecse: '학위논문(RISS·구글 검색)',
  naverdoc: '학위논문·보고서(네이버 전문정보)',
};

/** Korean labels for search-failure reasons, used in the transparency paragraph. */
export const FAILURE_REASON_LABELS: Record<SearchFailureReason, string> = {
  network: '네트워크 오류',
  auth: '인증 오류',
  'rate-limit': '호출 한도 초과',
  parse: '응답 형식 오류',
  timeout: '응답 시간 초과',
};

/** Creates a zeroed usage accumulator. */
export function createUsage(): UsageTotals {
  return { calls: 0, inputTokens: 0, outputTokens: 0 };
}

/** Folds one LLM response into the running usage totals (mutates in place). */
export function addUsage(totals: UsageTotals, response: LlmResponse): void {
  totals.calls += 1;
  totals.inputTokens += response.usage.inputTokens;
  totals.outputTokens += response.usage.outputTokens;
}

/**
 * Best-effort extraction of a single JSON object/array from an LLM response.
 *
 * Models routinely wrap JSON in prose or ```json fences, so we (1) prefer a
 * fenced block when present, then (2) slice from the first `{`/`[` to the last
 * matching bracket and attempt a parse. Returns `null` on any failure so the
 * caller can apply its own conservative fallback rather than throwing.
 */
export function parseJsonLoose(text: string): unknown | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1] ?? text;
  const objStart = body.indexOf('{');
  const arrStart = body.indexOf('[');
  // Try whichever bracket appears first — that is the outermost structure.
  // (An array-shaped screening response must not have its inner object sliced out.)
  const arrayFirst = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
  const brackets: ReadonlyArray<readonly [string, string]> = arrayFirst
    ? [
        ['[', ']'],
        ['{', '}'],
      ]
    : [
        ['{', '}'],
        ['[', ']'],
      ];
  for (const [open, close] of brackets) {
    const start = body.indexOf(open);
    const end = body.lastIndexOf(close);
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        // Fall through to the next bracket shape.
      }
    }
  }
  return null;
}

/** Re-exported here so orchestration code can import client typing from one module. */
export type { AcademicClient, PaperMetadata };
