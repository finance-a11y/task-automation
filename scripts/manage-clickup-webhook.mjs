#!/usr/bin/env node
/**
 * List / delete ClickUp webhooks for the team. Companion to
 * register-clickup-webhook.mjs (which only creates).
 *
 *   CLICKUP_API_TOKEN=pk_xxx node scripts/manage-clickup-webhook.mjs list
 *   CLICKUP_API_TOKEN=pk_xxx node scripts/manage-clickup-webhook.mjs delete <webhook_id>
 *
 * `list` shows id, endpoint, events, and health (status + fail_count). ClickUp
 * disables a webhook after repeated delivery failures — if you see a stale
 * endpoint or a "failing"/disabled health, delete it and re-run
 * register-clickup-webhook.mjs to get a fresh secret, then set
 * CLICKUP_WEBHOOK_SECRET in Vercel and redeploy.
 *
 * CLICKUP_TEAM_ID defaults to 90131720021.
 */
const token = process.env.CLICKUP_API_TOKEN;
const teamId = process.env.CLICKUP_TEAM_ID ?? "90131720021";
const [cmd, arg] = process.argv.slice(2);

if (!token) {
  console.error("Missing CLICKUP_API_TOKEN env var.");
  process.exit(1);
}

const base = "https://api.clickup.com/api/v2";
const headers = { Authorization: token, "Content-Type": "application/json" };

async function list() {
  const res = await fetch(`${base}/team/${teamId}/webhook`, { headers });
  const body = await res.json();
  if (!res.ok) {
    console.error(`ClickUp ${res.status}:`, JSON.stringify(body));
    process.exit(1);
  }
  const hooks = body.webhooks ?? [];
  if (hooks.length === 0) {
    console.log("No webhooks registered for team", teamId);
    return;
  }
  for (const h of hooks) {
    console.log("─".repeat(60));
    console.log("id:       ", h.id);
    console.log("endpoint: ", h.endpoint);
    console.log("events:   ", (h.events ?? []).join(", "));
    console.log("health:   ", JSON.stringify(h.health));
    console.log("secret:   ", h.secret, "  ← this must match CLICKUP_WEBHOOK_SECRET in Vercel");
  }
  console.log("─".repeat(60));
}

async function del(id) {
  if (!id) {
    console.error("Usage: ... delete <webhook_id>");
    process.exit(1);
  }
  const res = await fetch(`${base}/webhook/${id}`, { method: "DELETE", headers });
  if (!res.ok) {
    console.error(`ClickUp ${res.status}:`, await res.text());
    process.exit(1);
  }
  console.log("Deleted webhook", id);
}

if (cmd === "list") await list();
else if (cmd === "delete") await del(arg);
else {
  console.error("Usage: manage-clickup-webhook.mjs list | delete <webhook_id>");
  process.exit(1);
}
