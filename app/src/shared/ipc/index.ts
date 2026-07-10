/**
 * Barrel re-exporting every IPC channel constant + domain payload/result type
 * file under this directory.
 *
 * `src/shared/ipc-channels.ts` re-exports this module so the dozens of
 * existing `from '../shared/ipc-channels'` imports across the codebase keep
 * working unchanged (T40, SPEC-TSA-002 선행 리팩터링). New domains added in
 * this sprint (project/library/researchHistory/chatHistory/gateHistory/
 * writingExt — see `.autopus/specs/SPEC-TSA-002/plan.md`) should add a new
 * sibling file here (e.g. `project.ts`) and export it below, rather than
 * growing one of the existing domain files past the project's 300-line
 * limit.
 */

export * from './channels';
export * from './common';
export * from './llm';
export * from './research';
export * from './gate';
export * from './academic';
export * from './project';
export * from './library';
export * from './researchHistory';
export * from './chatHistory';
export * from './gateHistory';
export * from './researchHandoff';
export * from './writingExt';
