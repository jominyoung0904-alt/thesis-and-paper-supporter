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
      return {
        report: result.report,
        papers: result.papers.map((paper) => ({
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          url: paper.url,
          source: paper.source,
        })),
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
