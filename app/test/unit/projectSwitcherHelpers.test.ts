import { describe, expect, it } from 'vitest';

import type { IpcProjectInfo } from '../../src/shared/ipc-channels';
import {
  buildArchiveConfirmMessage,
  canCreateProject,
  canRenameProject,
  getProjectFailureMessage,
  PROJECT_NAME_MAX_LENGTH,
  removeProject,
  resolveActiveProjectName,
  upsertProject,
} from '../../src/renderer/project/projectSwitcherHelpers';

function makeProject(overrides: Partial<IpcProjectInfo> = {}): IpcProjectInfo {
  return { id: 'p1', name: '내 연구', createdAt: '2026-01-01T00:00:00.000Z', archived: false, ...overrides };
}

describe('getProjectFailureMessage', () => {
  it('translates every known failure reason into Korean copy', () => {
    expect(getProjectFailureMessage('invalid_name')).toContain('이름');
    expect(getProjectFailureMessage('not_found')).toContain('찾을 수 없어요');
    expect(getProjectFailureMessage('archived')).toContain('보관된 연구');
    expect(getProjectFailureMessage('last_active_project')).toBe('마지막 남은 연구는 보관할 수 없어요.');
  });

  it('falls back to a generic message for an unrecognized reason', () => {
    expect(getProjectFailureMessage('something_unexpected' as never)).toBe('알 수 없는 문제가 발생했어요. 다시 시도해 주세요.');
  });
});

describe('canCreateProject', () => {
  it('allows an empty name (auto-named by the backend)', () => {
    expect(canCreateProject('', false)).toBe(true);
    expect(canCreateProject('   ', false)).toBe(true);
  });

  it('allows a name up to the max length', () => {
    expect(canCreateProject('a'.repeat(PROJECT_NAME_MAX_LENGTH), false)).toBe(true);
  });

  it('rejects a name over the max length', () => {
    expect(canCreateProject('a'.repeat(PROJECT_NAME_MAX_LENGTH + 1), false)).toBe(false);
  });

  it('is false while a save is already in flight', () => {
    expect(canCreateProject('내 연구', true)).toBe(false);
  });
});

describe('canRenameProject', () => {
  it('requires a non-empty, non-whitespace name', () => {
    expect(canRenameProject('', false)).toBe(false);
    expect(canRenameProject('   ', false)).toBe(false);
    expect(canRenameProject('새 이름', false)).toBe(true);
  });

  it('rejects a name over the max length', () => {
    expect(canRenameProject('a'.repeat(PROJECT_NAME_MAX_LENGTH + 1), false)).toBe(false);
  });

  it('is false while a save is already in flight', () => {
    expect(canRenameProject('새 이름', true)).toBe(false);
  });
});

describe('upsertProject', () => {
  it('appends when the project id is not already present', () => {
    const existing = [makeProject({ id: 'p1' })];
    const next = upsertProject(existing, makeProject({ id: 'p2', name: '새 연구' }));
    expect(next.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('replaces in place when the project id already exists', () => {
    const existing = [makeProject({ id: 'p1', name: '옛 이름' }), makeProject({ id: 'p2' })];
    const next = upsertProject(existing, makeProject({ id: 'p1', name: '새 이름' }));
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(makeProject({ id: 'p1', name: '새 이름' }));
  });

  it('does not mutate the input array', () => {
    const existing = [makeProject({ id: 'p1' })];
    upsertProject(existing, makeProject({ id: 'p2' }));
    expect(existing).toHaveLength(1);
  });
});

describe('removeProject', () => {
  it('removes the project with the given id', () => {
    const existing = [makeProject({ id: 'p1' }), makeProject({ id: 'p2' })];
    expect(removeProject(existing, 'p1').map((p) => p.id)).toEqual(['p2']);
  });

  it('is a no-op when the id is not present', () => {
    const existing = [makeProject({ id: 'p1' })];
    expect(removeProject(existing, 'missing')).toEqual(existing);
  });
});

describe('resolveActiveProjectName', () => {
  it('returns the matching project name', () => {
    const projects = [makeProject({ id: 'p1', name: '내 연구' })];
    expect(resolveActiveProjectName(projects, 'p1')).toBe('내 연구');
  });

  it('falls back to a placeholder when no project matches', () => {
    expect(resolveActiveProjectName([], null)).toBe('연구 선택');
    expect(resolveActiveProjectName([makeProject({ id: 'p1' })], 'missing')).toBe('연구 선택');
  });
});

describe('buildArchiveConfirmMessage', () => {
  it('includes the project name and the no-data-loss reassurance', () => {
    const message = buildArchiveConfirmMessage('내 연구');
    expect(message).toContain('내 연구');
    expect(message).toContain('데이터는 지워지지 않아요');
  });
});
