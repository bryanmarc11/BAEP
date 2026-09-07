/**
 * backend.js — shared evidence backend for the BSESS portal. NO ACCOUNTS.
 *
 * Anyone with the site URL can read and add evidence. There is no sign-in.
 * See docs/SHARED-BACKEND.md for what that costs you.
 *
 * Two invariants this module relies on, both enforced in Postgres rather than
 * here, so a client bug cannot break them:
 *   - Evidence is append-only. No update or delete policy exists.
 *   - URLs must be http(s). The javascript: scheme is rejected by a CHECK.
 *
 * localStorage stays in play as an offline cache, so the portal remains
 * browsable if the survey venue wifi drops.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CONFIG } from "../../config.js";

// Accept either name: new projects issue a publishable key, older ones an anon key.
const PUBLIC_KEY = CONFIG && (CONFIG.SUPABASE_PUBLIC_KEY || CONFIG.SUPABASE_ANON_KEY);
const CONFIGURED = Boolean(CONFIG && CONFIG.SUPABASE_URL && PUBLIC_KEY);

// Guard against the single most damaging misconfiguration: a secret key in
// client code. It bypasses RLS entirely, so every visitor would get full
// database access. Fail loudly rather than ship that.
if (PUBLIC_KEY && /^sb_secret_/.test(PUBLIC_KEY)) {
  throw new Error(
    "config.js contains a SECRET key (sb_secret_...). This bypasses Row Level " +
    "Security and must never appear in browser code. Use the publishable key."
  );
}

export const backend = {
  configured: CONFIGURED,
  client: CONFIGURED ? createClient(CONFIG.SUPABASE_URL, PUBLIC_KEY, {
    auth: { persistSession: false },   // nothing to persist; there are no sessions
  }) : null,
};

const SAFE_SCHEMES = new Set(["http:", "https:"]);
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Mirrors the url_scheme_safe CHECK constraint. The client-side copy exists
 *  for a useful error message, not for security. */
export function safeUrl(raw) {
  try {
    const u = new URL(String(raw), document.baseURI);
    return SAFE_SCHEMES.has(u.protocol) ? u.href : null;
  } catch (e) {
    return null;
  }
}

/** Mirrors the path_shape CHECK constraint. Three numbering levels are real
 *  (e.g. area-10/F/implementation/I.4.5.1) — 45 genuine paths use them. */
const PATH_RE = /^area-([1-9]|10)\/[A-Z]\/(system|implementation|outcome)\/[SIO]\.[0-9]+(\.[0-9]+){0,2}$/;

export function validPath(p) {
  return PATH_RE.test(String(p));
}

/** Object key for an uploaded file. Traversal segments are dropped, not just
 *  character-replaced — an earlier version let "../../../etc" through. */
export function storageKeyFor(indicatorPath, filename) {
  const safePath = String(indicatorPath)
    .replace(/[^A-Za-z0-9._/-]/g, "_")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!safePath) throw new Error("Invalid indicator path.");

  const safeName = String(filename)
    .replace(/[^A-Za-z0-9._-]/g, "_")   // spaces break file:// deep links
    .replace(/_{2,}/g, "_")
    .slice(-120);
  return `${safePath}/${Date.now()}-${safeName}`;
}

export async function fetchAreaEvidence(areaId) {
  if (!backend.client) throw new Error("Backend is not configured.");
  const { data, error } = await backend.client
    .from("evidence")
    .select("*")
    .eq("area_id", areaId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const grouped = {};
  for (const row of data) (grouped[row.path] = grouped[row.path] || []).push(row);
  return grouped;
}

export async function fetchAreaStatus(areaId) {
  if (!backend.client) throw new Error("Backend is not configured.");
  const { data, error } = await backend.client
    .from("indicator_status")
    .select("path,status")
    .eq("area_id", areaId);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.path, r.status]));
}

/**
 * Upload a file, then record its metadata.
 *
 * Order matters. There is deliberately no DELETE policy on storage.objects,
 * so if the metadata insert fails the portal cannot clean up after itself.
 * Rather than hide that, the error names the orphaned object key so you can
 * remove it from the dashboard. Silent orphans are worse than a loud message.
 */
export async function addFileEvidence({ path, areaId, title, notes, filedBy, file }) {
  if (!backend.client) throw new Error("Backend is not configured.");
  if (!validPath(path)) throw new Error("Invalid indicator path: " + path);
  if (!title || !title.trim()) throw new Error("Please enter a title.");
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File is ${(file.size / 1048576).toFixed(1)} MB; the limit is 25 MB.`);
  }

  const key = storageKeyFor(path, file.name);
  const up = await backend.client.storage
    .from("evidence")
    .upload(key, file, { cacheControl: "3600", upsert: false });
  if (up.error) throw up.error;

  const ins = await backend.client.from("evidence").insert({
    path, area_id: areaId,
    title: title.trim(),
    notes: (notes || "").trim(),
    kind: "file", storage_key: key,
    size_bytes: file.size, mime: file.type || null,
    filed_by: (filedBy || "").trim(),
  }).select().single();

  if (ins.error) {
    throw new Error(
      ins.error.message +
      ` — the file uploaded but its record failed. Orphaned object: ${key}. ` +
      `Remove it from the Supabase dashboard, then retry.`
    );
  }
  return ins.data;
}

export async function addLinkEvidence({ path, areaId, title, notes, filedBy, url }) {
  if (!backend.client) throw new Error("Backend is not configured.");
  if (!validPath(path)) throw new Error("Invalid indicator path: " + path);
  if (!title || !title.trim()) throw new Error("Please enter a title.");

  const clean = safeUrl(url);
  if (!clean) throw new Error("Enter a full http:// or https:// URL.");

  const { data, error } = await backend.client.from("evidence").insert({
    path, area_id: areaId,
    title: title.trim(),
    notes: (notes || "").trim(),
    kind: "link", url: clean,
    filed_by: (filedBy || "").trim(),
  }).select().single();
  if (error) throw error;
  return data;
}

export async function setIndicatorStatus(path, areaId, status) {
  if (!backend.client) throw new Error("Backend is not configured.");
  if (!validPath(path)) throw new Error("Invalid indicator path: " + path);
  const { error } = await backend.client.from("indicator_status").upsert({
    path, area_id: areaId, status, updated_at: new Date().toISOString(),
  }, { onConflict: "path" });
  if (error) throw error;
}

/** The bucket is private, so there is no permanent URL. Mint a short-lived
 *  signed URL at click time. */
export async function signedUrlFor(storageKey, seconds = 3600) {
  if (!backend.client) throw new Error("Backend is not configured.");
  const { data, error } = await backend.client.storage
    .from("evidence")
    .createSignedUrl(storageKey, seconds);
  if (error) throw error;
  return data.signedUrl;
}

/** Live updates so two custodians working the same area see each other's
 *  changes without reloading. */
export function subscribeToArea(areaId, onChange) {
  if (!backend.client) return null;
  return backend.client
    .channel(`area:${areaId}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "evidence", filter: `area_id=eq.${areaId}` },
      onChange)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "indicator_status", filter: `area_id=eq.${areaId}` },
      onChange)
    .subscribe();
}

/**
 * Deleting evidence is intentionally not possible from the portal.
 * Exported so callers get a clear explanation instead of a missing function.
 */
export function deleteEvidence() {
  throw new Error(
    "Evidence cannot be deleted from the portal. The record is append-only by " +
    "design. To remove an entry, use the Supabase dashboard (Table Editor > evidence)."
  );
}