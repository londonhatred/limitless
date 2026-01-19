// shared.js
const SUPABASE_URL = "https://nspcsswxcnkyagkqprxs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcGNzc3d4Y25reWFna3FwcnhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3NjM2MDMsImV4cCI6MjA4NDMzOTYwM30.SQnb2zb7hAxwxgbGCgxGyIXs7Gp28SmRsm3qaqdYWUU";

export const sb = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export function getGameId() {
  const url = new URL(location.href);
  return url.searchParams.get("game") || "default";
}

export async function ensureRow(gameId) {
  if (!sb) return;
  // idempotent upsert
  await sb.from("game_state").upsert({ game_id: gameId, state: {} }, { onConflict: "game_id" });
}

export async function fetchState(gameId) {
  if (!sb) return { state: {} };
  const { data, error } = await sb.from("game_state").select("state").eq("game_id", gameId).maybeSingle();
  if (error) throw error;
  return data || { state: {} };
}

export async function patchState(gameId, patch) {
  if (!sb) return;
  // merge in Postgres by fetching -> merging client-side -> update
  const cur = await fetchState(gameId);
  const next = deepMerge(cur.state || {}, patch || {});
  const { error } = await sb.from("game_state").update({ state: next }).eq("game_id", gameId);
  if (error) throw error;
}

export function subscribeState(gameId, onState, { intervalMs = 800 } = {}) {
    if (!sb) return () => {};
  
    let stopped = false;
    let lastJson = "";
  
    async function tick() {
      if (stopped) return;
      try {
        const data = await fetchState(gameId);
        const next = data?.state || {};
        const json = JSON.stringify(next);
        if (json !== lastJson) {
          lastJson = json;
          onState(next);
        }
      } catch (e) {
        console.warn("subscribeState poll error", e);
      }
    }
  
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { stopped = true; clearInterval(id); };
  }

function isObj(x){ return x && typeof x === "object" && !Array.isArray(x); }
function deepMerge(a, b){
  if (!isObj(a) || !isObj(b)) return b;
  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = (isObj(a[k]) && isObj(b[k])) ? deepMerge(a[k], b[k]) : b[k];
  }
  return out;
}

export async function pickQuestion(gameId, set, qIndex) {
    if (!sb) return null;
    const { data, error } = await sb.rpc("pick_question", {
      p_game_id: gameId,
      p_set: set,       // "quickfire" | "main"
      p_q_index: qIndex
    });
    if (error) throw error;
    return data; // {id,set,prompt,answer,...} or null
  }
  
  export async function fetchQuestionById(id) {
    if (!sb) return null;
    const { data, error } = await sb.from("questions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  export async function ensurePlayerInputRow(gameId) {
    if (!sb) return;
    // idempotent upsert
    await sb.from("player_input").upsert(
      { game_id: gameId, locked: false },
      { onConflict: "game_id" }
    );
  }
  
  export async function fetchPlayerInput(gameId) {
    if (!sb) return null;
    const { data, error } = await sb
      .from("player_input")
      .select("game_id,current_guess,locked_guess,locked")
      .eq("game_id", gameId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  
  export function subscribePlayerInput(gameId, onRow, { intervalMs = 800 } = {}) {
    if (!sb) return () => {};
  
    let stopped = false;
    let lastJson = "";
  
    async function tick() {
      if (stopped) return;
      try {
        const next = await fetchPlayerInput(gameId);
        const json = JSON.stringify(next || null);
        if (json !== lastJson) {
          lastJson = json;
          onRow(next || null);
        }
      } catch (e) {
        console.warn("subscribePlayerInput poll error", e);
      }
    }
  
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { stopped = true; clearInterval(id); };
  }

  export function buildOfficialLadder(maxStep = 200) {
    const markers = new Map([
      [0, 500],
      [10, 1000],
      [20, 2500],
      [30, 5000],
      [40, 10000],
      [50, 20000],
      [60, 30000],
      [70, 50000],
      [80, 75000],
      [90, 100000],
      [100, 150000],
      [110, 250000],
      [120, 500000],
      [130, 750000],
      [140, 1000000],
    ]);
  
    const ladder = [];
    for (let step = 0; step <= maxStep; step++) {
      const decade = Math.floor(step / 10) * 10;
      let val = markers.get(decade);
  
      if (val == null) {
        // beyond 140: +250k every 10 steps
        const extraDecades = (decade - 140) / 10;
        val = 1000000 + extraDecades * 250000;
      }
      ladder[step] = val;
    }
    return ladder;
  }