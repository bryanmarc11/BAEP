/* ============================================================================
   motion.js — BSESS Accreditation Evidence Portal
   Appendable animation layer. Adds real motion on top of the existing
   markup WITHOUT changing evidence.js, nav.js, backend.js, or main.js.

   WHAT THIS ADDS
   1. Smooth open/close for every <details> disclosure (section-details,
      param-details, node-details) using the Web Animations API. Native
      <details> snaps open/closed instantly with no way to transition
      height in CSS alone across browsers — this fixes that.
   2. A brief highlight pulse on a status pill right after its status
      changes, and a fade-in on evidence rows as they're (re)rendered,
      so the task force gets visible confirmation instead of a silent
      DOM update.
   3. Full respect for prefers-reduced-motion and for browsers without
      the Web Animations API: both fall back to instant native behaviour,
      so nothing ever breaks or feels laggy for anyone.

   WHY THE AUTO-WRAP STEP EXISTS
   section-details and param-details each wrap their revealed content in
   ONE element (<div class="param-body">), so animating that one element's
   height is enough. node-details (used for parent indicators like S.5,
   I.2, I.3, O.2) has TWO separate direct children — a .ev-block and a
   <ul class="node-children"> — with no shared wrapper. Animating only one
   of them would leave the other snapping open/closed untouched. The first
   time a node-details is toggled, this script moves its non-summary
   children into one synthetic wrapper <div class="bsess-details-body">,
   then reuses that wrapper on every later toggle. This does not remove or
   rename any existing class, id, or data-path — evidence.js's own
   selectors keep working unchanged, just one DOM level deeper.

   INSTALLATION: add ONE line, after main.js (and after section-ux.js, if
   you use that patch), and link motion.css in <head>:
       <link rel="stylesheet" href="assets/css/motion.css">
       ...
       <script src="assets/js/motion.js"></script>

   Requires no changes to any other file. Safe to include twice.
   ============================================================================ */
(function () {
  "use strict";

  if (window.__bsessMotionLoaded) return;
  window.__bsessMotionLoaded = true;

  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var supportsAnimate = typeof Element !== "undefined" && typeof Element.prototype.animate === "function";
  var DURATION = 220;
  var EASING = "cubic-bezier(.4,0,.2,1)";
  var canAnimateAccordion = supportsAnimate && !reduceMotion;

  /* ------------------------------------------------------------------
     Resolve (and, if needed, create once) the single element whose
     height represents "the revealed content" of a <details>.
     ------------------------------------------------------------------ */
  function getOrCreateBody(details) {
    if (details.__bsessBody) return details.__bsessBody;

    var summary = details.querySelector(":scope > summary");
    var rest = Array.prototype.filter.call(details.children, function (c) { return c !== summary; });
    if (!rest.length) return null;

    if (rest.length === 1) {
      details.__bsessBody = rest[0];
      return rest[0];
    }

    var wrapper = document.createElement("div");
    wrapper.className = "bsess-details-body";
    rest.forEach(function (el) { wrapper.appendChild(el); }); // moves, preserves order
    details.appendChild(wrapper);
    details.__bsessBody = wrapper;
    return wrapper;
  }

  /* ------------------------------------------------------------------
     1. Smooth accordion open/close, wired once per <details>.
     ------------------------------------------------------------------ */
  function animateDetails(details, opening) {
    var body = getOrCreateBody(details);
    if (!body) { details.open = opening; return; }

    if (opening) details.open = true; // reveal so scrollHeight can be measured
    var endHeight = opening ? body.scrollHeight : 0;
    var startHeight = opening ? 0 : body.scrollHeight;

    details.setAttribute("data-bsess-animating", "true");
    var anim = body.animate(
      [
        { height: startHeight + "px", opacity: opening ? 0.4 : 1 },
        { height: endHeight + "px", opacity: opening ? 1 : 0.4 }
      ],
      { duration: DURATION, easing: EASING }
    );

    anim.onfinish = function () {
      details.removeAttribute("data-bsess-animating");
      body.style.height = "";
      body.style.opacity = "";
      if (!opening) details.open = false; // fires 'toggle' — section-ux.js persistence still works
    };
  }

  function wireAccordion(root) {
    (root || document).querySelectorAll("details").forEach(function (details) {
      var summary = details.querySelector(":scope > summary");
      if (!summary || summary.__bsessWired) return;
      summary.__bsessWired = true;

      summary.addEventListener("click", function (evt) {
        if (!canAnimateAccordion) return; // let native instant toggle happen
        if (details.hasAttribute("data-bsess-animating")) { evt.preventDefault(); return; } // ignore rapid re-clicks mid-animation
        evt.preventDefault();
        animateDetails(details, !details.open);
      });
    });
  }

  /* ------------------------------------------------------------------
     2. Feedback pulse on status change; fade-in on (re)rendered
        evidence rows. Hooks the app's own custom events + a
        MutationObserver instead of touching evidence.js.
     ------------------------------------------------------------------ */
  function pulseStatusPills() {
    document.querySelectorAll(".status-pill").forEach(function (pill) {
      pill.classList.remove("bsess-flash");
      void pill.offsetWidth; // restart the CSS animation
      pill.classList.add("bsess-flash");
    });
  }

  function watchEvidenceLists() {
    if (typeof MutationObserver === "undefined") return;
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && node.classList && node.classList.contains("evidence-item")) {
            node.classList.add("bsess-enter");
          }
        });
      });
    });
    document.querySelectorAll(".evidence-list[data-role='list']").forEach(function (list) {
      observer.observe(list, { childList: true });
    });
  }

  /* ------------------------------------------------------------------ */
  function init() {
    wireAccordion();

    if (!reduceMotion) {
      document.addEventListener("bsess:status-changed", pulseStatusPills);
      document.addEventListener("bsess:evidence-changed", pulseStatusPills);
      watchEvidenceLists();
    }

    // Shared mode (backend.js) repaints the tree asynchronously after the
    // initial load, and section-ux.js can also re-render on toggle. Any
    // <details> that appears later still needs its click handler wired.
    if (typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(function () { wireAccordion(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
