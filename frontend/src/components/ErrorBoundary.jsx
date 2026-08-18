import { Component } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Button from './ui/Button.jsx';
import { reportError } from '../services/errorReporting.js';

// Catches a render-time crash and shows something a person can act on.
//
// Without one, a single thrown error in any component unmounts the entire tree
// and leaves a blank white page — no message, no way back, and nothing in the
// UI to say what happened. In a hospital that is somebody mid-consultation
// losing the screen with no idea whether their last entry was saved.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the stack somewhere a developer can find it.
    console.error('Render error:', error, info?.componentStack);

    // And somewhere they will actually see it. Without this the report depends
    // on whoever hit the blank screen thinking to ring IT and describe it.
    //
    // The component stack is the useful half: the error's own stack points at
    // minified bundle offsets, while this names the component that threw and
    // the tree it was in.
    reportError(error, {
      mechanism: 'react.ErrorBoundary',
      componentStack: String(info?.componentStack || '').slice(0, 4000),
      route: window.location.pathname,
    });

    this.props.onError?.(error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>

          <h1 className="text-lg font-semibold text-fg">This screen ran into a problem</h1>
          <p className="mt-2 text-sm text-muted">
            Nothing you had already saved is affected. Reloading usually clears it.
          </p>

          {/* The message helps whoever gets the support call; the stack does not
              belong in front of a receptionist. */}
          {error?.message && (
            <p className="mt-3 break-words rounded-lg border border-border bg-bg px-3 py-2 text-left text-xs text-muted">
              {error.message}
            </p>
          )}

          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Reload
            </Button>
            <Button variant="outline" onClick={() => window.location.assign('/')}>
              <Home className="mr-2 h-4 w-4" aria-hidden="true" /> Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
