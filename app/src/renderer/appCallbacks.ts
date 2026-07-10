/**
 * Adapts `window.thesisApi` (the generic, IPC-shaped preload bridge) into
 * the domain-specific callback contracts `Wizard`, `ChatScreen`, and
 * `WritingCheckScreen` expect (`WizardCallbacks`, `ChatScreenCallbacks`,
 * `WritingCheckCallbacks`). This is the "type mirror adapter" boundary:
 * `window.thesisApi` speaks `shared/ipc-channels.ts` shapes, these factories
 * translate 1:1 into the renderer's own local types.
 *
 * Note: `ChatMessage` (core `{content, at}` vs renderer `{text, createdAt}`)
 * never needs mapping here — the chat/research IPC results only ever carry
 * a single reply/report string; the renderer builds its own message bubbles
 * locally in `chatUiLogic.ts`. Chat transcript persistence across app
 * restarts is out of scope for this sprint (known gap, see completion report).
 */
import type { WizardCallbacks } from './settings/wizard';
import type { SettingsScreenCallbacks } from './settings/SettingsScreen';
import type { ChatScreenCallbacks } from './chat';
import type { WritingCheckCallbacks } from './writing/WritingCheckScreen';
import type {
  ProjectArchiveResult,
  ProjectCreateResult,
  ProjectListResult,
  ProjectRenameResult,
  ProjectSwitchResult,
} from '../shared/ipc-channels';

export function createWizardCallbacks(): WizardCallbacks {
  return {
    saveProviderAndKey: (provider, key, mode) => window.thesisApi.saveProviderAndKey(provider, key, mode),
    openExternal: (url) => window.thesisApi.openExternal(url),
  };
}

export function createChatScreenCallbacks(): ChatScreenCallbacks {
  return {
    async sendChat(text) {
      const result = await window.thesisApi.sendChat(text);
      return { reply: result.reply, suggestedDecision: result.suggestedDecision };
    },

    async runResearch(question, onProgress) {
      const result = await window.thesisApi.runResearch(question, (event) => {
        onProgress({ stage: event.stage, detail: event.detail });
      });
      const mapPaper = (paper: (typeof result.papers)[number]) => ({
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        url: paper.url,
        source: paper.source,
      });
      return {
        report: result.report,
        papers: result.papers.map(mapPaper),
        citedPapers: result.citedPapers.map(mapPaper),
        relatedPapers: result.relatedPapers.map(mapPaper),
        failedSources: result.failedSources.map((failed) => ({
          source: failed.source,
          reason: failed.reason,
        })),
      };
    },

    async saveDecision(what, why) {
      await window.thesisApi.saveDecision(what, why);
    },

    openLink: (url) => window.thesisApi.openExternal(url),
  };
}

export function createWritingCheckCallbacks(): WritingCheckCallbacks {
  return {
    runQualityGate: (sectionId, text) => window.thesisApi.runQualityGate(sectionId, text),
  };
}

export function createSettingsScreenCallbacks(): SettingsScreenCallbacks {
  return {
    saveAcademicKey: (provider, key) => window.thesisApi.saveAcademicKey(provider, key),
    getAcademicKeyStatus: () => window.thesisApi.getAcademicKeyStatus(),
    openExternal: (url) => window.thesisApi.openExternal(url),
  };
}

/**
 * Bridge-only callback contract for multi-project management screens
 * (FR-PRJ-001~006). No renderer UI consumes this yet — T42 owns the actual
 * project-switcher/management screen and may either import this factory
 * directly or define its own screen-local `ProjectScreenCallbacks` type that
 * matches this shape (same "type mirror adapter" pattern as the other
 * `create*Callbacks` factories in this file).
 */
export interface ProjectScreenCallbacks {
  listProjects(): Promise<ProjectListResult>;
  createProject(name?: string): Promise<ProjectCreateResult>;
  renameProject(id: string, name: string): Promise<ProjectRenameResult>;
  switchProject(id: string): Promise<ProjectSwitchResult>;
  archiveProject(id: string): Promise<ProjectArchiveResult>;
}

export function createProjectScreenCallbacks(): ProjectScreenCallbacks {
  return {
    listProjects: () => window.thesisApi.listProjects(),
    createProject: (name) => window.thesisApi.createProject(name),
    renameProject: (id, name) => window.thesisApi.renameProject(id, name),
    switchProject: (id) => window.thesisApi.switchProject(id),
    archiveProject: (id) => window.thesisApi.archiveProject(id),
  };
}
