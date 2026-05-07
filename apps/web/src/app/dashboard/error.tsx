'use client';

/** Dashboard error boundary (S2). */
import { AppNav } from '@/components/app-nav';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div data-page="dashboard">
      <AppNav current="dashboard" />
      <div className="dash-shell">
        <div
          role="alert"
          style={{
            padding: 48,
            border: '1px solid var(--rule)',
            borderRadius: 12,
            marginTop: 24,
            background: 'var(--paper-2)',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontSize: 32,
              color: 'var(--warn)',
              marginBottom: 12,
            }}
          >
            Something broke.
          </h1>
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 13,
              color: 'var(--ink-soft)',
              marginBottom: 16,
            }}
          >
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '10px 20px',
              background: 'var(--ink)',
              color: 'var(--paper)',
              border: 0,
              borderRadius: 6,
              fontFamily: 'var(--mono)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
