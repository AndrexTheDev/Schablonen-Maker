import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Fehler nicht verschlucken: im Zweifel sichtbar machen.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui', color: '#e8ecf1' }}>
          <h2>Da ist etwas schiefgelaufen</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#ffb020', fontSize: 12 }}>{String(this.state.error.stack ?? this.state.error)}</pre>
          <button
            onClick={() => location.reload()}
            style={{ marginTop: 16, padding: '8px 14px', borderRadius: 8, border: '1px solid #444', background: '#222', color: '#fff', cursor: 'pointer' }}
          >
            Neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
