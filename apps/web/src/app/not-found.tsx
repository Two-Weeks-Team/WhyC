/** Global 404 fallback (used for unknown company slugs). */
import Link from 'next/link';
import { AppNav } from '@/components/app-nav';

export default function NotFound() {
  return (
    <div data-page="detail">
      <AppNav />
      <div className="detail-shell">
        <div
          style={{
            padding: 64,
            textAlign: 'center',
            border: '1px dashed var(--rule)',
            borderRadius: 12,
            marginTop: 24,
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontSize: 64,
              marginBottom: 12,
            }}
          >
            404.
          </h1>
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 14,
              color: 'var(--ink-soft)',
              marginBottom: 24,
            }}
          >
            That receipt isn't in the dataset.
          </p>
          <Link
            href="/dashboard"
            style={{
              padding: '10px 20px',
              background: 'var(--ink)',
              color: 'var(--paper)',
              borderRadius: 6,
              fontFamily: 'var(--mono)',
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
