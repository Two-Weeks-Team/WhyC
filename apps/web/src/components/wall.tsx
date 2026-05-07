/**
 * Wall — read-only reaction wall (P15 light variant).
 *
 * The chosen-preview composite scopes this to READ-ONLY seed comments only;
 * there is no submit form and no moderation queue (per scope_guards_locked).
 *
 * SR posture (SC1 medium / H-A4):
 *   - Comments are wrapped in `<article>` with `lang={comment.body.language}`
 *     so SR engines pick the right voice profile.
 *   - `kind=public_quote` includes a `<cite>` linking to `source_url` with
 *     `rel="noopener noreferrer"` and an SR hint "(opens in a new window)".
 */

import type { Comment } from '@/lib/api/types';

export interface WallProps {
  comments: Comment[];
  /** Heading level (default h3 since the section already has h2). */
  headingLevel?: 'h2' | 'h3';
  /** Heading text. */
  heading?: string;
}

export function Wall({ comments, headingLevel = 'h3', heading }: WallProps) {
  const Tag = headingLevel;
  if (comments.length === 0) {
    return (
      <section aria-label="Reaction wall">
        {heading ? <Tag className="section-title">{heading}</Tag> : null}
        <p
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 13,
            color: 'var(--ink-dim)',
          }}
        >
          No reactions seeded yet.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Reaction wall">
      {heading ? <Tag className="section-title">{heading}</Tag> : null}
      <div className="wall-cards-detail" role="list">
        {comments.map((c) => (
          <article
            key={c.id}
            className="wall-comment"
            role="listitem"
            lang={c.body.language || 'en'}
          >
            <div className="meta">
              <span className={`kind ${c.kind}`}>
                {c.kind === 'public_quote' ? 'public quote' : 'team note'}
              </span>
              <time dateTime={c.posted_at}>
                {new Date(c.posted_at).toISOString().slice(0, 10)}
              </time>
            </div>
            <p>{c.body.text}</p>
            {c.kind === 'public_quote' && c.source_url ? (
              <cite>
                {c.author_handle ? `@${c.author_handle} · ` : ''}
                <a
                  href={c.source_url}
                  rel="noopener noreferrer"
                  target="_blank"
                  aria-label={`Source link${c.author_handle ? ` from @${c.author_handle}` : ''} (opens in a new window)`}
                >
                  source ↗
                </a>
              </cite>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
