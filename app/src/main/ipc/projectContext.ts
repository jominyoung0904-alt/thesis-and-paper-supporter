/**
 * Project-scoped service lifecycle manager (FR-PRJ-002/006).
 *
 * This is the single source of truth for "the current project" during Sprint
 * 2. Every project-scoped service (MemoryStore today; the library / research
 * history / chat session / gate history stores in later tasks) is assembled
 * here against the active project's paths and re-assembled on switch.
 *
 * Design decision 1 (research.md): rebuild-on-switch. On a project switch we
 * DROP the previous instances and build fresh ones, mirroring the existing
 * `buildConversationManager()` rebuild pattern in handlers.ts. This avoids the
 * eviction bookkeeping an instance cache would need, and project switches are
 * infrequent (a user juggles 3~4 projects, not per-second toggles).
 *
 * Boundary: this module is electron-independent (pure Node) so it stays
 * unit-testable. It consumes the already-resolved `dataDir` string and a
 * loaded/loadable `ProjectIndexStore`; it never imports `electron` or
 * `paths.ts::resolveAppPaths`. The real wiring into handlers.ts (rebuilding
 * the ConversationManager on switch, saving the outgoing project) is done by
 * T41 through the `onSwitch` / `beforeSwitch` hooks exposed here.
 */

import { MemoryStore } from '../../core/memory/store';
import {
  ensureProjectDirectories,
  resolveProjectPaths,
  type ProjectPaths,
} from '../project/projectPaths';
import type { ProjectIndexStore } from '../../core/project/projectStore';

/**
 * The always-present project-scoped services. Later domain stores (library,
 * research history, chat sessions, gate history) are injected via
 * `buildExtras` and consumed through `getExtras()` — kept out of this stable
 * interface so adding a store does not churn every consumer's type.
 */
export interface ProjectScopedServices {
  memoryStore: MemoryStore;
  projectPaths: ProjectPaths;
}

/** Why `switchProject` could not switch (failure = result value, never throw). */
export type SwitchFailureReason = 'not_found' | 'archived';

/**
 * Outcome of a `switchProject` call. On failure the previously active project
 * and its services are left untouched (the reason mirrors
 * `ProjectIndexStore.setActive`).
 */
export type SwitchResult =
  | { ok: true; projectId: string }
  | { ok: false; reason: SwitchFailureReason };

/** A listener invoked (with the new project id) AFTER a switch has re-assembled services. */
export type SwitchListener = (projectId: string) => void;

/** Called with the OUTGOING services just before they are dropped on switch. */
export type BeforeSwitchHook = (outgoing: ProjectScopedServices) => void;

/** Builds the extra (later-task) domain stores from the active project's paths. */
export type BuildExtras = (paths: ProjectPaths) => Record<string, unknown>;

export interface ProjectContextDeps {
  /** Already-resolved `AppPaths.dataDir` (this module never resolves it itself). */
  dataDir: string;
  /** Cross-project index; may be freshly constructed — `initialize()` loads it. */
  indexStore: ProjectIndexStore;
  /**
   * Optional factory for later-task domain stores (library, research history,
   * chat sessions, gate history). Re-invoked on every (re)assembly so each
   * store is bound to the currently active project's paths.
   */
  buildExtras?: BuildExtras;
  /**
   * Optional hook fired just BEFORE the outgoing project's services are
   * dropped on a switch, so the caller can flush pending saves (e.g.
   * `memoryStore.save()`) while the old instance is still the active one.
   */
  beforeSwitch?: BeforeSwitchHook;
}

const NOT_INITIALIZED = 'ProjectContext is not initialized — call initialize() first.';

/**
 * Owns the active project's services and re-assembles them on switch. Not
 * thread-safe by design: a single instance backs the one active project in the
 * main process, exactly like the ConversationManager it will sit alongside.
 */
export class ProjectContext {
  private readonly deps: ProjectContextDeps;
  private readonly switchListeners = new Set<SwitchListener>();

  private services: ProjectScopedServices | null = null;
  private extras: Record<string, unknown> = {};
  private activeProjectId: string | null = null;

  constructor(deps: ProjectContextDeps) {
    this.deps = deps;
  }

  /**
   * Loads the index and assembles services for the active project.
   *
   * If the index has no active project after loading (fresh install with no
   * Sprint 1 data to migrate — the FR-PRJ-003 migration, when it applies, runs
   * BEFORE this and leaves an active project behind), a default project is
   * created and persisted so `getActiveProjectId()` always returns a real id.
   */
  initialize(): void {
    this.deps.indexStore.load();

    let active = this.deps.indexStore.getActive();
    if (!active) {
      // No project yet (nothing migrated) — create the first one so the app
      // always has an active project. `create()` also sets it active.
      active = this.deps.indexStore.create();
      this.deps.indexStore.save();
    }

    this.assemble(active.id);
  }

  /** The active project id. Throws if called before `initialize()`. */
  getActiveProjectId(): string {
    if (this.activeProjectId === null) {
      throw new Error(NOT_INITIALIZED);
    }
    return this.activeProjectId;
  }

  /** The active project's core services. Throws if called before `initialize()`. */
  getServices(): ProjectScopedServices {
    if (!this.services) {
      throw new Error(NOT_INITIALIZED);
    }
    return this.services;
  }

  /**
   * The `buildExtras` output for the active project (empty object when no
   * factory was supplied). Later tasks narrow this record's type at their own
   * consumption sites. Throws if called before `initialize()`.
   */
  getExtras(): Record<string, unknown> {
    if (!this.services) {
      throw new Error(NOT_INITIALIZED);
    }
    return this.extras;
  }

  /**
   * Switches the active project and re-assembles every project-scoped service
   * against it (rebuild-on-switch). On an unknown or archived target the switch
   * is rejected as a result value and the current services stay in place — no
   * partial state, no throw.
   *
   * Order of operations on success:
   *   1. index.setActive (validates the target)
   *   2. beforeSwitch(outgoing) — caller flushes the old project's saves
   *   3. index.save          — persist the active-project change
   *   4. re-assemble         — drop old instances, build new ones
   *   5. onSwitch(newId)     — notify subscribers (e.g. rebuild ConversationManager)
   */
  switchProject(id: string): SwitchResult {
    const setResult = this.deps.indexStore.setActive(id);
    if (!setResult.ok) {
      return { ok: false, reason: setResult.reason };
    }

    // Let the caller flush the outgoing project's pending writes while its
    // services are still the live ones (data must be on disk before we drop
    // the references — research.md decision 1).
    if (this.deps.beforeSwitch && this.services) {
      this.deps.beforeSwitch(this.services);
    }

    this.deps.indexStore.save();
    this.assemble(id);
    this.notifySwitch(id);

    return { ok: true, projectId: id };
  }

  /**
   * Registers a listener fired after each successful switch (post-assembly).
   * Returns an unsubscribe function. Not fired for the initial `initialize()`
   * assembly — only for subsequent switches.
   */
  onSwitch(listener: SwitchListener): () => void {
    this.switchListeners.add(listener);
    return () => {
      this.switchListeners.delete(listener);
    };
  }

  /**
   * (Re)builds the project-scoped services for `projectId`: resolves its paths,
   * ensures its directories exist, loads a fresh MemoryStore, and rebuilds the
   * extras. Any previously held instances are released here.
   */
  private assemble(projectId: string): void {
    const paths = resolveProjectPaths(this.deps.dataDir, projectId);
    ensureProjectDirectories(paths);

    const memoryStore = new MemoryStore(paths.memoryFile);
    memoryStore.load();

    this.services = { memoryStore, projectPaths: paths };
    this.extras = this.deps.buildExtras ? this.deps.buildExtras(paths) : {};
    this.activeProjectId = projectId;
  }

  private notifySwitch(projectId: string): void {
    for (const listener of this.switchListeners) {
      listener(projectId);
    }
  }
}
