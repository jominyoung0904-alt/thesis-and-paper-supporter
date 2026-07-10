import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MemoryValidationError } from '../../src/core/memory/model';
import { MemoryStore } from '../../src/core/memory/store';

describe('MemoryStore', () => {
  let workDir: string;
  let memoryFile: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-memory-test-'));
    memoryFile = join(workDir, 'projects', 'p1', 'memory.json');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('returns "created" and starts with an empty memory when the file does not exist', () => {
      const store = new MemoryStore(memoryFile);

      const result = store.load();

      expect(result.status).toBe('created');
      const snapshot = store.getSnapshot();
      expect(snapshot.researchQuestions).toEqual([]);
      expect(snapshot.decisions).toEqual([]);
      expect(snapshot.project.title).toBe('제목 없는 프로젝트');
    });

    it('returns "loaded" and restores previously saved data on a fresh instance', () => {
      const first = new MemoryStore(memoryFile);
      first.load();
      first.addResearchQuestion({ text: '연구 질문 1' });
      first.save();

      const second = new MemoryStore(memoryFile);
      const result = second.load();

      expect(result.status).toBe('loaded');
      expect(second.listResearchQuestions()).toHaveLength(1);
      expect(second.listResearchQuestions()[0]?.text).toBe('연구 질문 1');
    });

    it('recovers from an unparsable (invalid JSON) file, preserving it as .bak', () => {
      mkdirSync(dirname(memoryFile), { recursive: true });
      writeFileSync(memoryFile, '{ this is not valid json', 'utf-8');

      const store = new MemoryStore(memoryFile);
      const result = store.load();

      expect(result.status).toBe('recovered');
      expect(result.backupPath).toBe(`${memoryFile}.bak`);
      expect(existsSync(`${memoryFile}.bak`)).toBe(true);
      expect(readFileSync(`${memoryFile}.bak`, 'utf-8')).toBe('{ this is not valid json');
      expect(store.getSnapshot().researchQuestions).toEqual([]);
    });

    it('recovers from a well-formed JSON file that does not match the ProjectMemory shape', () => {
      mkdirSync(dirname(memoryFile), { recursive: true });
      writeFileSync(memoryFile, JSON.stringify({ hello: 'world' }), 'utf-8');

      const store = new MemoryStore(memoryFile);
      const result = store.load();

      expect(result.status).toBe('recovered');
      expect(existsSync(`${memoryFile}.bak`)).toBe(true);
      expect(store.getSnapshot().decisions).toEqual([]);
    });
  });

  describe('save()', () => {
    it('writes indented (2-space) JSON and leaves no stray temp file behind', () => {
      const store = new MemoryStore(memoryFile);
      store.load();
      store.addResearchQuestion({ text: '질문' });

      store.save();

      const raw = readFileSync(memoryFile, 'utf-8');
      expect(raw).toContain('\n  "schemaVersion"');
      const dirEntries = readdirSync(join(memoryFile, '..'));
      expect(dirEntries.some((name) => name.endsWith('.tmp'))).toBe(false);
    });

    it('overwrites the existing file atomically on repeated saves', () => {
      const store = new MemoryStore(memoryFile);
      store.load();
      store.addResearchQuestion({ text: '첫 번째' });
      store.save();

      store.addResearchQuestion({ text: '두 번째' });
      store.save();

      const reloaded = new MemoryStore(memoryFile);
      reloaded.load();
      expect(reloaded.listResearchQuestions()).toHaveLength(2);
    });
  });

  describe('research questions CRUD', () => {
    it('adds, updates, lists, and removes a research question', () => {
      const store = new MemoryStore(memoryFile);
      store.load();

      const created = store.addResearchQuestion({ text: '이 연구의 갭은 무엇인가?' });
      expect(store.listResearchQuestions()).toHaveLength(1);

      const updated = store.updateResearchQuestion(created.id, { status: 'archived' });
      expect(updated?.status).toBe('archived');

      const removed = store.removeResearchQuestion(created.id);
      expect(removed).toBe(true);
      expect(store.listResearchQuestions()).toHaveLength(0);
    });

    it('returns undefined/false for update/remove on an unknown id', () => {
      const store = new MemoryStore(memoryFile);
      store.load();

      expect(store.updateResearchQuestion('missing-id', { status: 'archived' })).toBeUndefined();
      expect(store.removeResearchQuestion('missing-id')).toBe(false);
    });
  });

  describe('hypotheses CRUD', () => {
    it('adds, updates, and removes a hypothesis', () => {
      const store = new MemoryStore(memoryFile);
      store.load();

      const created = store.addHypothesis({ text: 'H1: X는 Y에 영향을 준다' });
      const updated = store.updateHypothesis(created.id, { text: 'H1 (수정): X는 Y에 강한 영향을 준다' });
      expect(updated?.text).toBe('H1 (수정): X는 Y에 강한 영향을 준다');

      expect(store.removeHypothesis(created.id)).toBe(true);
      expect(store.listHypotheses()).toHaveLength(0);
    });
  });

  describe('term definitions CRUD', () => {
    it('adds, updates, and removes a term definition', () => {
      const store = new MemoryStore(memoryFile);
      store.load();

      const created = store.addTermDefinition({ term: '메타인지', definition: '자신의 인지 과정을 아는 것' });
      expect(store.listTermDefinitions()).toHaveLength(1);

      store.updateTermDefinition(created.id, { source: '교재 3장' });
      expect(store.listTermDefinitions()[0]?.source).toBe('교재 3장');

      expect(store.removeTermDefinition(created.id)).toBe(true);
    });
  });

  describe('research decisions (FR-MEM-002)', () => {
    it('adds a decision with both what and why', () => {
      const store = new MemoryStore(memoryFile);
      store.load();

      const decision = store.addDecision({ what: '표본 크기를 30명으로 정함', why: '선행연구의 평균 표본 크기를 참고함' });

      expect(store.listDecisions()).toHaveLength(1);
      expect(decision.what).toBe('표본 크기를 30명으로 정함');
      expect(decision.source).toBe('manual');
    });

    it('rejects a decision missing "what"', () => {
      const store = new MemoryStore(memoryFile);
      store.load();

      expect(() => store.addDecision({ what: '', why: '이유는 있음' })).toThrow(MemoryValidationError);
    });

    it('rejects a decision missing "why", including whitespace-only input', () => {
      const store = new MemoryStore(memoryFile);
      store.load();

      expect(() => store.addDecision({ what: '결정 내용', why: '   ' })).toThrow(MemoryValidationError);
    });

    it('removes a decision by id', () => {
      const store = new MemoryStore(memoryFile);
      store.load();
      const decision = store.addDecision({ what: '무엇', why: '왜' });

      expect(store.removeDecision(decision.id)).toBe(true);
      expect(store.listDecisions()).toHaveLength(0);
    });
  });

  describe('advisor feedback CRUD', () => {
    it('adds feedback as pending by default and can mark it addressed with a response', () => {
      const store = new MemoryStore(memoryFile);
      store.load();

      const feedback = store.addAdvisorFeedback({ content: '서론의 연구 갭을 더 명확히 하세요' });
      expect(feedback.status).toBe('pending');

      const updated = store.updateAdvisorFeedbackStatus(feedback.id, 'addressed', '연구 갭 문단을 추가했습니다');
      expect(updated?.status).toBe('addressed');
      expect(updated?.response).toBe('연구 갭 문단을 추가했습니다');
    });

    it('lists and removes advisor feedback', () => {
      const store = new MemoryStore(memoryFile);
      store.load();
      const feedback = store.addAdvisorFeedback({ content: '결론을 더 구체화하세요' });

      expect(store.listAdvisorFeedback()).toHaveLength(1);
      expect(store.removeAdvisorFeedback(feedback.id)).toBe(true);
      expect(store.listAdvisorFeedback()).toHaveLength(0);
    });
  });

  describe('getSnapshot() immutability', () => {
    it('returns a deep copy that cannot mutate the store state', () => {
      const store = new MemoryStore(memoryFile);
      store.load();
      store.addResearchQuestion({ text: '원본 질문' });

      const snapshot = store.getSnapshot();
      (snapshot.researchQuestions as { text: string }[])[0]!.text = '변조된 질문';
      (snapshot.decisions as unknown[]).push({ tampered: true });

      expect(store.listResearchQuestions()[0]?.text).toBe('원본 질문');
      expect(store.listDecisions()).toHaveLength(0);
    });
  });
});
