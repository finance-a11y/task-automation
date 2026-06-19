import { createHandler } from "@vercel/slack-bolt";
import { loadEnv } from "../../src/config/env.js";
import { createSlackApp } from "../../src/slack/app.js";

// Slack's Interactivity Request URL points here. Construct the app once per
// (warm) instance; loadEnv fails fast on misconfig. The adapter verifies the
// Slack signature over the raw body and routes button/view payloads to the
// registered app.action / app.view handlers, ACKing <3s and running post-ack
// work via waitUntil.
const { app, receiver } = createSlackApp(loadEnv());
const handler = createHandler(app, receiver);

// Named-method export only (Web signature). No `export default` — see events.ts:
// a default export makes Vercel use Node `(req,res)` mode and the function hangs.
export const POST = (req: Request): Promise<Response> => handler(req);
