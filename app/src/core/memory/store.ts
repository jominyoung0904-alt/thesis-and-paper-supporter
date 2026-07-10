/**
 * JSON-file-backed store for a single project's memory (FR-MEM-001/002/004).
 *
 * Design decision 1 (SPEC-TSA-001): the on-disk format is plain JSON —
 * portable and human-readable so a user can inspect or hand-edit it, and the
 * data volume in stage 1 is small enough that a lightweight DB brings no
 * meaningful benefit.
 *
 * Path resolution is the caller's responsibility (see src/main/paths.ts for
 * the `data/` root); this class only takes the final file path.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  AdvisorFeedback,
  AdvisorFeedbackStatus,
  CreateAdvisorFeedbackInput,
  CreateHypothesisInput,
  CreateResearchDecisionInput,
  CreateResearchQuestionInput,
  CreateTermDefinitionInput,
  Hypothesis,
  ProjectMemory,
  ResearchDecision,
  ResearchQuestion,
  TermDefinition,
} from './model';
import {
  createAdvisorFeedback,
  createEmptyProjectMemory,
  createHypothesis,
  createResearchDecision,
  createResearchProject,
  createResearchQuestion,
  createTermDefinition,
  isProjectMemory,
} from './model';

export type MemoryLoadStatus = 'created' | 'loaded' | 'recovered';

export interface MemoryLoadResult {
  status: MemoryLoadStatus;
  /** Present only when status is 'recovered': where the corrupted file was preserved. */
  backupPath?: string;
}

const DEFAULT_PROJECT_TITLE = '제목 없는 프로젝트';

/**
 * In-memory working copy of a ProjectMemory backed by a single JSON file.
 * Mutations (add/update/remove) apply immediately in memory; call `save()`
 * to persist them atomically to disk.
 */
export class MemoryStore {
  private readonly filePath: string;
  private readonly defaultProjectTitle: string;
  private memory: ProjectMemory;

  constructor(filePath: string, defaultProjectTitle: string = DEFAULT_PROJECT_TITLE) {
    this.filePath = filePath;
    this.defaultProjectTitle = defaultProjectTitle;
    this.memory = createEmptyProjectMemory(createResearchProject({ title: defaultProjectTitle }));
  }

  /**
   * Loads memory from disk. Creates a fresh empty memory when the file does
   * not exist yet. When the file exists but cannot be parsed as JSON or does
   * not match the expected shape, the corrupted file is preserved as
   * `<file>.bak` and a fresh empty memory is used instead (never throws on
   * corruption — the app must stay usable).
   */
  load(): MemoryLoadResult {
    if (!existsSync(this.filePath)) {
      return { status: 'created' };
    }

    const raw = readFileSync(this.filePath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.recoverFromCorruption();
    }

    if (!isProjectMemory(parsed)) {
      return this.recoverFromCorruption();
    }

    this.memory = parsed;
    return { status: 'loaded' };
  }

  private recoverFromCorruption(): MemoryLoadResult {
    const backupPath = `${this.filePath}.bak`;
    renameSync(this.filePath, backupPath);
    this.memory = createEmptyProjectMemory(createResearchProject({ title: this.defaultProjectTitle }));
    return { status: 'recovered', backupPath };
  }

  /** Atomically persists the current in-memory state: write to a temp file, then rename over the target. */
  save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.memory, null, 2), 'utf-8');
    renameSync(tmpPath, this.filePath);
  }

  /**
   * The only read interface downstream consumers (T12 LLM context
   * serialization, T30 chat) should use. Returns a deep copy so callers can
   * never mutate the store's internal state through the snapshot.
   */
  getSnapshot(): Readonly<ProjectMemory> {
    return JSON.parse(JSON.stringify(this.memory)) as ProjectMemory;
  }

  // --- Research questions ---
  addResearchQuestion(input: CreateResearchQuestionInput): ResearchQuestion {
    return this.addItem(this.memory.researchQuestions, createResearchQuestion(input));
  }
  updateResearchQuestion(id: string, patch: Partial<ResearchQuestion>): ResearchQuestion | undefined {
    return this.updateItem(this.memory.researchQuestions, id, patch);
  }
  removeResearchQuestion(id: string): boolean {
    return this.removeItem(this.memory.researchQuestions, id);
  }
  listResearchQuestions(): ResearchQuestion[] {
    return [...this.memory.researchQuestions];
  }

  // --- Hypotheses ---
  addHypothesis(input: CreateHypothesisInput): Hypothesis {
    return this.addItem(this.memory.hypotheses, createHypothesis(input));
  }
  updateHypothesis(id: string, patch: Partial<Hypothesis>): Hypothesis | undefined {
    return this.updateItem(this.memory.hypotheses, id, patch);
  }
  removeHypothesis(id: string): boolean {
    return this.removeItem(this.memory.hypotheses, id);
  }
  listHypotheses(): Hypothesis[] {
    return [...this.memory.hypotheses];
  }

  // --- Term definitions ---
  addTermDefinition(input: CreateTermDefinitionInput): TermDefinition {
    return this.addItem(this.memory.termDefinitions, createTermDefinition(input));
  }
  updateTermDefinition(id: string, patch: Partial<TermDefinition>): TermDefinition | undefined {
    return this.updateItem(this.memory.termDefinitions, id, patch);
  }
  removeTermDefinition(id: string): boolean {
    return this.removeItem(this.memory.termDefinitions, id);
  }
  listTermDefinitions(): TermDefinition[] {
    return [...this.memory.termDefinitions];
  }

  // --- Research decisions (FR-MEM-002: what/why required — enforced in createResearchDecision) ---
  addDecision(input: CreateResearchDecisionInput): ResearchDecision {
    return this.addItem(this.memory.decisions, createResearchDecision(input));
  }
  updateDecision(id: string, patch: Partial<ResearchDecision>): ResearchDecision | undefined {
    return this.updateItem(this.memory.decisions, id, patch);
  }
  removeDecision(id: string): boolean {
    return this.removeItem(this.memory.decisions, id);
  }
  listDecisions(): ResearchDecision[] {
    return [...this.memory.decisions];
  }

  // --- Advisor feedback (FR-MEM-007: tracks pending/addressed status) ---
  addAdvisorFeedback(input: CreateAdvisorFeedbackInput): AdvisorFeedback {
    return this.addItem(this.memory.advisorFeedback, createAdvisorFeedback(input));
  }
  updateAdvisorFeedbackStatus(
    id: string,
    status: AdvisorFeedbackStatus,
    response?: string,
  ): AdvisorFeedback | undefined {
    const patch: Partial<AdvisorFeedback> = { status };
    if (response !== undefined) {
      patch.response = response;
    }
    return this.updateItem(this.memory.advisorFeedback, id, patch);
  }
  removeAdvisorFeedback(id: string): boolean {
    return this.removeItem(this.memory.advisorFeedback, id);
  }
  listAdvisorFeedback(): AdvisorFeedback[] {
    return [...this.memory.advisorFeedback];
  }

  // --- Generic collection helpers shared by every collection above ---
  private addItem<T>(list: T[], item: T): T {
    list.push(item);
    this.touchProject();
    return item;
  }

  private updateItem<T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T | undefined {
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return undefined;
    const current = list[index];
    if (!current) return undefined;

    const updated: T = { ...current, ...patch, id: current.id };
    list[index] = updated;
    this.touchProject();
    return updated;
  }

  private removeItem<T extends { id: string }>(list: T[], id: string): boolean {
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return false;
    list.splice(index, 1);
    this.touchProject();
    return true;
  }

  private touchProject(): void {
    this.memory.project.updatedAt = new Date().toISOString();
  }
}
