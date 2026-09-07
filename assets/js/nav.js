export function initDrawer() {
  const hamburger = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("navOverlay");
  if (!hamburger || !sidebar) return;

  function open() {
    sidebar.classList.add("open");
    if (overlay) overlay.classList.add("show");
    hamburger.setAttribute("aria-expanded", "true");
    const firstLink = sidebar.querySelector("a");
    if (firstLink) firstLink.focus();
  }
  function close() {
    sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
    hamburger.setAttribute("aria-expanded", "false");
    hamburger.focus();
  }
  hamburger.addEventListener("click", () => {
    sidebar.classList.contains("open") ? close() : open();
  });
  if (overlay) overlay.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar.classList.contains("open")) close();
  });
}

export function initTreeKeyboardNav(root) {
  const scope = root || document;
  const lists = scope.querySelectorAll("ul.param-list, ul.node-list, ul.node-children");
  lists.forEach((list) => {
    const summaries = Array.from(list.children)
      .map((li) => li.querySelector(":scope > details > summary"))
      .filter(Boolean);
    summaries.forEach((summary, idx) => {
      summary.addEventListener("keydown", (e) => {
        let target = null;
        if (e.key === "ArrowDown") target = summaries[idx + 1];
        else if (e.key === "ArrowUp") target = summaries[idx - 1];
        else if (e.key === "Home") target = summaries[0];
        else if (e.key === "End") target = summaries[summaries.length - 1];
        if (target) {
          e.preventDefault();
          target.focus();
        }
      });
    });
  });
}

export function initPrintButtons() {
  document.querySelectorAll(".print-param-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      document.querySelectorAll("details.param-details").forEach((d) => {
        d.dataset.wasOpen = d.open ? "1" : "0";
      });
      document.querySelectorAll("details").forEach((d) => (d.open = true));
      document.body.classList.add("print-single-param");
      document.querySelectorAll(".param-details").forEach((d) => {
        d.classList.toggle("print-target", d.id === targetId);
      });
      let style = document.getElementById("printSingleStyle");
      if (!style) {
        style = document.createElement("style");
        style.id = "printSingleStyle";
        document.head.appendChild(style);
      }
      style.textContent =
        "@media print{ body.print-single-param .param-details{display:none !important} " +
        "body.print-single-param .param-details.print-target{display:block !important} }";
      window.print();
    });
  });
}

window.addEventListener("afterprint", () => {
  document.body.classList.remove("print-single-param");
  document.querySelectorAll("details.param-details").forEach((d) => {
    d.open = d.dataset.wasOpen === "1";
  });
});
