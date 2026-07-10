/**
 * Domain model for the research project memory core (FR-MEM-001/002/004).
 *
 * This is the shared context every later LLM call (deep research, writing
 * assistant, chat) reads through the store's `getSnapshot()` — see T12
 * (context serialization) and T30 (chat). All string fields hold free-form
 * user content and MUST be treated as untrusted text by downstream consumers
 * (no direct HTML/SQL interpolation, etc.).
 */

import { randomUUID } from 'node:crypto';

/** Bump when the on-disk shape of `ProjectMemory` changes incompatibly. */
export const MEMORY_SCHEMA_VERSION = 1;

/** Raised when a create*() factory rejects invalid input (e.g. FR-MEM-002). */
export class MemoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryValidationError';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface ResearchProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResearchProjectInput {
  title: string;
  id?: string;
}

export function createResearchProject(input: CreateResearchProjectInput): ResearchProject {
  const timestamp = nowIso();
  return { id: input.id ?? randomUUID(), title: input.title, createdAt: timestamp, updatedAt: timestamp };
}

export type ResearchQuestionStatus = 'active' | 'archived';

export interface ResearchQuestion {
  id: string;
  text: string;
  status: ResearchQuestionStatus;
  createdAt: string;
}

export interface CreateResearchQuestionInput {
  text: string;
  status?: ResearchQuestionStatus;
}

export function createResearchQuestion(input: CreateResearchQuestionInput): ResearchQuestion {
  return { id: randomUUID(), text: input.text, status: input.status ?? 'active', createdAt: nowIso() };
}

export interface Hypothesis {
  id: string;
  text: string;
  relatedQuestionId?: string;
  createdAt: string;
}

export interface CreateHypothesisInput {
  text: string;
  relatedQuestionId?: string;
}

export function createHypothesis(input: CreateHypothesisInput): Hypothesis {
  return {
    id: randomUUID(),
    text: input.text,
    relatedQuestionId: input.relatedQuestionId,
    createdAt: nowIso(),
  };
}

export interface TermDefinition {
  id: string;
  term: string;
  definition: string;
  source?: string;
  createdAt: string;
}

export interface CreateTermDefinitionInput {
  term: string;
  definition: string;
  source?: string;
}

export function createTermDefinition(input: CreateTermDefinitionInput): TermDefinition {
  return {
    id: randomUUID(),
    term: input.term,
    definition: input.definition,
    source: input.source,
    createdAt: nowIso(),
  };
}

export type ResearchDecisionSource = 'chat' | 'manual';

/** FR-MEM-002: a research decision always records both "what" and "why". */
export interface ResearchDecision {
  id: string;
  what: string;
  why: string;
  decidedAt: string;
  source: ResearchDecisionSource;
  relatedIds?: string[];
}

export interface CreateResearchDecisionInput {
  what: string;
  why: string;
  source?: ResearchDecisionSource;
  relatedIds?: string[];
}

/**
 * Builds a validated ResearchDecision. FR-MEM-002 requires both `what` and
 * `why` to be present — this rejects empty/whitespace-only strings so a
 * decision can never be recorded without its rationale.
 */
export function createResearchDecision(input: CreateResearchDecisionInput): ResearchDecision {
  const what = input.what.trim();
  const why = input.why.trim();

  if (!what) {
    throw new MemoryValidationError('연구 결정에는 "무엇을 결정했는가"가 반드시 필요합니다.');
  }
  if (!why) {
    throw new MemoryValidationError('연구 결정에는 "왜 그렇게 결정했는가"가 반드시 필요합니다.');
  }

  return {
    id: randomUUID(),
    what,
    why,
    decidedAt: nowIso(),
    source: input.source ?? 'manual',
    relatedIds: input.relatedIds,
  };
}

export type AdvisorFeedbackStatus = 'pending' | 'addressed';

export interface AdvisorFeedback {
  id: string;
  content: string;
  receivedAt: string;
  status: AdvisorFeedbackStatus;
  response?: string;
}

export interface CreateAdvisorFeedbackInput {
  content: string;
  status?: AdvisorFeedbackStatus;
  response?: string;
}

export function createAdvisorFeedback(input: CreateAdvisorFeedbackInput): AdvisorFeedback {
  return {
    id: randomUUID(),
    content: input.content,
    receivedAt: nowIso(),
    status: input.status ?? 'pending',
    response: input.response,
  };
}

/** The full project memory: everything a downstream LLM call may need as context. */
export interface ProjectMemory {
  schemaVersion: number;
  project: ResearchProject;
  researchQuestions: ResearchQuestion[];
  hypotheses: Hypothesis[];
  termDefinitions: TermDefinition[];
  decisions: ResearchDecision[];
  advisorFeedback: AdvisorFeedback[];
}

/** Builds a fresh, empty ProjectMemory around an already-created project record. */
export function createEmptyProjectMemory(project: ResearchProject): ProjectMemory {
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    project,
    researchQuestions: [],
    hypotheses: [],
    termDefinitions: [],
    decisions: [],
    advisorFeedback: [],
  };
}

/**
 * Runtime shape check used by MemoryStore.load() to decide whether a JSON
 * file on disk is a well-formed ProjectMemory or should be treated as
 * corrupted (backed up + replaced with a fresh empty memory).
 */
export function isProjectMemory(value: unknown): value is ProjectMemory {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.schemaVersion !== 'number') return false;

  if (typeof candidate.project !== 'object' || candidate.project === null) return false;
  const project = candidate.project as Record<string, unknown>;
  if (typeof project.id !== 'string' || typeof project.title !== 'string') return false;

  return (
    Array.isArray(candidate.researchQuestions) &&
    Array.isArray(candidate.hypotheses) &&
    Array.isArray(candidate.termDefinitions) &&
    Array.isArray(candidate.decisions) &&
    Array.isArray(candidate.advisorFeedback)
  );
}
