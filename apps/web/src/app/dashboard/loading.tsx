/** Dashboard loading state (S2). */
import { AppNav } from '@/components/app-nav';

export default function DashboardLoading() {
  return (
    <div data-page="dashboard">
      <AppNav current="dashboard" />
      <div className="dash-shell">
        <header className="dash-head">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Receipts.</h1>
          </div>
        </header>
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: 64,
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 13,
            color: 'var(--ink-dim)',
            border: '1px dashed var(--rule)',
            borderRadius: 12,
            marginTop: 24,
          }}
        >
          Loading receipts…
        </div>
      </div>
    </div>
  );
}
