import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
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
    console.error('Uncaught error in Popup:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-[380px] min-h-[460px] p-4 bg-slate-50 text-slate-800 flex flex-col justify-between select-none">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-amber-600 pb-2 border-b border-slate-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-xs font-bold text-slate-900">Popup Display Notice</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              The popup encountered a rendering issue. Your saved data is preserved.
            </p>
            <div className="p-2.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-mono text-slate-700 overflow-x-auto max-h-32">
              {this.state.error?.message || 'Unknown render exception'}
            </div>
          </div>
          <div className="pt-3 border-t border-slate-200 flex space-x-2">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Popup</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
