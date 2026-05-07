/**
 * Landing page — pixel-fidelity port of `runs/<id>/prototypes/landing-v1.html`.
 *
 * Strategy:
 *   - Inline `<style>` from the prototype lives in `globals.css` scoped under
 *     `[data-page='landing']`. This keeps the editorial typography a self-
 *     contained system without leaking into dashboard/detail pages.
 *   - Every section from the prototype is preserved: nav / hero / problem
 *     ledger / pipeline / wall / methodology / CTA / footer.
 *   - Copy is verbatim from the prototype. The "While they hire, we ship."
 *     headline is intentional brand voice (per design-approved.json).
 *   - Footer disclaimer block is verbatim per M4 supersede (mitigations.json).
 *   - The hero `<article class='receipt'>` is rendered inline (matches the
 *     prototype layout exactly) rather than via the shared `<ReceiptCard>`,
 *     because the hero variant carries the "RECEIPT — sample" stamp + climb
 *     bar animation that the dashboard variant does not.
 *   - All anchor links resolve to in-page IDs; cross-page links go to
 *     `/dashboard`.
 *
 * The page is a server component (no `'use client'`) — pure HTML output, no
 * client state. The dashboard CTA hits `/dashboard` (typed-routes safe).
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'WhyC — While they hire, we ship.',
  description:
    "An autonomous agent that ingests Y Combinator batches and ships working previews — receipts attached.",
};

export default function LandingPage() {
  return (
    <div data-page="landing">
      <nav className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            W
          </span>{' '}
          WhyC
        </div>
        <div className="links" role="navigation" aria-label="Primary">
          <a href="#problem">The receipts</a>
          <a href="#pipeline">How it works</a>
          <a href="#wall">Live previews</a>
          <a href="#method">Methodology</a>
        </div>
        <Link
          className="cta"
          href="/dashboard"
          aria-label="Open the WhyC dashboard"
        >
          View dashboard →
        </Link>
      </nav>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-grid">
            <div>
              <h1 id="hero-title" className="display">
                While they
                <br />
                <span className="em">hire</span>,<br />
                <span className="stamp">we ship.</span>
              </h1>
              <p className="sub">
                WhyC is an autonomous agent that ingests{' '}
                <span className="pop">Y Combinator batches</span> and ships
                working previews of the products they've been hiring engineers
                to build —{' '}
                <span className="pop">in 11 minutes, not 11 months.</span>{' '}
                Receipts attached.
              </p>
              <div className="meta-row" aria-label="Project credentials">
                <span>
                  <b>Stack</b> · Gemini ADK · Phoenix MCP · Cloud Run
                </span>
                <span>
                  <b>Track</b> · Arize
                </span>
                <span>
                  <b>License</b> · Apache-2.0
                </span>
              </div>
            </div>

            <article className="receipt" aria-label="Sample preview receipt">
              <h3>
                anon co. <small>YC W26 · sample</small>
              </h3>
              <dl>
                <dt>Demo Day</dt>
                <dd>2026-03-15</dd>
                <dt>Engineer hires posted</dt>
                <dd>14</dd>
                <dt>Days since Demo Day</dt>
                <dd>53</dd>
                <dt>Product launched</dt>
                <dd>—</dd>
                <div className="rule" />
                <dt>WhyC ship time</dt>
                <dd>11m 04s</dd>
                <dt>Cost</dt>
                <dd aria-label="0 dollars and 41 cents">$0.41</dd>
                <dt>Iterations</dt>
                <dd>7 → converged</dd>
                <dt className="climb-label">spec-fit</dt>
                <dd>
                  <b>96%</b>
                </dd>
                <div
                  className="climb"
                  aria-label="Spec-fit 96 percent, converged at or above 92 percent"
                >
                  <div
                    className="bar"
                    role="progressbar"
                    aria-valuenow={96}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <i />
                  </div>
                </div>
              </dl>
              <a className="url" href="#wall">
                https://whyc-w26-anon.run.app ↗
              </a>
            </article>
          </div>
        </section>

        <section
          className="problem"
          id="problem"
          aria-labelledby="problem-title"
        >
          <div className="problem-grid">
            <div>
              <p className="eyebrow">The Receipts</p>
              <h2 id="problem-title" className="h2">
                Six months <em>after</em> Demo Day, half the batch is still
                hiring.
              </h2>
              <p className="lede">
                Every line below is verifiable from public job-posting data.
                None of these statements are an opinion. The product launch
                column does the talking.
              </p>
            </div>
            <ul className="ledger" aria-label="Public-data ledger">
              <li className="featured">
                <span className="num">187</span>
                <span className="lab">
                  days the median W25 company has been hiring engineers since
                  their Demo Day
                </span>
                <span className="src">[TK pending scrape]</span>
              </li>
              <li>
                <span className="num">47%</span>
                <span className="lab">
                  of W25 companies still posting eng roles as of 2026-05-07
                </span>
                <span className="src">[TK pending scrape]</span>
              </li>
              <li>
                <span className="num">12</span>
                <span className="lab">
                  companies WhyC selected from W25/S25/W26 → shipped a working
                  preview
                </span>
                <span className="src">[live below]</span>
              </li>
              <li>
                <span className="num">11m</span>
                <span className="lab">
                  median end-to-end ship time for the WhyC pipeline
                </span>
                <span className="src">[Phoenix telemetry]</span>
              </li>
              <li>
                <span className="num">$0.41</span>
                <span className="lab">
                  median cost per converged preview, all-in (Gemini + Cloud Run
                  + Phoenix)
                </span>
                <span className="src">[GCP billing]</span>
              </li>
            </ul>
          </div>
        </section>

        <section
          className="pipeline"
          id="pipeline"
          aria-labelledby="pipeline-title"
        >
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <p className="eyebrow">How it works</p>
            <h2 id="pipeline-title" className="h2">
              Four stages. <em>One agent.</em> No humans-in-the-loop.
            </h2>
            <p className="lede">
              The agent owns its own judgment. It decides which companies it
              can credibly ship. It writes its own evaluation prompt. It
              iterates until it's right.
            </p>
          </div>

          <div className="pipe" aria-label="Pipeline stages">
            <div className="stage active">
              <div className="dot" aria-hidden="true" />
              <h4>01 · Analyze</h4>
              <p>Read the public posting.</p>
              <small>
                Gemini ADK extracts product hypothesis from the YC blurb + open
                job descriptions. Outputs a 14-line spec.
              </small>
            </div>
            <div className="stage active">
              <div className="dot" aria-hidden="true" />
              <h4>02 · Go / No-Go</h4>
              <p>Decide what to ship.</p>
              <small>
                Cost ceiling $5. Complexity ≤7 iter. IP-safe. Demo-able.
                Failures get a public "why we passed" card.
              </small>
            </div>
            <div className="stage active">
              <div className="dot" aria-hidden="true" />
              <h4>03 · Develop</h4>
              <p>Generate a Next.js scaffold.</p>
              <small>
                Design tokens · 1–2 working APIs · seed data · OpenInference
                auto-instrumentation throughout.
              </small>
            </div>
            <div className="stage active">
              <div className="dot" aria-hidden="true" />
              <h4>04 · Deploy</h4>
              <p>Ship to Cloud Run. Self-improve.</p>
              <small>
                Phoenix MCP queries traces. LLM-as-judge scores spec-fit.
                Under-spec flows regenerate until convergence.
              </small>
            </div>
          </div>

          <div className="pipe-loop" role="note">
            <span className="icon" aria-hidden="true">
              ↻
            </span>
            <div className="txt">
              <b>The self-improvement loop is the killer feature.</b>
              <p>
                Phoenix MCP is the agent's own audit log. The judge prompt is
                versioned at{' '}
                <code className="inline">/eval/judge_prompt.v1.md</code> and
                shown verbatim in the UI.
              </p>
            </div>
            <div className="climb-mini">
              71% → 84% → 92% → <i>96% converged</i>
            </div>
          </div>
        </section>

        <section className="wall" id="wall" aria-labelledby="wall-title">
          <div className="wall-grid">
            <div className="wall-head">
              <h2 id="wall-title" className="h2">
                Click any URL. <em>Open the preview.</em>
              </h2>
              <p className="lede">
                12 real Y Combinator companies, selected from W25/S25/W26
                batches. Each card is a public deploy. The numbers below are
                the receipts.
              </p>
            </div>
            <div className="wall-cards" role="list">
              <article className="wcard" role="listitem">
                <h5>anon-1</h5>
                <p className="batch">YC W26 · Fintech</p>
                <dl>
                  <dt>Days since DD</dt>
                  <dd>53</dd>
                  <dt>Hires posted</dt>
                  <dd>14</dd>
                  <dt>WhyC ship time</dt>
                  <dd>11m 04s</dd>
                  <dt>spec-fit</dt>
                  <dd>96%</dd>
                  <dt>Cost</dt>
                  <dd>$0.41</dd>
                </dl>
                <div className="status shipped">
                  <span className="badge">shipped</span>
                  <Link className="arrow" href="/dashboard">
                    view ↗
                  </Link>
                </div>
              </article>
              <article className="wcard" role="listitem">
                <h5>anon-2</h5>
                <p className="batch">YC W26 · Devtools</p>
                <dl>
                  <dt>Days since DD</dt>
                  <dd>53</dd>
                  <dt>Hires posted</dt>
                  <dd>9</dd>
                  <dt>WhyC ship time</dt>
                  <dd>9m 12s</dd>
                  <dt>spec-fit</dt>
                  <dd>92%</dd>
                  <dt>Cost</dt>
                  <dd>$0.34</dd>
                </dl>
                <div className="status shipped">
                  <span className="badge">shipped</span>
                  <Link className="arrow" href="/dashboard">
                    view ↗
                  </Link>
                </div>
              </article>
              <article className="wcard" role="listitem">
                <h5>anon-3</h5>
                <p className="batch">YC S25 · Vertical AI</p>
                <dl>
                  <dt>Days since DD</dt>
                  <dd>237</dd>
                  <dt>Hires posted</dt>
                  <dd>21</dd>
                  <dt>WhyC verdict</dt>
                  <dd>No-Go</dd>
                  <dt>Reason</dt>
                  <dd>regulated</dd>
                  <dt>Cost</dt>
                  <dd>$0.00</dd>
                </dl>
                <div className="status nogo">
                  <span className="badge">no-go</span>
                  <Link className="arrow" href="/dashboard">
                    why ↗
                  </Link>
                </div>
              </article>
              <article className="wcard" role="listitem">
                <h5>anon-4</h5>
                <p className="batch">YC W25 · Marketplace</p>
                <dl>
                  <dt>Days since DD</dt>
                  <dd>418</dd>
                  <dt>Hires posted</dt>
                  <dd>32</dd>
                  <dt>WhyC ship time</dt>
                  <dd>14m 28s</dd>
                  <dt>spec-fit</dt>
                  <dd>94%</dd>
                  <dt>Cost</dt>
                  <dd>$0.52</dd>
                </dl>
                <div className="status shipped">
                  <span className="badge">shipped</span>
                  <Link className="arrow" href="/dashboard">
                    view ↗
                  </Link>
                </div>
              </article>
              <article className="wcard" role="listitem">
                <h5>anon-5</h5>
                <p className="batch">YC S25 · Consumer</p>
                <dl>
                  <dt>Days since DD</dt>
                  <dd>237</dd>
                  <dt>Hires posted</dt>
                  <dd>11</dd>
                  <dt>WhyC ship time</dt>
                  <dd>10m 47s</dd>
                  <dt>spec-fit</dt>
                  <dd>91%</dd>
                  <dt>Cost</dt>
                  <dd>$0.38</dd>
                </dl>
                <div className="status shipped">
                  <span className="badge">shipped</span>
                  <Link className="arrow" href="/dashboard">
                    view ↗
                  </Link>
                </div>
              </article>
              <article className="wcard" role="listitem">
                <h5>anon-6</h5>
                <p className="batch">YC W26 · B2B SaaS</p>
                <dl>
                  <dt>Days since DD</dt>
                  <dd>53</dd>
                  <dt>Hires posted</dt>
                  <dd>7</dd>
                  <dt>WhyC ship time</dt>
                  <dd>13m 05s</dd>
                  <dt>spec-fit</dt>
                  <dd>89%</dd>
                  <dt>Cost</dt>
                  <dd>$0.46</dd>
                </dl>
                <div className="status shipped">
                  <span className="badge">shipped</span>
                  <Link className="arrow" href="/dashboard">
                    view ↗
                  </Link>
                </div>
              </article>
            </div>
            <p className="wall-more">
              + 6 more in the full dashboard.{' '}
              <Link href="/dashboard">View all 12 receipts →</Link>
            </p>
          </div>
        </section>

        <section className="method" id="method" aria-labelledby="method-title">
          <div className="method-grid">
            <div>
              <p className="eyebrow">Methodology</p>
              <h2 id="method-title" className="h2">
                Five things that <em>shouldn't be controversial,</em> but are.
              </h2>
              <p className="lede">
                If your agent picks its own winners, it should also be willing
                to disqualify itself. WhyC does both, in public.
              </p>
            </div>
            <div className="method-list">
              <div className="item">
                <h4>The judge prompt is versioned and public.</h4>
                <p>
                  You can read <code>/eval/judge_prompt.v1.md</code>. You can
                  compare it to v2 when we change it. You can audit every
                  spec-fit score against the prompt that produced it.
                </p>
              </div>
              <div className="item">
                <h4>The spec-fit formula is deterministic.</h4>
                <p>
                  Same trace, same prompt, same score. Phoenix stores the seed.
                  Re-runs reproduce the number. No vibes.
                </p>
              </div>
              <div className="item">
                <h4>No-Go is a first-class outcome.</h4>
                <p>
                  Companies WhyC won't touch get a public card explaining why.
                  Hardware-bound, regulated, stealth, over-budget — all
                  surfaced, none hidden.
                </p>
              </div>
              <div className="item">
                <h4>Self-improvement uses the agent's own audit log.</h4>
                <p>
                  Phoenix MCP is queried by the agent itself, not by a sidecar.
                  Under-spec flows regenerate. The trace tree shows every
                  iteration.
                </p>
              </div>
              <div className="item">
                <h4>One stack. No SDK. No CLI. No Slack bot.</h4>
                <p>
                  A single Next.js + Cloud Run codebase. Two engineers.
                  Thirty-six days. Web-only on purpose — scope is the killer
                  feature too.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="cta" id="cta" aria-labelledby="cta-title">
          <div className="cta-inner">
            <h2 id="cta-title">
              Open <em>any</em> of the 12 receipts.
              <br />
              Then ask why theirs took longer.
            </h2>
            <p className="row">
              <Link className="btn btn-primary" href="/dashboard">
                View dashboard →
              </Link>
              <a
                className="btn btn-ghost"
                href="https://github.com/Two-Weeks-Team/WhyC"
                rel="noopener noreferrer"
                target="_blank"
              >
                Read the source →
              </a>
            </p>
            <small>
              Submission deadline · 2026-06-11 14:00 PT · Google Cloud Rapid
              Agent Hackathon · Arize Track
            </small>
          </div>
        </section>
      </main>

      <footer className="bottom">
        <div className="foot-grid">
          <div>
            <h6>WhyC</h6>
            <p className="foot-blurb">
              An autonomous agent that ingests Y Combinator batches and ships
              working previews. Independent research project. Two-person team.
            </p>
          </div>
          <div>
            <h6>Project</h6>
            <a
              href="https://github.com/Two-Weeks-Team/WhyC"
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub repo
            </a>
            <a
              href="https://github.com/Two-Weeks-Team/WhyC/blob/main/LICENSE"
              rel="noopener noreferrer"
              target="_blank"
            >
              Apache-2.0 license
            </a>
            <a
              href="https://rapid-agent.devpost.com/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Hackathon page
            </a>
          </div>
          <div>
            <h6>Methodology</h6>
            <a href="#method">How it works</a>
            <a href="#wall">Live receipts</a>
            <a href="#problem">Public data</a>
          </div>
          <div>
            <h6>Contact</h6>
            <a href="mailto:abuse@whyc.dev">abuse@whyc.dev</a>
            <a href="mailto:abuse@whyc.dev">Takedown · 1h SLA</a>
          </div>
        </div>
        <div className="disclaimer">
          <p>
            <b>Disclaimer.</b> WhyC is independent research. Inclusion of any
            company name is not endorsement by, affiliation with, or
            sponsorship by that company. All company information cited is
            sourced from publicly available job postings and Y Combinator's
            public batch listings. No company logos are reproduced. Companies
            that wish to be removed from the dataset can request takedown via
            the address above; we honor takedowns within 1 hour.
          </p>
          <p>
            Y Combinator and "YC" are trademarks of Y Combinator Management,
            LLC. WhyC is not affiliated with, endorsed by, or sponsored by Y
            Combinator. Use of the YC name is nominative fair use for the
            purpose of describing publicly observable behavior of YC-batched
            companies, in line with established commentary and research norms.
          </p>
          <p>
            Built by <b>Two Weeks Team</b> for the Google Cloud Rapid Agent
            Hackathon — Arize Track. Submission deadline: 2026-06-11 14:00 PT.
          </p>
        </div>
      </footer>
    </div>
  );
}
