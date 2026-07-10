/**
 * Field-repro (조사용, 회귀 테스트로 유지) — 실사용 보고 시퀀스의 MAIN-PROCESS 재현.
 *
 * 회귀 목적: 실사용 시퀀스(네이버 키 없이 리서치 실행 → 설정에서 네이버 키
 * 저장 → 방금 실패한 리서치 기록 삭제 → chat/research 재호출)를 거친 뒤에도
 * 메인 프로세스가 정상 복구되어 이후 chat/research 호출이 계속 성공함을
 * 보증한다(디버거 조사 결과 2/2 PASS — 코드 결함 미발견, 근본 원인 미확정).
 *
 * 사용자 보고 순서를 IPC 레벨에서 그대로 재현한다:
 *   1. 네이버 키 없이 논문찾기(research:run) 실행 — (A) 0건 / (B) 에러 각각
 *   2. 설정에서 네이버 Client ID/Secret 저장(settings:save-academic-key)
 *   3. 방금 리서치 기록 삭제(research-history:remove)
 *   4. chat:send · research:run 재호출이 여전히 성공하는지
 *
 * 목적: 이 시퀀스가 메인 프로세스의 공유 상태(llmService 캐시 어댑터의
 * rate limiter, ConversationManagerHolder, 체크포인트 등)를 오염시켜 이후
 * chat/research 호출을 깨뜨리는 "코드 결함"이 존재하는지 판정한다.
 *
 * mock 패턴은 sprint2.spec.ts와 동일 — vi.mock은 이 파일 안에 있어야 한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaperMetadata } from '../../src/core/academic-api/types';

const { ipcHandlers, shellMock, llmScript, academicState } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
  shellMock: { openExternal: () => Promise.resolve() },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  llmScript: { current: null as any },
  academicState: {
    calls: [] as Array<{ source: string; query: string }>,
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
        throw new Error('test setup error: llmScript.current was not set before createAdapter()');
      }
      return llmScript.current;
    },
  };
});

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
// Naver 저장 시 라이브 검증 호출(client.search('test'))과 research #2의
// 클라이언트 조립을 모두 결정적으로 만들기 위해 통째로 mock.
vi.mock('../../src/core/academic-api/naverDocClient', () => ({
  NaverDocClient: class {
    readonly source = 'naverdoc' as const;
    async search(query: string) {
      academicState.calls.push({ source: 'naverdoc', query });
      return { ok: true as const, papers: [] as PaperMetadata[] };
    }
  },
}));

import { IpcChannels } from '../../src/shared/ipc-channels';
import type { SaveProviderAndKeyResult } from '../../src/shared/ipc-channels';
import { makeQueueAdapter, type ScriptedTurn } from './firstRunHelpers';
import {
  assembleSprint2,
  RESEARCH_QUERY_JSON,
  researchRun,
  researchHistoryList,
  sendChat,
  type Assembled,
} from './sprint2Helpers';

/** Registers the LLM provider key (consumes 1 connectivity-check turn), queuing the rest. */
async function registerLlmKey(a: Assembled, script: ScriptedTurn[]): Promise<void> {
  const { adapter } = makeQueueAdapter('gemini', script);
  llmScript.current = adapter;
  const result = await a.invoke<SaveProviderAndKeyResult>(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
    provider: 'gemini',
    key: 'AIzaSyD-fake-key-1234567890',
    mode: 'free',
  });
  if (!result.ok) throw new Error(`test setup error: provider key registration failed: ${result.message}`);
}

const saveNaverKey = (invoke: Assembled['invoke']) =>
  invoke(IpcChannels.SETTINGS_SAVE_ACADEMIC_KEY, { provider: 'naverdoc', key: 'testclientid:testsecret' });

let assembled: Assembled | undefined;

beforeEach(() => {
  ipcHandlers.clear();
  llmScript.current = null;
  academicState.calls.length = 0;
  academicState.papers.openalex = [];
  academicState.papers.semanticscholar = [];
});

afterEach(() => {
  assembled?.ws.cleanup();
  assembled = undefined;
});

describe('fieldRepro — 키 없는 리서치 → 네이버 키 저장 → 기록 삭제 → chat/research 재호출', () => {
  it('A) 논문 0건으로 끝난 리서치 후: 네이버 저장·기록 삭제·chat/research 재호출이 모두 성공한다', async () => {
    assembled = assembleSprint2('fieldrepro-zero-', ipcHandlers);
    const { invoke } = assembled;

    // 순서대로 소비되는 단일 스크립트 큐:
    // [0] 연결확인, [1] research#1 query-gen, [2] chat#2, [3] research#2 query-gen
    await registerLlmKey(assembled, [
      'connectivity-ok',
      RESEARCH_QUERY_JSON,
      '아이디어 회의 답변입니다.',
      RESEARCH_QUERY_JSON,
    ]);

    // 1) 네이버 키 없이 리서치 — openalex/s2가 0편 반환 → 0건 리포트, 레코드 저장됨
    const research1 = await researchRun(invoke, '초등 영어 몰입교육 효과');
    expect(research1.report).toContain('문헌을 찾지 못했습니다');

    const before = await researchHistoryList(invoke);
    expect(before.records.length).toBe(1);

    // 2) 설정에서 네이버 키 저장 (라이브 검증 통과)
    const naverSave = (await saveNaverKey(invoke)) as { ok: boolean };
    expect(naverSave.ok).toBe(true);

    // 3) 방금 실패한 리서치 기록 삭제
    const removed = (await invoke(IpcChannels.RESEARCH_HISTORY_REMOVE, {
      id: before.records[0]!.id,
    })) as { ok: boolean };
    expect(removed.ok).toBe(true);

    // 4) 대화 탭 복귀 후 — 아이디어 회의(chat:send)와 논문찾기(research:run) 재호출
    const chat2 = await sendChat(invoke, '방금 결과를 어떻게 해석하면 좋을까요?');
    expect(chat2.reply).toBe('아이디어 회의 답변입니다.');

    const research2 = await researchRun(invoke, '몰입교육 후속 연구');
    expect(research2.report).toContain('문헌을 찾지 못했습니다');
  });

  it('B) 리서치 #1이 에러로 끝난 후에도: chat/research 재호출이 정상 동작한다', async () => {
    assembled = assembleSprint2('fieldrepro-error-', ipcHandlers);
    const { invoke } = assembled;

    // [0] 연결확인, [1] research#1 query-gen(throw), [2] chat#2, [3] research#2 query-gen
    await registerLlmKey(assembled, [
      'connectivity-ok',
      () => {
        throw new Error('업스트림 LLM 오류(재현용)');
      },
      '에러 이후에도 답변합니다.',
      RESEARCH_QUERY_JSON,
    ]);

    // 1) 리서치 #1 — query-gen LLM 호출이 throw → research:run reject
    await expect(researchRun(invoke, '실패하는 질문')).rejects.toBeTruthy();

    // 에러로 끝났으므로 저장된 레코드는 없다(삭제할 것 없음).
    const after1 = await researchHistoryList(invoke);
    expect(after1.records.length).toBe(0);

    // 2) 네이버 키 저장
    const naverSave = (await saveNaverKey(invoke)) as { ok: boolean };
    expect(naverSave.ok).toBe(true);

    // 3) chat:send 재호출 — 이전 리서치 에러가 conversation/rate-limiter를
    //    오염시켰다면 여기서 실패하거나 무한 대기해야 한다.
    const chat2 = await sendChat(invoke, '아까 오류가 났는데 다시 도와줄래요?');
    expect(chat2.reply).toBe('에러 이후에도 답변합니다.');

    // 4) research:run 재호출도 정상
    const research2 = await researchRun(invoke, '재시도 질문');
    expect(research2.report).toBeTruthy();
  });
});
