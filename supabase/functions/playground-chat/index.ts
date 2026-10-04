import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Replaced by assistant-chat (same dev secret mode, plus dashboard owner mode).
// Kept as a stub so old scripts get a clear message instead of a 404.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "Moved to the assistant-chat function" }), {
    status: 410,
    headers: { "content-type": "application/json" },
  })
);
