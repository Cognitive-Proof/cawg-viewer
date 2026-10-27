import { Component, type ReactNode } from 'react'

/** Keeps a crash in a third-party manifest panel from blanking the whole page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <p className="error">
          This view failed to render ({this.state.error.message}). Try another detail level or the Raw JSON tab.
        </p>
      )
    }
    return this.props.children
  }
}
