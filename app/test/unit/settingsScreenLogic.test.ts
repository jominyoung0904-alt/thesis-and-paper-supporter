import { describe, expect, it } from 'vitest';

import {
  ACADEMIC_KEY_CARDS,
  canSaveAcademicKey,
  canSaveDualFieldKey,
  combineNaverCredential,
  createInitialCardState,
} from '../../src/renderer/settings/settingsScreenLogic';

describe('ACADEMIC_KEY_CARDS', () => {
  it('defines exactly the three academic-search providers', () => {
    expect(ACADEMIC_KEY_CARDS.map((card) => card.provider).sort()).toEqual(['kci', 'naverdoc', 'scienceon'].sort());
  });

  it('only the naverdoc card carries a guide link', () => {
    const naverdoc = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'naverdoc');
    const kci = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'kci');
    const scienceon = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'scienceon');

    expect(naverdoc?.guideUrl).toBeTruthy();
    expect(kci?.guideUrl).toBeUndefined();
    expect(scienceon?.guideUrl).toBeUndefined();
  });

  it('kci and scienceon carry the IP/MAC-restriction note; naverdoc does not', () => {
    const naverdoc = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'naverdoc');
    const kci = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'kci');
    const scienceon = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'scienceon');

    expect(naverdoc?.restrictionNote).toBeUndefined();
    expect(kci?.restrictionNote).toContain('컴퓨터');
    expect(scienceon?.restrictionNote).toContain('컴퓨터');
  });

  it('only the naverdoc card is a dual-field (Client ID + Client Secret) card', () => {
    const naverdoc = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'naverdoc');
    const kci = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'kci');
    const scienceon = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'scienceon');

    expect(naverdoc?.dualField).toBeDefined();
    expect(naverdoc?.dualField?.primaryLabel).toBe('Client ID');
    expect(naverdoc?.dualField?.secondaryLabel).toBe('Client Secret');
    expect(kci?.dualField).toBeUndefined();
    expect(scienceon?.dualField).toBeUndefined();
  });

  it('the naverdoc card ships issuance steps', () => {
    const naverdoc = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'naverdoc');

    expect(naverdoc?.steps?.length).toBeGreaterThan(0);
  });
});

describe('createInitialCardState', () => {
  it('starts empty, not saving, with no message', () => {
    expect(createInitialCardState()).toEqual({
      input: '',
      secondInput: '',
      saving: false,
      message: null,
      messageKind: null,
    });
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

describe('canSaveDualFieldKey', () => {
  it('is true when both fields are non-empty and not saving', () => {
    expect(canSaveDualFieldKey('client-id', 'client-secret', false)).toBe(true);
  });

  it('is false when either field is empty or whitespace-only', () => {
    expect(canSaveDualFieldKey('', 'client-secret', false)).toBe(false);
    expect(canSaveDualFieldKey('client-id', '', false)).toBe(false);
    expect(canSaveDualFieldKey('   ', '   ', false)).toBe(false);
  });

  it('is false while a save is already in flight', () => {
    expect(canSaveDualFieldKey('client-id', 'client-secret', true)).toBe(false);
  });
});

describe('combineNaverCredential', () => {
  it('joins client id and secret with a colon', () => {
    expect(combineNaverCredential('my-id', 'my-secret')).toBe('my-id:my-secret');
  });

  it('trims whitespace from both sides before joining', () => {
    expect(combineNaverCredential('  my-id  ', '  my-secret  ')).toBe('my-id:my-secret');
  });
});
