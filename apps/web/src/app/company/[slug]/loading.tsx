/** Detail page loading state (S2). */
import { AppNav } from '@/components/app-nav';

export default function CompanyLoading() {
  return (
    <div data-page="detail">
      <AppNav current="detail" />
      <div className="detail-shell">
        <p className="breadcrumb">
          <a href="/dashboard">← All receipts</a>
        </p>
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
          }}
        >
          Loading receipt…
        </div>
      </div>
    </div>
  );
}
