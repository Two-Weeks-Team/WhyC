// Cron: scrape_yc — every 6h.
// Pulls public YC batch listings into Postgres. STUB.
// TODO(WK3): implement with cheerio + workatastartup.com public pages,
// honoring robots.txt and the dataset-verification protocol in
// docs/dataset-verification.md.
export async function run(): Promise<void> {
  console.warn('[scrape-yc] STUB — not implemented yet (WK3 deliverable)');
}
