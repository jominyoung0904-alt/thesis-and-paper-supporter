/**
 * Shared, mock-free test helpers for the T29 first-run E2E integration suite
 * (SPEC-TSA-001, Wave 5).
 *
 * Deliberately free of `vi.mock` calls: Vitest only hoists `vi.mock` reliably
 * within the file it is written in, so every spec file that needs to stub
 * `electron` or `core/llm` declares its own `vi.mock` block and only imports
 * plain helpers (this module) alongside it.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CryptoBackend } from '../../src/main/config/keyStore';
import type { AppPaths } from '../../src/shared/types';
import { ensureAppDirectories, resolveAppPaths } from '../../src/main/paths';
import type { LlmAdapter, LlmMessage, LlmProvider, LlmRequest } from '../../src/core/llm';

/**
 * Deterministic, reversible mock of the platform encryption backend — the
 * same round-trip contract as `test/unit/keyStore.test.ts`'s mock, reused
 * here so `KeyStore`'s real file-format/error-classification logic runs
 * completely unmodified in every E2E scenario.
 */
export class MockCryptoBackend implements CryptoBackend {
  available = true;

  isAvailable(): boolean {
    return this.available;
  }

  encrypt(plainText: string): Buffer {
    return Buffer.from(`enc:${plainText}`, 'utf-8');
  }

  decrypt(encrypted: Buffer): string {
    const text = encrypted.toString('utf-8');
    if (!text.startsWith('enc:')) {
      throw new Error('mock decrypt failure (bad ciphertext)');
    }
    return text.slice('enc:'.length);
  }
}

/** A freshly minted, never-extracted "portable install" workspace. */
export interface TempWorkspace {
  root: string;
  paths: AppPaths;
  cleanup: () => void;
}

/**
 * Creates an isolated temp directory and resolves it exactly the way
 * `src/main/index.ts` resolves paths in dev mode (parent of an `app/`
 * directory) — mirroring the real bootstrap sequence's path resolution step.
 */
export function createTempWorkspace(prefix: string): TempWorkspace {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const appPath = join(root, 'app');
  const paths = resolveAppPaths({ isPackaged: false, execPath: 'unused', appPath });
  return {
    root,
    paths,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Same as {@link createTempWorkspace}, but also creates `data/` and `config/` up front. */
export function createReadyWorkspace(prefix: string): TempWorkspace {
  const ws = createTempWorkspace(prefix);
  ensureAppDirectories(ws.paths);
  return ws;
}

/** One recorded LLM call, for assertions on what a handler actually sent upstream. */
export interface RecordedCall {
  system?: string;
  content: string;
  model: string;
  /** Full outgoing message list (role + content), e.g. to assert on history length after a reset. */
  messages: LlmMessage[];
}

/** A single scripted turn: canned reply text, or a thunk that throws (simulating a provider failure). */
export type ScriptedTurn = string | (() => never);

/**
 * Builds a minimal {@link LlmAdapter} that replies from a fixed queue, in
 * call order, and records every request it received. Throws a descriptive
 * test-setup error if `chat()` is invoked more times than the script
 * provides — an unscripted call almost always means the assembly under test
 * made an unexpected extra LLM round trip.
 */
export function makeQueueAdapter(
  provider: LlmProvider,
  script: ScriptedTurn[],
): { adapter: LlmAdapter; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let index = 0;

  const adapter: LlmAdapter = {
    provider,
    async chat(req: LlmRequest) {
      const content = req.messages[req.messages.length - 1]?.content ?? '';
      calls.push({ system: req.system, content, model: req.model, messages: req.messages });

      const turn = script[index++];
      if (turn === undefined) {
        throw new Error(
          `makeQueueAdapter: no scripted reply for call #${index} (system: ${(req.system ?? '').slice(0, 60)})`,
        );
      }
      if (typeof turn === 'function') {
        return turn();
      }
      return { text: turn, usage: { inputTokens: 10, outputTokens: 5 }, model: req.model };
    },
  };

  return { adapter, calls };
}
