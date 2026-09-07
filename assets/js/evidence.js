import { safeText } from "./sanitize.js";
import { getEvidence, setEvidence, getStatus, setStatus, storageAvailable } from "./storage.js";
import {
  backend, fetchAreaEvidence, fetchAreaStatus,
  addFileEvidence, addLinkEvidence, setIndicatorStatus,
  signedUrlFor, subscribeToArea, safeUrl, validPath,
} from "./backend.js";

/**
 * evidence.js — now backend-aware.
 *
 * Previously this module imported only storage.js, so every save went to
 * localStorage and was invisible to everyone else. backend.js existed but
 * nothing imported it, which is why "connecting" appeared to do nothing.
 *
 * Two modes:
 *   SHARED  — config.js has a URL + key. Reads and writes go to Supabase.
 *   LOCAL   — config blank or unreachable. Falls back to localStorage, and
 *             says so in a banner rather than pretending to be shared.
 */

const MAX_FILE_BYTES = 25 * 1024 * 1024;   // matches the bucket limit
const MAX_EMBED_BYTES = 4 * 1024 * 1024;   // local-mode dataURL ceiling
const STATUS_LABELS = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  "complete": "Complete",
  "verified": "Verified",
};

const AREA_ID = document.body.dataset.areaId || "";

let shared = false;          // true once a live read succeeds
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
  t.setAttribute("role", isError ? "alert" : "status");
  safeText(t, msg);
  if (isError) t.style.background = "#7a1616";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), isError ? 9000 : 4200);
}

function banner(msg, kind) {
  const b = document.createElement("div");
  b.className = kind === "error" ? "error-banner" : "banner";
  b.setAttribute("role", kind === "error" ? "alert" : "status");
  safeText(b, msg);
  const main = document.querySelector("main");
  if (main) main.insertBefore(b, main.firstChild);
  else document.body.insertBefore(b, document.body.firstChild);
}

/* ---------- normalisation -------------------------------------------------
 * Server rows and local rows have different shapes. Render against one shape
 * so the DOM code does not branch on mode.
 * -------------------------------------------------------------------------- */
function normalise(row) {
  if (row.__local) return row;
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    added: row.created_at,
    type: row.kind === "file" ? "upload" : "link",
    url: row.url || null,
    storageKey: row.storage_key || null,
    size: row.size_bytes || 0,
    filedBy: row.filed_by || "",
  };
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
  safeText(typeTag,
    item.type === "upload" ? "Uploaded File" :
    item.type === "link" ? "External Link" :
    item.type === "embed" ? "Embedded Copy (local only)" : "File Reference");
  tags.appendChild(typeTag);

  const dateTag = document.createElement("span");
  dateTag.className = "tag";
  dateTag.style.background = "#555";
  safeText(dateTag, fmtDate(item.added));
  tags.appendChild(dateTag);

  if (item.filedBy) {
    const byTag = document.createElement("span");
    byTag.className = "tag";
    byTag.style.background = "#555";
    safeText(byTag, "filed by " + item.filedBy);
    tags.appendChild(byTag);
  }
  meta.appendChild(tags);

  if (item.notes) {
    const notes = document.createElement("div");
    notes.className = "hint";
    safeText(notes, item.notes);
    meta.appendChild(notes);
  }

  const linkRow = document.createElement("div");
  linkRow.style.marginTop = ".3rem";

  if (item.type === "upload") {
    // Private bucket: no permanent URL. Mint a signed URL on click.
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn small";
    safeText(btn, "Open file (" + humanSize(item.size) + ") \u2197");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const url = await signedUrlFor(item.storageKey, 3600);
        window.open(url, "_blank", "noopener");
      } catch (e) {
        toast("Could not open file: " + e.message, true);
      } finally {
        btn.disabled = false;
      }
    });
    linkRow.appendChild(btn);
  } else if (item.type === "link" || item.type === "path") {
    // JS-REVIEW finding 1: validate before assigning to href.
    const href = safeUrl(item.url || item.path);
    if (href) {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      safeText(a, "Open \u2197");
      linkRow.appendChild(a);
    } else {
      const bad = document.createElement("span");
      bad.className = "hint";
      safeText(bad, "Unsafe or malformed link withheld: " + String(item.url || item.path));
      linkRow.appendChild(bad);
    }
  } else if (item.type === "embed") {
    const a = document.createElement("a");
    a.href = item.dataUrl;
    a.download = item.title || "evidence";
    safeText(a, "Download embedded copy (" + humanSize(item.size || 0) + ") \u2197");
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

  if (shared) {
    // Append-only by design. Explain rather than offer a button that fails.
    delBtn.disabled = true;
    delBtn.title = "Shared evidence is append-only. Remove it from the Supabase dashboard.";
  } else {
    delBtn.addEventListener("click", () => {
      if (!confirm("Remove this evidence entry (metadata only; the underlying file is untouched)?")) return;
      evidenceStore[path] = (evidenceStore[path] || []).filter((x) => x.id !== item.id);
      if (!setEvidence(evidenceStore)) {
        toast("Could not save: browser storage rejected the write.", true);
        return;
      }
      renderBlock(path);
      document.dispatchEvent(new CustomEvent("bsess:evidence-changed"));
    });
  }
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
    const items = (evidenceStore[path] || []).map(normalise);
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
  ["evTitle", "evNotes", "evUrl", "evPath", "evFile"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const radios = document.querySelectorAll('input[name="evType"]');
  radios.forEach((r) => (r.checked = r.value === (shared ? "embed" : "path")));
  toggleTypeFields();
  if (typeof dlg.showModal === "function") dlg.showModal();
  else toast("Your browser does not support the evidence dialog. Please update your browser.", true);
}

function toggleTypeFields() {
  const checked = document.querySelector('input[name="evType"]:checked');
  const type = checked ? checked.value : "path";
  const set = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", !on);
  };
  set("fieldPath", type === "path");
  set("fieldUrl", type === "link");
  set("fieldFile", type === "embed");
}

async function saveFromDialog() {
  const saveBtn = document.getElementById("evSave");
  const title = document.getElementById("evTitle").value.trim();
  const notes = document.getElementById("evNotes").value.trim();
  const checked = document.querySelector('input[name="evType"]:checked');
  const type = checked ? checked.value : "path";
  const path = currentDialogPath;

  if (!title) { toast("Please enter a title.", true); return; }
  if (shared && !validPath(path)) {
    toast("This indicator path is not in the expected format: " + path, true);
    return;
  }

  if (saveBtn) { saveBtn.disabled = true; safeText(saveBtn, "Saving\u2026"); }
  const done = (ok, msg) => {
    if (saveBtn) { saveBtn.disabled = false; safeText(saveBtn, "Save"); }
    if (ok) {
      const dlg = document.getElementById("evidenceDialog");
      if (dlg) dlg.close();
      renderBlock(path);
      toast(msg || "Evidence added.");
      document.dispatchEvent(new CustomEvent("bsess:evidence-changed"));
    } else {
      toast(msg, true);
    }
  };

  /* ---------------- SHARED MODE ---------------- */
  if (shared) {
    try {
      let row;
      if (type === "embed") {
        const file = document.getElementById("evFile").files[0];
        if (!file) return done(false, "Please choose a file to upload.");
        if (file.size > MAX_FILE_BYTES) {
          return done(false, "File is " + humanSize(file.size) + "; the limit is 25 MB.");
        }
        row = await addFileEvidence({ path, areaId: AREA_ID, title, notes, filedBy: "", file });
      } else if (type === "link") {
        const url = document.getElementById("evUrl").value.trim();
        if (!url) return done(false, "Please enter a URL.");
        row = await addLinkEvidence({ path, areaId: AREA_ID, title, notes, filedBy: "", url });
      } else {
        // A repo-relative path is stored as an absolute URL against this page,
        // because the database requires an http(s) URL. On the deployed site
        // that yields a working link; under file:// it will not, which is why
        // uploads are the default in shared mode.
        const p = document.getElementById("evPath").value.trim();
        if (!p) return done(false, "Please enter a relative file path.");
        const abs = safeUrl(p);
        if (!abs) return done(false, "That path cannot be resolved to an http(s) URL. Upload the file instead.");
        row = await addLinkEvidence({ path, areaId: AREA_ID, title, notes, filedBy: "", url: abs });
      }
      (evidenceStore[path] = evidenceStore[path] || []).push(row);
      return done(true, "Evidence saved to the shared database.");
    } catch (e) {
      console.error("[BSESS] shared save failed", e);
      return done(false, "Could not save to the shared database: " + (e.message || e));
    }
  }

  /* ---------------- LOCAL MODE ---------------- */
  const commit = (entry) => {
    entry.id = uid();
    entry.added = new Date().toISOString();
    entry.title = title;
    entry.notes = notes;
    entry.type = type;
    entry.__local = true;
    (evidenceStore[path] = evidenceStore[path] || []).push(entry);
    // JS-REVIEW finding 2: a failed write must not report success.
    if (!setEvidence(evidenceStore)) {
      evidenceStore[path].pop();
      return done(false,
        "NOT SAVED. Browser storage refused the write, usually because the " +
        "quota is full. Nothing was recorded. Use a smaller file or configure " +
        "the shared database.");
    }
    return done(true, "Evidence added (local to this browser only).");
  };

  try {
    if (type === "link") {
      const url = document.getElementById("evUrl").value.trim();
      if (!url) return done(false, "Please enter a URL.");
      if (!safeUrl(url)) return done(false, "Enter a full http:// or https:// URL.");
      return commit({ url });
    }
    if (type === "path") {
      const p = document.getElementById("evPath").value.trim();
      if (!p) return done(false, "Please enter a relative file path.");
      return commit({ path: p });
    }
    const file = document.getElementById("evFile").files[0];
    if (!file) return done(false, "Please choose a file to embed.");
    if (file.size > MAX_EMBED_BYTES) {
      return done(false, "File too large to embed (" + humanSize(file.size) + "). Use File Reference instead.");
    }
    const reader = new FileReader();
    reader.onload = () => commit({ dataUrl: reader.result, size: file.size });
    reader.onerror = () => done(false, "Failed to read file.");
    reader.readAsDataURL(file);
  } catch (e) {
    console.error("[BSESS] evidence save failed", e);
    done(false, "Could not save evidence: " + e.message);
  }
}

async function onStatusChange(e) {
  const path = e.target.dataset.path;
  const value = e.target.value;
  const previous = statusStore[path];
  statusStore[path] = value;
  renderBlock(path);

  if (shared) {
    try {
      await setIndicatorStatus(path, AREA_ID, value);
    } catch (err) {
      statusStore[path] = previous;          // roll back the optimistic update
      renderBlock(path);
      toast("Status not saved: " + (err.message || err), true);
      return;
    }
  } else if (!setStatus(statusStore)) {
    statusStore[path] = previous;
    renderBlock(path);
    toast("Status not saved: browser storage rejected the write.", true);
    return;
  }
  document.dispatchEvent(new CustomEvent("bsess:status-changed"));
}

/** Try the shared backend. Any failure degrades to local mode with a banner. */
async function tryShared() {
  if (!backend.configured) {
    banner("Local-only mode: config.js has no Supabase URL or key, so evidence " +
           "stays in this browser and is not shared.");
    return false;
  }
  if (!AREA_ID) {
    banner("This page has no data-area-id, so shared evidence cannot be scoped to an area. " +
           "Falling back to local-only mode.", "error");
    return false;
  }
  try {
    const [ev, st] = await Promise.all([fetchAreaEvidence(AREA_ID), fetchAreaStatus(AREA_ID)]);
    evidenceStore = ev;
    statusStore = st;
    shared = true;
    subscribeToArea(AREA_ID, async () => {
      try {
        const [ev2, st2] = await Promise.all([fetchAreaEvidence(AREA_ID), fetchAreaStatus(AREA_ID)]);
        evidenceStore = ev2;
        statusStore = st2;
        renderAllBlocks();
        computeAndCacheAreaProgress(AREA_ID);
      } catch (e) { console.warn("[BSESS] live refresh failed", e); }
    });
    return true;
  } catch (e) {
    console.error("[BSESS] backend unreachable", e);
    banner("Could not reach the shared database (" + (e.message || e) + "). " +
           "Working in local-only mode; your edits stay in this browser.", "error");
    return false;
  }
}

export async function initEvidence() {
  document.querySelectorAll(".add-evidence-btn").forEach((btn) => {
    btn.disabled = false;
    btn.addEventListener("click", () => openDialog(btn.dataset.path));
  });
  document.querySelectorAll(".status-select").forEach((sel) => {
    sel.disabled = false;
    sel.addEventListener("change", onStatusChange);
  });
  document.querySelectorAll('input[name="evType"]').forEach((r) =>
    r.addEventListener("change", toggleTypeFields));

  const saveBtn = document.getElementById("evSave");
  if (saveBtn) saveBtn.addEventListener("click", (e) => { e.preventDefault(); saveFromDialog(); });
  const cancelBtn = document.getElementById("evCancel");
  if (cancelBtn) cancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const dlg = document.getElementById("evidenceDialog");
    if (dlg) dlg.close();
  });

  renderAllBlocks();                 // paint cached/local data immediately

  await tryShared();
  renderAllBlocks();                 // repaint with shared data
  computeAndCacheAreaProgress(AREA_ID);

  if (shared) {
    banner("Shared mode: evidence is stored in the central database and visible " +
           "to everyone with this link. Entries cannot be deleted from the portal.");
  } else if (!storageAvailable) {
    banner("Local storage is unavailable in this browsing context (common under " +
           "file:// in some browsers). Your edits will not persist after reload.", "error");
  }
}

const LS_PROGRESS = "bsess_progress_v2";

export function computeAndCacheAreaProgress(areaId) {
  if (!areaId) return null;
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
  try { localStorage.setItem(LS_PROGRESS, JSON.stringify(progress)); } catch (e) { /* quota */ }
  return progress[areaId];
}
