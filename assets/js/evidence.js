import { safeText } from "./sanitize.js";
import { getEvidence, setEvidence, getStatus, setStatus, storageAvailable } from "./storage.js";

const MAX_EMBED_BYTES = 4 * 1024 * 1024;
const STATUS_LABELS = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  "complete": "Complete",
  "verified": "Verified",
};

let evidenceStore = getEvidence();
let statusStore = getStatus();
let currentDialogPath = null;

function uid() {
  return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}
function humanSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}
function toast(msg, isError) {
  const old = document.getElementById("toast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.id = "toast";
  t.className = "toast";
  t.setAttribute("role", "status");
  safeText(t, msg);
  if (isError) t.style.background = "#7a1616";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

function buildEvidenceItemEl(path, item) {
  const li = document.createElement("li");
  li.className = "evidence-item";
  const meta = document.createElement("div");
  meta.className = "meta";
  const fname = document.createElement("div");
  fname.className = "fname";
  safeText(fname, item.title || "(untitled)");
  meta.appendChild(fname);

  const tags = document.createElement("div");
  const typeTag = document.createElement("span");
  typeTag.className = "tag";
  safeText(typeTag, item.type === "link" ? "External Link" : item.type === "embed" ? "Embedded Copy" : "File Reference");
  tags.appendChild(typeTag);
  const dateTag = document.createElement("span");
  dateTag.className = "tag";
  dateTag.style.background = "#555";
  safeText(dateTag, fmtDate(item.added));
  tags.appendChild(dateTag);
  meta.appendChild(tags);

  if (item.notes) {
    const notes = document.createElement("div");
    notes.className = "hint";
    safeText(notes, item.notes);
    meta.appendChild(notes);
  }

  const linkRow = document.createElement("div");
  linkRow.style.marginTop = ".3rem";
  if (item.type === "link") {
    const a = document.createElement("a");
    a.href = item.url; a.target = "_blank"; a.rel = "noopener";
    safeText(a, "Open link ↗");
    linkRow.appendChild(a);
  } else if (item.type === "path") {
    const a = document.createElement("a");
    a.href = item.path; a.target = "_blank"; a.rel = "noopener";
    safeText(a, "Open " + item.path + " ↗");
    linkRow.appendChild(a);
    const hint = document.createElement("span");
    hint.className = "hint";
    safeText(hint, " (relative to this page — file must exist there)");
    linkRow.appendChild(hint);
  } else if (item.type === "embed") {
    const a = document.createElement("a");
    a.href = item.dataUrl; a.download = item.title || "evidence";
    safeText(a, "Download embedded copy (" + humanSize(item.size || 0) + ") ↗");
    linkRow.appendChild(a);
  }
  meta.appendChild(linkRow);
  li.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "evidence-actions no-print";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn small btn-danger";
  safeText(delBtn, "Delete");
  delBtn.addEventListener("click", () => {
    if (!confirm("Remove this evidence entry (metadata only; the underlying file is untouched)?")) return;
    evidenceStore[path] = (evidenceStore[path] || []).filter((x) => x.id !== item.id);
    setEvidence(evidenceStore);
    renderBlock(path);
    document.dispatchEvent(new CustomEvent("bsess:evidence-changed"));
  });
  actions.appendChild(delBtn);
  li.appendChild(actions);
  return li;
}

function renderBlock(path) {
  const block = document.querySelector('.ev-block[data-path="' + CSS.escape(path) + '"]');
  if (!block) return;
  const status = statusStore[path] || "not-started";
  const select = block.querySelector(".status-select");
  if (select) select.value = status;
  const pill = block.querySelector('[data-role="pill"]');
  if (pill) {
    pill.className = "status-pill status-" + status;
    safeText(pill, STATUS_LABELS[status] || "Not Started");
  }
  const list = block.querySelector('[data-role="list"]');
  if (list) {
    while (list.firstChild) list.removeChild(list.firstChild);
    const items = evidenceStore[path] || [];
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "empty-note";
      safeText(li, "No evidence staged yet.");
      list.appendChild(li);
    } else {
      items.forEach((item) => list.appendChild(buildEvidenceItemEl(path, item)));
    }
  }
}

function renderAllBlocks() {
  document.querySelectorAll(".ev-block").forEach((block) => renderBlock(block.dataset.path));
}

function openDialog(path) {
  currentDialogPath = path;
  const dlg = document.getElementById("evidenceDialog");
  if (!dlg) return;
  safeText(document.getElementById("evPathLabel"), path);
  document.getElementById("evTitle").value = "";
  document.getElementById("evNotes").value = "";
  document.getElementById("evUrl").value = "";
  document.getElementById("evPath").value = "";
  document.getElementById("evFile").value = "";
  const radios = document.querySelectorAll('input[name="evType"]');
  radios.forEach((r) => (r.checked = r.value === "path"));
  toggleTypeFields();
  if (typeof dlg.showModal === "function") dlg.showModal();
  else toast("Your browser does not support the evidence dialog. Please update your browser.", true);
}

function toggleTypeFields() {
  const checked = document.querySelector('input[name="evType"]:checked');
  const type = checked ? checked.value : "path";
  document.getElementById("fieldPath").classList.toggle("hidden", type !== "path");
  document.getElementById("fieldUrl").classList.toggle("hidden", type !== "link");
  document.getElementById("fieldFile").classList.toggle("hidden", type !== "embed");
}

function saveFromDialog() {
  const title = document.getElementById("evTitle").value.trim();
  const notes = document.getElementById("evNotes").value.trim();
  const checked = document.querySelector('input[name="evType"]:checked');
  const type = checked ? checked.value : "path";
  if (!title) { toast("Please enter a title.", true); return; }

  function commit(entry) {
    entry.id = uid();
    entry.added = new Date().toISOString();
    entry.title = title;
    entry.notes = notes;
    entry.type = type;
    evidenceStore[currentDialogPath] = evidenceStore[currentDialogPath] || [];
    evidenceStore[currentDialogPath].push(entry);
    setEvidence(evidenceStore);
    document.getElementById("evidenceDialog").close();
    renderBlock(currentDialogPath);
    toast("Evidence added.");
    document.dispatchEvent(new CustomEvent("bsess:evidence-changed"));
  }

  try {
    if (type === "link") {
      const url = document.getElementById("evUrl").value.trim();
      if (!url) { toast("Please enter a URL.", true); return; }
      commit({ url });
    } else if (type === "path") {
      const p = document.getElementById("evPath").value.trim();
      if (!p) { toast("Please enter a relative file path.", true); return; }
      commit({ path: p });
    } else if (type === "embed") {
      const fileInput = document.getElementById("evFile");
      const file = fileInput.files[0];
      if (!file) { toast("Please choose a file to embed.", true); return; }
      if (file.size > MAX_EMBED_BYTES) {
        toast("File too large to embed (" + humanSize(file.size) + "). Use File Reference instead.", true);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => commit({ dataUrl: reader.result, size: file.size });
      reader.onerror = () => toast("Failed to read file.", true);
      reader.readAsDataURL(file);
    }
  } catch (e) {
    console.error("[BSESS] evidence save failed", e);
    toast("Could not save evidence: " + e.message, true);
  }
}

export function initEvidence() {
  document.querySelectorAll(".add-evidence-btn").forEach((btn) => {
    btn.disabled = false;
    btn.addEventListener("click", () => openDialog(btn.dataset.path));
  });
  document.querySelectorAll(".status-select").forEach((sel) => {
    sel.disabled = false;
    sel.addEventListener("change", (e) => {
      statusStore[e.target.dataset.path] = e.target.value;
      setStatus(statusStore);
      renderBlock(e.target.dataset.path);
      document.dispatchEvent(new CustomEvent("bsess:status-changed"));
    });
  });
  const radios = document.querySelectorAll('input[name="evType"]');
  radios.forEach((r) => r.addEventListener("change", toggleTypeFields));
  const saveBtn = document.getElementById("evSave");
  if (saveBtn) saveBtn.addEventListener("click", (e) => { e.preventDefault(); saveFromDialog(); });
  const cancelBtn = document.getElementById("evCancel");
  if (cancelBtn) cancelBtn.addEventListener("click", (e) => { e.preventDefault(); document.getElementById("evidenceDialog").close(); });

  renderAllBlocks();

  if (!storageAvailable) {
    const banner = document.createElement("div");
    banner.className = "banner";
    safeText(
      banner,
      "Local storage is unavailable in this browsing context (common under file:// in some browsers). " +
      "Your edits will not persist after reload. Run serve-offline.sh/.bat for full functionality."
    );
    const main = document.querySelector("main");
    if (main) main.insertBefore(banner, main.firstChild);
  }
}

const LS_PROGRESS = "bsess_progress_v2";

export function computeAndCacheAreaProgress(areaId) {
  const leafBlocks = document.querySelectorAll(".ev-block.leaf");
  let total = 0, withEvidence = 0;
  leafBlocks.forEach((block) => {
    total++;
    if ((evidenceStore[block.dataset.path] || []).length > 0) withEvidence++;
  });
  let progress = {};
  try {
    const raw = localStorage.getItem(LS_PROGRESS);
    progress = raw ? JSON.parse(raw) : {};
  } catch (e) { progress = {}; }
  progress[areaId] = { total, withEvidence, updated: new Date().toISOString() };
  try { localStorage.setItem(LS_PROGRESS, JSON.stringify(progress)); } catch (e) { /* quota errors ignored here */ }
  return progress[areaId];
}
