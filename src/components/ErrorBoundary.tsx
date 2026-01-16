import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
            <p className="text-gray-600 mb-4">
              The application encountered an unexpected error. This might be due to a data consistency issue.
            </p>
            <div className="bg-gray-100 p-3 rounded mb-4 overflow-auto max-h-32 text-xs font-mono text-red-800">
              {this.state.error?.message}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Reload Application
              </button>
              <button
                onClick={() => {
                  // Emergency Reset
                  if (window.confirm('Delete all local data and reset? This cannot be undone.')) {
                     indexedDB.deleteDatabase('CourseManagementDB');
                     localStorage.clear();
                     window.location.reload();
                  }
                }}
                className="flex-1 px-4 py-2 bg-red-100 text-red-700 border border-red-200 rounded hover:bg-red-200 transition"
              >
                Reset Data
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
