/**
 * backend.js — shared evidence backend for the BSESS portal.
 *
 * Replaces localStorage as the source of truth. localStorage remains only as
 * an offline cache, so the portal still works during the survey visit if the
 * venue wifi drops.
 *
 * Configure config.js before use. If it is absent or blank, the portal falls
 * back to local-only mode and says so in the banner — it never silently
 * pretends to be shared.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CONFIG } from "../../config.js";

const CONFIGURED = Boolean(CONFIG && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export const backend = {
  configured: CONFIGURED,
  client: CONFIGURED ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null,
  user: null,
};

const SAFE_SCHEMES = new Set(["http:", "https:"]);

export function safeUrl(raw) {
  try {
    const u = new URL(String(raw), document.baseURI);
    return SAFE_SCHEMES.has(u.protocol) ? u.href : null;
  } catch (e) {
    return null;
  }
}

/** Object key for an uploaded file. Path segments are flattened and
 *  sanitised so a crafted indicator path cannot escape its prefix. */
export function storageKeyFor(indicatorPath, filename) {
  const safePath = String(indicatorPath)
    .replace(/[^A-Za-z0-9._/-]/g, "_")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")   // no traversal
    .join("/");
  if (!safePath) throw new Error("Invalid indicator path.");
  const safeName = String(filename)
    .replace(/[^A-Za-z0-9._-]/g, "_")   // spaces break file:// deep links
    .replace(/_{2,}/g, "_")
    .slice(-120);
  return `${safePath}/${Date.now()}-${safeName}`;
}

export async function restoreSession() {
  if (!backend.client) return null;
  const { data } = await backend.client.auth.getSession();
  backend.user = data.session ? data.session.user : null;
  return backend.user;
}

export async function signIn(email, password) {
  if (!backend.client) throw new Error("Backend is not configured.");
  const { data, error } = await backend.client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  backend.user = data.user;
  return data.user;
}

export async function signOut() {
  if (!backend.client) return;
  await backend.client.auth.signOut();
  backend.user = null;
}

/** All evidence for one area, grouped by indicator path. */
export async function fetchAreaEvidence(areaId) {
  if (!backend.client) throw new Error("Backend is not configured.");
  const { data, error } = await backend.client
    .from("evidence")
    .select("*")
    .eq("area_id", areaId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const grouped = {};
  for (const row of data) {
    (grouped[row.path] = grouped[row.path] || []).push(row);
  }
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
 * Upload a file and record its metadata.
 *
 * Order matters: the object is uploaded first, then the row is inserted. If the
 * insert fails we remove the orphaned object, so Storage never accumulates
 * files that no indicator points at.
 */
export async function addFileEvidence({ path, areaId, title, notes, file }) {
  if (!backend.user) throw new Error("Please sign in first.");

  const key = storageKeyFor(path, file.name);
  const up = await backend.client.storage
    .from("evidence")
    .upload(key, file, { cacheControl: "3600", upsert: false });
  if (up.error) throw up.error;

  const ins = await backend.client.from("evidence").insert({
    path, area_id: areaId, title, notes: notes || "",
    kind: "file", storage_key: key,
    size_bytes: file.size, mime: file.type || null,
    uploaded_by: backend.user.id,
    uploader_name: backend.user.email,
  }).select().single();

  if (ins.error) {
    await backend.client.storage.from("evidence").remove([key]);  // no orphans
    throw ins.error;
  }
  return ins.data;
}

export async function addLinkEvidence({ path, areaId, title, notes, url }) {
  if (!backend.user) throw new Error("Please sign in first.");
  const clean = safeUrl(url);
  if (!clean) throw new Error("Enter a full http:// or https:// URL.");

  const { data, error } = await backend.client.from("evidence").insert({
    path, area_id: areaId, title, notes: notes || "",
    kind: "link", url: clean,
    uploaded_by: backend.user.id,
    uploader_name: backend.user.email,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEvidence(row) {
  if (!backend.user) throw new Error("Please sign in first.");
  const { error } = await backend.client.from("evidence").delete().eq("id", row.id);
  if (error) throw error;                       // RLS blocks other people's rows
  if (row.storage_key) {
    await backend.client.storage.from("evidence").remove([row.storage_key]);
  }
}

export async function setIndicatorStatus(path, areaId, status) {
  if (!backend.user) throw new Error("Please sign in first.");
  const { error } = await backend.client.from("indicator_status").upsert({
    path, area_id: areaId, status,
    updated_by: backend.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: "path" });
  if (error) throw error;
}

/**
 * The bucket is private, so there is no permanent public URL. Mint a
 * short-lived signed URL at click time instead.
 */
export async function signedUrlFor(storageKey, seconds = 3600) {
  const { data, error } = await backend.client.storage
    .from("evidence")
    .createSignedUrl(storageKey, seconds);
  if (error) throw error;
  return data.signedUrl;
}

/** Live updates so two custodians working at once see each other's changes. */
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
