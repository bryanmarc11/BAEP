import { initEvidence, computeAndCacheAreaProgress } from "./evidence.js";
import { initDrawer, initTreeKeyboardNav, initPrintButtons } from "./nav.js";

function showFatalError(err) {
  console.error("[BSESS] fatal init error:", err);
  const bar = document.createElement("div");
  bar.className = "error-banner";
  bar.setAttribute("role", "alert");
  bar.textContent =
    "Something went wrong loading the interactive evidence tools on this page (" +
    (err && err.message ? err.message : "unknown error") +
    "). The read-only content above is unaffected; try reloading the page.";
  const main = document.querySelector("main");
  if (main) main.insertBefore(bar, main.firstChild);
  else document.body.insertBefore(bar, document.body.firstChild);
}

function init() {
  try { initDrawer(); } catch (e) { console.warn("[BSESS] drawer init failed", e); }
  try { initEvidence(); } catch (e) { showFatalError(e); }
  try { initTreeKeyboardNav(document); } catch (e) { console.warn("[BSESS] keyboard nav init failed", e); }
  try { initPrintButtons(); } catch (e) { console.warn("[BSESS] print buttons init failed", e); }
  try {
    const areaId = document.body.dataset.areaId;
    if (areaId) {
      computeAndCacheAreaProgress(areaId);
      document.addEventListener("bsess:evidence-changed", () => computeAndCacheAreaProgress(areaId));
      document.addEventListener("bsess:status-changed", () => computeAndCacheAreaProgress(areaId));
    }
  } catch (e) { console.warn("[BSESS] progress cache init failed", e); }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
