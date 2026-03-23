import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[JARVIS] Render error caught by boundary:', error, info)
  }

  override render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div
          className="flex flex-1 items-center justify-center"
          style={{ minHeight: 200 }}
        >
          <div
            className="rounded-xl px-5 py-4 max-w-md"
            style={{
              background: 'rgba(255,107,53,0.06)',
              border: '1px solid rgba(255,107,53,0.22)',
            }}
          >
            <p
              className="text-[11px] font-mono tracking-[0.16em] mb-2"
              style={{ color: '#ff6b35' }}
            >
              RENDER ERROR
            </p>
            <p className="text-[10px] font-mono leading-snug" style={{ color: 'rgba(192,232,240,0.62)' }}>
              {this.state.error.message}
            </p>
            <button
              type="button"
              className="mt-3 rounded px-3 py-1.5 text-[10px] font-mono tracking-[0.14em]"
              style={{
                color: 'rgba(0,212,255,0.75)',
                background: 'rgba(0,212,255,0.06)',
                border: '1px solid rgba(0,212,255,0.14)',
                cursor: 'pointer',
              }}
              onClick={() => this.setState({ error: null })}
            >
              RETRY
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
