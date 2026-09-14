(() => {
  "use strict";

  const toast = document.querySelector("#toast");
  const message = document.querySelector("#toastMessage");
  const closeButton = document.querySelector("#toastClose");
  let timer;

  function showUnavailable(program) {
    if (!toast || !message) return;
    message.textContent = `${program} program compliance portal is not available yet. Please select BSESS.`;
    toast.hidden = false;
    window.clearTimeout(timer);
    timer = window.setTimeout(hideToast, 4500);
  }

  function hideToast() {
    if (toast) toast.hidden = true;
    window.clearTimeout(timer);
  }

  document.querySelectorAll("[data-program]").forEach((control) => {
    control.addEventListener("click", () => showUnavailable(control.dataset.program));
  });

  closeButton?.addEventListener("click", hideToast);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideToast();
  });
})();
