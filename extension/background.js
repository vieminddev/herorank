/**
 * VieRank extension — MV3 service worker.
 *
 * Owns the authed API calls (so the bearer token never lives in the Etsy page context) and the
 * stored config (apiBase + token). Content script and popup talk to it via chrome.runtime messages.
 */

const DEFAULT_API_BASE = "http://localhost:3001";

async function getConfig() {
  const { apiBase, token } = await chrome.storage.sync.get(["apiBase", "token"]);
  return { apiBase: (apiBase || DEFAULT_API_BASE).replace(/\/+$/, ""), token: token || "" };
}

async function apiGet(path) {
  const { apiBase, token } = await getConfig();
  if (!token) return { ok: false, status: 401, error: "NOT_PAIRED" };
  let res;
  try {
    res = await fetch(`${apiBase}${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (e) {
    return { ok: false, status: 0, error: "NETWORK" };
  }
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "getConfig":
        sendResponse(await getConfig());
        break;
      case "setConfig": {
        const patch = {};
        if (typeof msg.apiBase === "string") patch.apiBase = msg.apiBase.trim().replace(/\/+$/, "");
        if (typeof msg.token === "string") patch.token = msg.token.trim();
        await chrome.storage.sync.set(patch);
        sendResponse({ ok: true });
        break;
      }
      case "listing":
        sendResponse(await apiGet(`/api/ext/listing/${encodeURIComponent(msg.id)}`));
        break;
      case "keyword":
        sendResponse(await apiGet(`/api/ext/keyword?q=${encodeURIComponent(msg.q)}`));
        break;
      case "shop":
        sendResponse(await apiGet(`/api/ext/shop/${encodeURIComponent(msg.name)}`));
        break;
      case "ping":
        // Cheap auth check: a keyword call with a tiny query.
        sendResponse(await apiGet(`/api/ext/keyword?q=test`));
        break;
      default:
        sendResponse({ ok: false, error: "UNKNOWN_MESSAGE" });
    }
  })();
  return true; // async sendResponse
});
