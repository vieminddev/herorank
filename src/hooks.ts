import type { Reroute } from "@sveltejs/kit";

/**
 * Backward-compat routing for the 2026-06-29 path cleanup:
 *   - tools were flattened: `/tools/etsy/<x>` → `/tools/<x>`
 *   - the assistant was rebranded off the old name: `/tools/rankhero-ai` → `/tools/assistant`
 *
 * Old bookmarks and the already-deployed browser extension still link to the legacy paths, so we
 * transparently resolve them to the new routes (the URL bar keeps the old path; the new page renders).
 * Safe to remove once those links are no longer in the wild.
 */
export const reroute: Reroute = ({ url }) => {
  if (url.pathname === "/tools/rankhero-ai" || url.pathname.startsWith("/tools/rankhero-ai/")) {
    return url.pathname.replace("/tools/rankhero-ai", "/tools/assistant");
  }
  if (url.pathname.startsWith("/tools/etsy/")) {
    return url.pathname.replace("/tools/etsy/", "/tools/");
  }
};
