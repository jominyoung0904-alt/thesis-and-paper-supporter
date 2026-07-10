import { describe, expect, it } from 'vitest';

import { ACADEMIC_KEY_CARDS, canSaveAcademicKey, createInitialCardState } from '../../src/renderer/settings/settingsScreenLogic';

describe('ACADEMIC_KEY_CARDS', () => {
  it('defines exactly the three academic-search providers', () => {
    expect(ACADEMIC_KEY_CARDS.map((card) => card.provider).sort()).toEqual(['googlecse', 'kci', 'scienceon'].sort());
  });

  it('only the googlecse card carries a guide link', () => {
    const googlecse = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'googlecse');
    const kci = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'kci');
    const scienceon = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'scienceon');

    expect(googlecse?.guideUrl).toBeTruthy();
    expect(kci?.guideUrl).toBeUndefined();
    expect(scienceon?.guideUrl).toBeUndefined();
  });

  it('kci and scienceon carry the IP/MAC-restriction note; googlecse does not', () => {
    const googlecse = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'googlecse');
    const kci = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'kci');
    const scienceon = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'scienceon');

    expect(googlecse?.restrictionNote).toBeUndefined();
    expect(kci?.restrictionNote).toContain('컴퓨터');
    expect(scienceon?.restrictionNote).toContain('컴퓨터');
  });
});

describe('createInitialCardState', () => {
  it('starts empty, not saving, with no message', () => {
    expect(createInitialCardState()).toEqual({ input: '', saving: false, message: null, messageKind: null });
  });
});

describe('canSaveAcademicKey', () => {
  it('is true for a non-empty, non-whitespace input while not saving', () => {
    expect(canSaveAcademicKey('AIzaSy-example', false)).toBe(true);
  });

  it('is false for an empty or whitespace-only input', () => {
    expect(canSaveAcademicKey('', false)).toBe(false);
    expect(canSaveAcademicKey('   ', false)).toBe(false);
  });

  it('is false while a save is already in flight', () => {
    expect(canSaveAcademicKey('AIzaSy-example', true)).toBe(false);
  });
});
