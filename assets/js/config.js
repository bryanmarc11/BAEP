/**
 * config.js — deployment configuration.
 *
 * The anon key is designed to be public; it is safe in client-side code
 * because Row Level Security decides what it can actually do. Never put the
 * service_role key here — that key bypasses RLS entirely.
 *
 * Leave the values blank to run the portal in local-only mode.
 */
export const CONFIG = {
  SUPABASE_URL: "https://redrbmvzuparvsnpwixt.supabase.co/rest/v1/",       // e.g. https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: "sb_publishable_xGzruZiWaTov64cvpx3Nfw_DElrt5uc",  // the "anon / public" key from Settings > API
};
