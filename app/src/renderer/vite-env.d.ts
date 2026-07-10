/// <reference types="vite/client" />

import type { ThesisApi } from '../shared/thesisApi';

declare global {
  interface Window {
    /** contextBridge surface exposed by `src/main/preload.ts`. */
    thesisApi: ThesisApi;
  }
}
