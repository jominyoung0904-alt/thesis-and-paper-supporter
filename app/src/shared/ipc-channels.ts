/**
 * IPC channel names shared between the Electron main process and the renderer.
 *
 * This file is the single source of truth for channel identifiers. Both
 * `src/main/**` and `src/renderer/**` MUST import channel names from here
 * instead of hardcoding string literals, so a rename only touches one file.
 *
 * NOTE: Channels are placeholders for future tasks (T2+). Only structural
 * naming is defined here for T1; payload wiring happens in later tasks.
 */

export const IpcChannels = {
  // App lifecycle / diagnostics (wired in later tasks: T2, T5)
  APP_GET_PATHS: 'app:get-paths',
  APP_STARTUP_CHECK: 'app:startup-check',
} as const;

export type IpcChannelName = (typeof IpcChannels)[keyof typeof IpcChannels];
