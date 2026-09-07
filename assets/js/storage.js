const LS_EVIDENCE = "bsess_evidence_v2";
const LS_STATUS = "bsess_status_v2";

function testStorage() {
  try {
    const k = "__bsess_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

export const storageAvailable = testStorage();

export function safeGet(key, fallback) {
  if (!storageAvailable) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn("[BSESS] safeGet failed for", key, e);
    return fallback;
  }
}

export function safeSet(key, value) {
  if (!storageAvailable) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn("[BSESS] safeSet failed for", key, e);
    return false;
  }
}

export function getEvidence() { return safeGet(LS_EVIDENCE, {}); }
export function setEvidence(obj) { return safeSet(LS_EVIDENCE, obj); }
export function getStatus() { return safeGet(LS_STATUS, {}); }
export function setStatus(obj) { return safeSet(LS_STATUS, obj); }
export const KEYS = { LS_EVIDENCE, LS_STATUS };
