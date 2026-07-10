/**
 * Central IPC service assembly (Wave 4.5 integration / SPEC-TSA-001).
 *
 * Wires Wave 1~4 core modules (LLM adapters, memory store, chat conversation
 * manager, research pipeline, academic clients) into the IPC channels
 * declared in `src/shared/ipc-channels.ts`. This module only ever *consumes*
 * core public contracts — no core file's exported signature is changed here.
 *
 * T40 (SPEC-TSA-002): per-domain handler registration was split out into
 * settingsHandlers.ts / chatHandlers.ts / researchGateHandlers.ts /
 * academicKeyHandlers.ts to stay under the project's 300-line file limit as
 * new IPC domains are added this sprint (see plan.md "선행 리팩터링 메모").
 * This file now only assembles shared state (project context, LLM service,
 * the lazily-built conversation manager) and wires each domain's
 * `register*Handlers` into the app.
 *
 * T41 (SPEC-TSA-002, FR-PRJ-002): the single fixed-path `MemoryStore` this
 * file used to construct is now owned by `ProjectContext` (T39), which
 * re-assembles it (and future project-scoped stores) on every project
 * switch. Domain handlers that need "the current project's memory" receive a
 * `getMemoryStore` accessor instead of a captured instance, so they always
 * observe the currently active project.
 */

import type { AppSettings } from '../config/defaultSettings';
import type { KeyStore } from '../config/keyStore';
import { ConversationManager } from '../../core/chat/conversation';
import { serializeMemoryForPrompt } from '../../core/memory/serializer';
import { ProjectIndexStore } from '../../core/project/projectStore';
import { indexFilePath } from '../project/projectPaths';
import type { ConversationManagerHolder } from './guards';
import { registerAcademicKeyHandlers } from './academicKeyHandlers';
import { registerChatHandlers } from './chatHandlers';
import { createActiveChatSession, registerChatHistoryHandlers } from './chatHistoryHandlers';
import type { ActiveChatSession } from './chatHistoryHandlers';
import { registerGateHistoryHandlers } from './gateHistoryHandlers';
import { registerLibraryHandlers } from './libraryHandlers';
import { createLlmService } from './llmService';
import { ProjectContext } from './projectContext';
import { registerProjectHandlers } from './projectHandlers';
import { registerResearchGateHandlers } from './researchGateHandlers';
import { registerResearchHandoffHandlers } from './researchHandoffHandlers';
import { registerResearchHistoryHandlers } from './researchHistoryHandlers';
import { registerSettingsHandlers } from './settingsHandlers';
import { registerWritingExtHandlers } from './writingExtHandlers';

export interface IpcHandlerDeps {
  keyStore: KeyStore;
  settingsFile: string;
  getSettings: () => AppSettings;
  setSettings: (settings: AppSettings) => void;
  /** Root data directory — `ProjectContext` resolves every per-project path under `{dataDir}/projects/`. */
  dataDir: string;
}

/** Registers every IPC handler this app exposes. Call once during bootstrap. */
// @AX:ANCHOR: [AUTO] central IPC wiring — composition root registering every channel handler. Related: SPEC-TSA-001, SPEC-TSA-002
export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const { keyStore, settingsFile, getSettings, setSettings, dataDir } = deps;

  registerAcademicKeyHandlers({ keyStore, getSettings });

  const indexStore = new ProjectIndexStore(indexFilePath(dataDir));
  const projectContext = new ProjectContext({
    dataDir,
    indexStore,
    // Flush the outgoing project's pending writes while its services are
    // still the live ones (research.md decision 1: rebuild-on-switch).
    beforeSwitch: (outgoing) => outgoing.memoryStore.save(),
  });
  projectContext.initialize();

  const llmService = createLlmService(getSettings, keyStore);

  function buildConversationManager(): ConversationManager {
    return new ConversationManager({
      llm: llmService.getAdapter(),
      model: llmService.getModel(),
      getMemory: () => serializeMemoryForPrompt(projectContext.getServices().memoryStore.getSnapshot()),
    });
  }

  // Shared across settingsHandlers.ts (rebuilds on provider/key change) and
  // chatHandlers.ts (lazily builds on first chat turn) — see guards.ts's
  // `ConversationManagerHolder` doc comment for why this lives here.
  let conversationManager: ConversationManager | null = null;
  const conversation: ConversationManagerHolder = {
    get: () => conversationManager,
    build: buildConversationManager,
    set: (manager) => {
      conversationManager = manager;
    },
  };

  // FR-PRJ-002: a project switch must not leak the previous project's chat
  // transcript into the newly active one — different projects are different
  // research contexts by definition, so this rebuild ALWAYS restores an
  // EMPTY history (unlike settingsHandlers.ts's provider-change rebuild,
  // which intentionally carries the transcript over). Skipped when no
  // manager was ever built yet (nothing to leak; the next `chat:send` lazily
  // builds fresh against the now-active project) and thus never risks
  // `buildConversationManager()`'s eager `llmService.getAdapter()` throwing
  // before a key is registered.
  // Tracks which saved chat session (if any) the live transcript belongs to
  // (T53, FR-CHM-*). Cleared on project switch below — the previous
  // project's session id is meaningless for the new project.
  const activeChatSession: ActiveChatSession = createActiveChatSession();

  projectContext.onSwitch(() => {
    activeChatSession.clear();
    if (!conversation.get()) return;
    const rebuilt = conversation.build();
    rebuilt.restoreHistory([]);
    conversation.set(rebuilt);
  });

  const getMemoryStore = () => projectContext.getServices().memoryStore;
  const getLibraryFile = () => projectContext.getServices().projectPaths.libraryFile;
  const getResearchDir = () => projectContext.getServices().projectPaths.researchDir;
  const getChatsDir = () => projectContext.getServices().projectPaths.chatsDir;
  const getGateDir = () => projectContext.getServices().projectPaths.gateDir;
  const getMockReviewDir = () => projectContext.getServices().projectPaths.mockReviewDir;
  const getCheckpointFile = () => projectContext.getServices().projectPaths.checkpointFile;

  registerSettingsHandlers({ keyStore, settingsFile, getSettings, setSettings, llmService, conversation });
  registerChatHandlers({ llmService, getMemoryStore, conversation, getChatsDir, activeChatSession });
  registerResearchGateHandlers({
    llmService,
    getMemoryStore,
    keyStore,
    getSettings,
    getResearchDir,
    getGateDir,
    getCheckpointFile,
  });
  registerProjectHandlers({ indexStore, projectContext });
  registerLibraryHandlers({ getLibraryFile });
  registerResearchHistoryHandlers({ getResearchDir });
  registerChatHistoryHandlers({ getChatsDir, conversation, activeSession: activeChatSession });
  registerGateHistoryHandlers({ getGateDir });
  registerResearchHandoffHandlers({ getResearchDir, conversation, activeSession: activeChatSession });
  registerWritingExtHandlers({ llmService, getMemoryStore, getMockReviewDir });
}
