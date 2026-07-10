/**
 * T63 (SPEC-TSA-002, Wave 8 최종) — Sprint 2 종합 E2E 시나리오 검증.
 *
 * Assembled through the real `registerIpcHandlers` composition root (same
 * "실제 부트스트랩 경로" pattern as `projectManagementIpc.spec.ts`) — no
 * domain `register*Handlers` function is called directly. `electron`,
 * `core/llm`'s `createAdapter`, and the two always-real academic clients
 * (`OpenAlexClient`/`SemanticScholarClient`) are mocked so `research:run`
 * never attempts real network I/O. `vi.mock` calls MUST stay in this file
 * (Vitest only hoists them within the file they're written in) — plain
 * helpers live in `sprint2Helpers.ts`.
 */

import { existsSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaperMetadata } from '../../src/core/academic-api/types';

const { ipcHandlers, shellMock, llmScript, academicState } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
  shellMock: { openExternal: () => Promise.resolve() },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  llmScript: { current: null as any },
  academicState: {
    calls: [] as Array<{ source: 'openalex' | 'semanticscholar'; query: string }>,
    papers: { openalex: [] as PaperMetadata[], semanticscholar: [] as PaperMetadata[] },
  },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => {
      ipcHandlers.set(channel, handler);
    },
  },
  shell: shellMock,
}));

vi.mock('../../src/core/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/llm')>();
  return {
    ...actual,
    createAdapter: () => {
      if (!llmScript.current) {
        throw new Error('test setup error: llmScript.current was not set before this createAdapter() call');
      }
      return llmScript.current;
    },
  };
});

// Real-mode-only academic clients (no key ever needed for either — see
// `academicClients.ts`) — mocked so `research:run` never reaches the network.
vi.mock('../../src/core/academic-api/openAlexClient', () => ({
  OpenAlexClient: class {
    readonly source = 'openalex' as const;
    async search(query: string) {
      academicState.calls.push({ source: 'openalex', query });
      return { ok: true as const, papers: academicState.papers.openalex };
    }
  },
}));
vi.mock('../../src/core/academic-api/semanticScholarClient', () => ({
  SemanticScholarClient: class {
    readonly source = 'semanticscholar' as const;
    async search(query: string) {
      academicState.calls.push({ source: 'semanticscholar', query });
      return { ok: true as const, papers: academicState.papers.semanticscholar };
    }
  },
}));

import { migrateDefaultProject } from '../../src/main/project/migration';
import { resolveProjectPaths } from '../../src/main/project/projectPaths';
import { IpcChannels } from '../../src/shared/ipc-channels';
import type { SaveProviderAndKeyResult } from '../../src/shared/ipc-channels';
import { makeQueueAdapter, type RecordedCall, type ScriptedTurn } from './firstRunHelpers';
import {
  archiveProject, assembleSprint2, CITED_TEXT, chatList, createProject, GATE_PASS_JSON,
  gateHistoryGet, gateHistoryList, handoffStart, loadChat, mockReviewGet, mockReviewList,
  newChat, paper, POLISH_JSON, projectCounts, projectList, removeChat, renameProject,
  researchHistoryList, researchRun, RESEARCH_QUERY_JSON, resetAcademicMockState, runIntroGate,
  saveDecision, saveLibraryPaper, screeningAllHighJson, sendChat, switchProject,
  writingMockReview, writingPolish, type Assembled,
} from './sprint2Helpers';
import { MOCK_REVIEW_JSON } from './writingExtTestHelpers';

/** Registers a provider key (1 LLM connectivity-check call), queuing the rest of `script` for whatever runs next. */
async function registerKey(a: Assembled, script: ScriptedTurn[]): Promise<{ calls: RecordedCall[] }> {
  const { adapter, calls } = makeQueueAdapter('gemini', script);
  llmScript.current = adapter;
  const result = await a.invoke<SaveProviderAndKeyResult>(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
    provider: 'gemini',
    key: 'AIzaSyD-fake-key-1234567890',
    mode: 'free',
  });
  if (!result.ok) throw new Error(`test setup error: provider key registration failed: ${result.message}`);
  return { calls };
}

let assembled: Assembled | undefined;

beforeEach(() => {
  ipcHandlers.clear();
  llmScript.current = null;
  resetAcademicMockState(academicState);
});

afterEach(() => {
  assembled?.ws.cleanup();
  assembled = undefined;
});

describe('S1 — 프로젝트 수명주기 (마이그레이션 → 생성 → 전환 → 이름변경 → 보관)', () => {
  it('migrates Sprint 1 data into "내 연구 1", then create/switch/rename/archive behave per FR-PRJ-001~006', async () => {
    assembled = assembleSprint2('tsa-s2e2-lifecycle-', ipcHandlers, true);

    const afterMigration = await projectList(assembled.invoke);
    expect(afterMigration.projects).toHaveLength(1);
    expect(afterMigration.projects[0]?.name).toBe('내 연구 1');
    const legacyId = afterMigration.projects[0]!.id;

    // Restart-idempotency (S3): re-running migration after bootstrap is a no-op.
    expect(migrateDefaultProject(assembled.ws.paths.dataDir)).toEqual({ migrated: false, reason: 'already-indexed' });

    // Archiving the sole remaining project must be rejected (S5 "마지막 활성은 거부").
    expect(await archiveProject(assembled.invoke, legacyId)).toEqual({ ok: false, reason: 'last_active_project' });

    const created = await createProject(assembled.invoke, '2주차 논문');
    if (!created.ok) throw new Error('unreachable');
    const newId = created.project.id;

    const afterCreate = await projectList(assembled.invoke);
    expect(afterCreate.projects).toHaveLength(2);
    expect(afterCreate.activeProjectId).toBe(newId); // S1: 즉시 전환
    expect(existsSync(resolveProjectPaths(assembled.ws.paths.dataDir, newId).root)).toBe(true);

    // Explicit round-trip switch (전환).
    expect(await switchProject(assembled.invoke, legacyId)).toEqual({ ok: true, projectId: legacyId });
    expect(await switchProject(assembled.invoke, newId)).toEqual({ ok: true, projectId: newId });

    const renamed = await renameProject(assembled.invoke, newId, '졸업논문(최종)');
    expect(renamed).toEqual({ ok: true, project: expect.objectContaining({ id: newId, name: '졸업논문(최종)' }) });

    // Archiving the now-inactive legacy project succeeds; its data survives on disk (S5).
    expect((await archiveProject(assembled.invoke, legacyId)).ok).toBe(true);
    const finalList = await projectList(assembled.invoke);
    expect(finalList.projects.map((p) => p.id)).toEqual([newId]);
    expect(existsSync(resolveProjectPaths(assembled.ws.paths.dataDir, legacyId).root)).toBe(true);
  });
});

describe('S2 — 프로젝트 격리 관통 (채팅 + 결정 + 보관함 + 점검 실행)', () => {
  it('keeps chat/decision/library/gate data scoped to the project that created it, intact after a switch-back', async () => {
    assembled = assembleSprint2('tsa-s2e2-isolation-', ipcHandlers);
    await registerKey(assembled, ['연결 확인 완료', 'A 응답 1', 'A 응답 2', GATE_PASS_JSON]);

    const projectAId = (await projectList(assembled.invoke)).projects[0]!.id;

    await sendChat(assembled.invoke, 'A 턴 1');
    await sendChat(assembled.invoke, 'A 턴 2');
    await saveDecision(assembled.invoke, 'A 결정', 'A 이유');
    expect((await saveLibraryPaper(assembled.invoke, paper('A 논문'))).ok).toBe(true);
    expect((await runIntroGate(assembled.invoke, CITED_TEXT)).passed).toBe(true);

    const created = await createProject(assembled.invoke, '프로젝트 B');
    if (!created.ok) throw new Error('unreachable');
    const projectBId = created.project.id;

    const dataDir = assembled.ws.paths.dataDir;
    expect(await projectCounts(assembled.invoke, dataDir, projectBId)).toEqual({
      chats: 0,
      library: 0,
      gate: 0,
      decisions: [],
    });

    expect(await switchProject(assembled.invoke, projectAId)).toEqual({ ok: true, projectId: projectAId });
    expect(await projectCounts(assembled.invoke, dataDir, projectAId)).toEqual({
      chats: 1,
      library: 1,
      gate: 1,
      decisions: ['A 결정'],
    });
  });
});

describe('S3 — 리서치 파이프라인 관통 (research:run → 이력 자동 저장 → handoff → chat:send)', () => {
  it('auto-saves a research:run result, hands it off into chat, and autosaves the injected turns', async () => {
    assembled = assembleSprint2('tsa-s2e2-research-', ipcHandlers);
    await registerKey(assembled, [
      '연결 확인 완료',
      RESEARCH_QUERY_JSON,
      screeningAllHighJson(2),
      '선행연구 종합 결과입니다 [1][2].',
      '다음 단계는 방법론을 구체화하는 거예요.',
    ]);

    const question = '국내 대학생 SNS 중독 관련 연구 있어?';
    expect((await researchRun(assembled.invoke, question)).report).toBeTruthy();

    const historyList = await researchHistoryList(assembled.invoke);
    expect(historyList.records).toHaveLength(1);

    const handoff = await handoffStart(assembled.invoke, historyList.records[0]!.id);
    if (!handoff.ok) throw new Error('unreachable');
    expect(handoff.messages).toHaveLength(2);

    await sendChat(assembled.invoke, '이 결과를 바탕으로 다음 단계는?');

    const sessions = (await chatList(assembled.invoke)).sessions;
    expect(sessions).toHaveLength(1);
    const loaded = await loadChat(assembled.invoke, sessions[0]!.id);
    if (!loaded.ok) throw new Error('unreachable');
    // 2 injected handoff turns + this new user/assistant turn.
    expect(loaded.messages).toHaveLength(4);
    expect(loaded.messages[0]!.content).toContain(question);
    expect(loaded.messages[2]!.content).toBe('이 결과를 바탕으로 다음 단계는?');
  });
});

describe('S4 — 대화 이력 (자동 저장 → 목록 → 이어하기 → 새 대화 → 삭제)', () => {
  it('autosaves every turn, restores it on load, then supports starting fresh and removing it', async () => {
    assembled = assembleSprint2('tsa-s2e2-chathistory-', ipcHandlers);
    await registerKey(assembled, ['연결 확인 완료', '턴1 응답', '턴2 응답', '턴3 응답']);

    await sendChat(assembled.invoke, '턴1');
    await sendChat(assembled.invoke, '턴2');
    await sendChat(assembled.invoke, '턴3');

    const list = await chatList(assembled.invoke);
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]!.messageCount).toBe(6);
    const sessionId = list.sessions[0]!.id;

    const loaded = await loadChat(assembled.invoke, sessionId);
    if (!loaded.ok) throw new Error('unreachable');
    expect(loaded.messages).toHaveLength(6);

    expect(await newChat(assembled.invoke)).toEqual({ ok: true });
    // "새 대화 시작" only resets the active pointer — the saved session stays listed.
    expect((await chatList(assembled.invoke)).sessions).toHaveLength(1);

    expect(await removeChat(assembled.invoke, sessionId)).toEqual({ ok: true });
    expect((await chatList(assembled.invoke)).sessions).toHaveLength(0);
  });
});

describe('S5 — 글쓰기 관통 (quality-gate → gate-history, polish, mock-review → history)', () => {
  it('saves a gate run into gate-history and a mock-review run into its own history, both re-loadable', async () => {
    assembled = assembleSprint2('tsa-s2e2-writing-', ipcHandlers);
    await registerKey(assembled, ['연결 확인 완료', GATE_PASS_JSON, POLISH_JSON, MOCK_REVIEW_JSON]);

    expect((await runIntroGate(assembled.invoke, CITED_TEXT)).passed).toBe(true);
    const gateList = await gateHistoryList(assembled.invoke);
    expect(gateList.records).toHaveLength(1);
    const gateRecord = await gateHistoryGet(assembled.invoke, gateList.records[0]!.id);
    expect(gateRecord?.text).toBe(CITED_TEXT);

    const polish = await writingPolish(assembled.invoke, '이 연구는 진짜 중요한 얘기를 다루고 있다고 생각한다.');
    expect(polish.ok).toBe(true);

    const mockReview = await writingMockReview(assembled.invoke, '이것은 심사받을 원고입니다.');
    expect(mockReview.ok).toBe(true);
    const reviewList = await mockReviewList(assembled.invoke);
    expect(reviewList.records).toHaveLength(1);
    const reviewRecord = await mockReviewGet(assembled.invoke, reviewList.records[0]!.id);
    expect(reviewRecord?.text).toBe('이것은 심사받을 원고입니다.');
  });
});

describe('S6 — 딥리서치 체크포인트 재개 (FR-RES-007/008)', () => {
  it('resumes from the screening checkpoint after a report failure, never re-calling the academic clients', async () => {
    assembled = assembleSprint2('tsa-s2e2-checkpoint-', ipcHandlers);
    const { calls } = await registerKey(assembled, [
      '연결 확인 완료',
      RESEARCH_QUERY_JSON,
      screeningAllHighJson(2),
      () => {
        throw new Error('llm network error');
      },
      '요약입니다 [1][2].',
    ]);

    const question = '메타인지 학습 전략에 대한 선행연구가 있어?';
    await expect(researchRun(assembled.invoke, question)).rejects.toThrow();
    const searchCallsAfterFirstRun = academicState.calls.length;
    expect(searchCallsAfterFirstRun).toBeGreaterThan(0);

    const resumed = await researchRun(assembled.invoke, question);
    expect(resumed.report).toContain('요약입니다');
    // 검색 클라이언트 재호출 0회: no new search calls on the resumed run.
    expect(academicState.calls.length).toBe(searchCallsAfterFirstRun);
    // settings + query-gen + screening + failed report + resumed report — query-gen/screening never re-ran either.
    expect(calls).toHaveLength(5);
  });
});
