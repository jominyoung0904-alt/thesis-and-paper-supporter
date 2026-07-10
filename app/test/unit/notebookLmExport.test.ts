import { describe, expect, it } from 'vitest';

import type { IpcPaperMetadata, IpcSavedPaper } from '../../src/shared/ipc-channels';
import { formatForNotebookLm, notebookLmCopyMessage } from '../../src/renderer/library/notebookLmExport';

function makeMetadata(overrides: Partial<IpcPaperMetadata> = {}): IpcPaperMetadata {
  return {
    source: 'openalex',
    externalId: 'W123',
    title: '메타인지와 학업 성취',
    authors: ['홍길동'],
    year: 2024,
    abstract: '이 논문은 메타인지 전략이 학업 성취에 미치는 영향을 분석한다.',
    venue: '교육심리연구',
    url: 'https://openalex.org/W123',
    citationCount: null,
    ...overrides,
  };
}

function makeSavedPaper(overrides: Partial<IpcSavedPaper> = {}): IpcSavedPaper {
  return {
    id: 'saved-1',
    paper: makeMetadata(),
    savedAt: '2026-01-01T00:00:00.000Z',
    memo: '',
    ...overrides,
  };
}

describe('formatForNotebookLm', () => {
  it('formats a single paper with a [1] marker and every labeled line', () => {
    const text = formatForNotebookLm([makeSavedPaper()]);
    expect(text).toBe(
      [
        '[1] 메타인지와 학업 성취',
        '저자: 홍길동 (2024)',
        '출처: 교육심리연구',
        '원문 링크: https://openalex.org/W123',
        '초록: 이 논문은 메타인지 전략이 학업 성취에 미치는 영향을 분석한다.',
      ].join('\n'),
    );
  });

  it('numbers entries sequentially and separates them with a --- line', () => {
    const papers = [
      makeSavedPaper({ id: 'a', paper: makeMetadata({ title: '첫 번째 논문' }) }),
      makeSavedPaper({ id: 'b', paper: makeMetadata({ title: '두 번째 논문' }) }),
    ];
    const text = formatForNotebookLm(papers);
    expect(text).toContain('[1] 첫 번째 논문');
    expect(text).toContain('[2] 두 번째 논문');
    expect(text).toContain('\n---\n');
  });

  it('falls back to Korean placeholders for missing venue/url/abstract', () => {
    const paper = makeSavedPaper({ paper: makeMetadata({ venue: null, url: null, abstract: null }) });
    const text = formatForNotebookLm([paper]);
    expect(text).toContain('출처: 출처 미상');
    expect(text).toContain('원문 링크: 링크 없음');
    expect(text).toContain('초록: 초록 없음');
  });

  it('returns an empty string for an empty selection', () => {
    expect(formatForNotebookLm([])).toBe('');
  });
});

describe('notebookLmCopyMessage', () => {
  it('embeds the copied count in the Korean confirmation message', () => {
    expect(notebookLmCopyMessage(2)).toBe(
      '2건을 복사했어요. 노트북LM 안내를 보고 붙여넣거나, 링크에서 PDF를 받아 올려 보세요.',
    );
  });
});
