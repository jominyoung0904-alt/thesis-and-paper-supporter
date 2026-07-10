/**
 * Shared type placeholders used by both main and renderer processes.
 *
 * These are intentionally minimal for T1 (scaffolding). Later tasks (T11
 * memory core, T6 LLM adapters, etc.) will extend this file or split it
 * into per-domain files under src/shared/ once it approaches the 300-line
 * file size limit.
 */

/** Directory layout resolved for the running app instance. See src/main/paths.ts. */
export interface AppPaths {
  /** Portable distribution root (zip root in packaged mode, repo root in dev mode). */
  root: string;
  /** Directory containing the application program body. */
  appDir: string;
  /** Directory containing user data (research memory, backups, etc.). */
  dataDir: string;
  /** Directory containing human-readable configuration files. */
  configDir: string;
  /** Absolute path to config/settings.json. */
  settingsFile: string;
}
