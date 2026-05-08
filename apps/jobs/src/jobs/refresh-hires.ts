// Cron: refresh_hires — every 6h.
// Refreshes Company.hiresPostedCount via raw SQL UPDATE that does NOT bump
// updated_at (per BE_LEAD coordination flag — preserves ETag stability per B5).
// STUB. TODO(WK2): implement once scrape-yc is live.
export async function run(): Promise<void> {
  console.warn('[refresh-hires] STUB — not implemented yet (WK2 deliverable)');
}
