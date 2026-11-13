import { Component, type ReactNode } from 'react'

/** Last line of defence: a rendering bug shows a friendly card instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="app">
        <main className="home">
          <div className="onboard-card glass" role="alert">
            <h2 className="serif onboard-title">Something went wrong</h2>
            <p className="muted">This view hit an unexpected error. Your settings and history are safe.</p>
            <div className="row gap end">
              <button
                className="primary-btn"
                onClick={() => {
                  this.setState({ failed: false })
                  this.props.onReset()
                }}
              >
                Back to modes
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }
}
