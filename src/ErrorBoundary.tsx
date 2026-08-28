import { Component, type ErrorInfo, type ReactNode } from 'react'

const WORKSPACE_STORAGE_KEY = 'curbcut.workspace.v1'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Curbcut render failed', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="fatal-error" role="alert">
        <p className="detail-kicker">Workspace error</p>
        <h1>Curbcut could not render this workspace.</h1>
        <p>{this.state.error.message}</p>
        <div className="fatal-error-actions">
          <button type="button" className="primary-action" onClick={() => location.reload()}>Reload workspace</button>
          <button type="button" onClick={() => {
            localStorage.removeItem(WORKSPACE_STORAGE_KEY)
            location.reload()
          }}>Reset local source</button>
        </div>
      </main>
    )
  }
}
