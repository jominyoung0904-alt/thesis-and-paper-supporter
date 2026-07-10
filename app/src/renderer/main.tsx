import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { FontSizeControl } from './FontSizeControl';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element (#root) not found in index.html');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// `FontSizeControl` is mounted into a *separate* DOM root (`#font-size-control-root`,
// a sibling of `#root` in index.html) instead of living inside `<App>`. The
// font-scale feature applies CSS `zoom` to `#root` (Task T35 fix#3) — if the
// control lived inside #root, it would be zoomed along with everything else,
// so it lives outside that subtree and is left untouched by the zoom.
const controlElement = document.getElementById('font-size-control-root');
if (controlElement) {
  ReactDOM.createRoot(controlElement).render(
    <React.StrictMode>
      <FontSizeControl />
    </React.StrictMode>,
  );
}
