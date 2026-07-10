/**
 * IPC channel names and payload/result types shared between the Electron
 * main process and the renderer.
 *
 * T40 (SPEC-TSA-002): the actual definitions now live under `./ipc/`, split
 * per domain (`channels.ts` / `common.ts` / `llm.ts` / `research.ts` /
 * `gate.ts` / `academic.ts`) to stay under the project's 300-line file
 * limit as new IPC domains are added this sprint. This file remains a thin
 * re-export so every existing `from '../shared/ipc-channels'` import across
 * the codebase (main + renderer + tests) keeps working unchanged.
 *
 * Do NOT add new types here — add them under `./ipc/` instead (a new
 * domain gets its own file plus an `export *` line in `./ipc/index.ts`).
 */

export * from './ipc';
