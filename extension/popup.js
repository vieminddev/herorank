const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (resp) => r(resp ?? {})));

function setStatus(state, text) {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + state;
}

async function refresh() {
  const cfg = await send({ type: "getConfig" });
  $("token").value = cfg.token || "";
  $("apiBase").value = cfg.apiBase || "";
  $("open").href = (cfg.apiBase || "http://localhost:3001") + "/settings/extension";
  if (!cfg.token) { setStatus("off", "Not connected"); return; }
  setStatus("wait", "Checking…");
  const ping = await send({ type: "ping" });
  if (ping.ok) setStatus("on", "Connected");
  else if (ping.status === 401) setStatus("off", "Bad token");
  else setStatus("off", "Can't reach VieRank");
}

$("save").addEventListener("click", async () => {
  const token = $("token").value.trim();
  const apiBase = $("apiBase").value.trim();
  $("msg").textContent = "";
  await send({ type: "setConfig", token, apiBase });
  // If a custom https host was set, request optional permission so the worker can fetch it.
  if (apiBase && /^https:\/\//.test(apiBase)) {
    try {
      const origin = new URL(apiBase).origin + "/*";
      await chrome.permissions.request({ origins: [origin] });
    } catch { /* user may decline; localhost works without this */ }
  }
  await refresh();
  const ok = $("status").classList.contains("on");
  $("msg").textContent = ok ? "Connected — open an Etsy listing to see it." : "Saved. Check your token / URL.";
  $("msg").className = "msg " + (ok ? "ok" : "warn");
});

refresh();
