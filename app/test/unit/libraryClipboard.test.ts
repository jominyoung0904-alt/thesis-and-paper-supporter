import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IpcPaperMetadata, IpcSavedPaper } from '../../src/shared/ipc-channels';
import { copyApaBibliography, copyForNotebookLm } from '../../src/renderer/library/libraryClipboard';

function makeMetadata(overrides: Partial<IpcPaperMetadata> = {}): IpcPaperMetadata {
  return {
    source: 'openalex',
    externalId: 'W123',
    title: 'Metacognition and academic achievement',
    authors: ['Smith, J.'],
    year: 2024,
    abstract: 'An abstract.',
    venue: 'Journal of Learning',
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

function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  return { writeText };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyApaBibliography', () => {
  it('writes the APA-formatted bibliography to the clipboard', async () => {
    const { writeText } = stubClipboard();
    const paper = makeSavedPaper();

    await copyApaBibliography([paper]);

    expect(writeText).toHaveBeenCalledWith(
      'Smith, J. (2024). Metacognition and academic achievement. Journal of Learning. https://openalex.org/W123',
    );
  });

  it('resolves with the copied count and the Korean confirmation message', async () => {
    stubClipboard();
    const papers = [makeSavedPaper({ id: 'a' }), makeSavedPaper({ id: 'b' })];

    const result = await copyApaBibliography(papers);

    expect(result).toEqual({ count: 2, message: '2건의 서지를 복사했어요. 논문 참고문헌 목록에 붙여넣으세요.' });
  });
});

describe('copyForNotebookLm', () => {
  it('writes NotebookLM-formatted source text to the clipboard', async () => {
    const { writeText } = stubClipboard();
    const paper = makeSavedPaper();

    await copyForNotebookLm([paper]);

    const written = writeText.mock.calls[0]?.[0] as string;
    expect(written).toContain('[1] Metacognition and academic achievement');
    expect(written).toContain('원문 링크: https://openalex.org/W123');
  });

  it('resolves with the copied count and the Korean confirmation message', async () => {
    stubClipboard();

    const result = await copyForNotebookLm([makeSavedPaper()]);

    expect(result).toEqual({
      count: 1,
      message: '1건을 복사했어요. 노트북LM 안내를 보고 붙여넣거나, 링크에서 PDF를 받아 올려 보세요.',
    });
  });
});
