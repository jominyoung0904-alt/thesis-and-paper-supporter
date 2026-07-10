/**
 * Renderer-wide crash guard (defensive follow-up to the field debugger's
 * investigation into an intermittent chat/research stall — the investigation
 * report could not conclusively pin down a root cause, so this adds
 * visibility/resilience rather than a targeted fix). Catches any otherwise-
 * uncaught render error anywhere under `<App>` so a single broken screen
 * shows a recoverable fallback instead of a blank white window, and logs the
 * error for later diagnosis.
 *
 * Class component because `componentDidCatch`/`getDerivedStateFromError`
 * have no hook equivalent in React 18. Kept deliberately dependency-free
 * (no other renderer module, no CSS import) so it keeps working even when
 * the module that crashed is deeply wired into shared app state.
 */
import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

const CONTAINER_STYLE: CSSProperties = {
  maxWidth: 560,
  margin: '80px auto',
  padding: 24,
  fontSize: 18,
  lineHeight: 1.6,
  textAlign: 'center',
};

const ERROR_MESSAGE_STYLE: CSSProperties = {
  fontSize: 13,
  color: '#666',
  wordBreak: 'break-word',
};

const RETRY_BUTTON_STYLE: CSSProperties = {
  marginTop: 16,
  fontSize: 16,
  padding: '10px 20px',
  borderRadius: 8,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  cursor: 'pointer',
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  private handleRetry = (): void => {
    // Resets local state only — remounts `children` from scratch, which is
    // enough to recover from most transient render errors (stale/undefined
    // data shape, etc.) without restarting the whole app.
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div style={CONTAINER_STYLE}>
        <p>화면에 문제가 생겼어요. 앱을 껐다가 다시 켜 주세요.</p>
        <p>문제가 반복되면 이 화면을 캡처해서 알려 주세요.</p>
        <p style={ERROR_MESSAGE_STYLE}>{error.message}</p>
        <button type="button" onClick={this.handleRetry} style={RETRY_BUTTON_STYLE}>
          다시 시도
        </button>
      </div>
    );
  }
}
