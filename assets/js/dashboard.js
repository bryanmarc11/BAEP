function readProgressCache() {
  try {
    const raw = localStorage.getItem("bsess_progress_v2");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn("[BSESS] could not read progress cache", e);
    return {};
  }
}

function init() {
  const manifest = window.BSESS_MANIFEST;
  const dash = document.getElementById("dashboard");
  if (!manifest || !dash) {
    if (dash) {
      while (dash.firstChild) dash.removeChild(dash.firstChild);
      const err = document.createElement("p");
      err.className = "error-banner";
      err.setAttribute("role", "alert");
      err.textContent = "Could not load the area manifest (data/manifest.js). Check that the file exists and was not blocked by the browser.";
      dash.appendChild(err);
    }
    return;
  }
  const progress = readProgressCache();

  const h2 = document.createElement("h2");
  h2.textContent = "Evidence Progress Dashboard";
  dash.appendChild(h2);

  let totalLeaves = 0, totalDone = 0;
  const grid = document.createElement("div");
  grid.className = "progress-grid";

  manifest.areas.forEach((area) => {
    const p = progress[area.id];
    const total = p ? p.total : area.leafTotal;
    const done = p ? p.withEvidence : 0;
    totalLeaves += total;
    totalDone += done;
    const pct = total ? Math.round((100 * done) / total) : 0;

    const card = document.createElement("div");
    card.className = "progress-card";
    const a = document.createElement("a");
    a.href = area.page;
    a.textContent = "Area " + area.roman + " — " + area.title;
    card.appendChild(a);
    const label = document.createElement("div");
    label.className = "hint";
    label.textContent = done + " / " + total + " indicators evidenced (" + pct + "%)" + (p ? "" : " — not yet visited");
    card.appendChild(label);
    const bar = document.createElement("div");
    bar.className = "bar";
    const span = document.createElement("span");
    span.style.width = pct + "%";
    bar.appendChild(span);
    card.appendChild(bar);
    grid.appendChild(card);
  });

  const overallPct = totalLeaves ? Math.round((100 * totalDone) / totalLeaves) : 0;
  const summary = document.createElement("p");
  summary.textContent =
    "Overall: " + totalDone + " / " + totalLeaves + " indicators & sub-indicators across all 10 Areas have at least one evidence item staged (" + overallPct + "%). Visit each Area page at least once to include it in this count.";
  dash.appendChild(summary);
  dash.appendChild(grid);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
