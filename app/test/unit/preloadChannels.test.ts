import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { IpcChannels } from '../../src/shared/ipc-channels';

/**
 * Regression guard (2026-07-11 field bug): the sandboxed preload cannot
 * require project-relative modules, so it inlines channel-name literals.
 * These tests pin (a) that every shared channel name appears verbatim in
 * the preload source, and (b) that the preload never gains a runtime
 * require/import of a project-relative module again.
 */
describe('preload channel literals', () => {
  const preloadSource = readFileSync(join(__dirname, '..', '..', 'src', 'main', 'preload.ts'), 'utf-8');

  it('contains every channel name from src/shared/ipc-channels.ts verbatim', () => {
    for (const channel of Object.values(IpcChannels)) {
      expect(preloadSource, `missing channel literal: ${channel}`).toContain(`'${channel}'`);
    }
  });

  it('has no runtime import of project-relative modules (type-only imports allowed)', () => {
    const runtimeRelativeImport = /^import\s+(?!type\s)[^;]*from\s+'\.\.?\//m;
    expect(preloadSource).not.toMatch(runtimeRelativeImport);
  });
});
