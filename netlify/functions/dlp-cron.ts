import type { Config } from "@netlify/functions";
import { evaluateAndNotifyDlpEvents } from "../../src/lib/dlp-notifier";

export const config: Config = {
  schedule: "@daily"
};

export default async function handler(req: Request) {
  try {
    const results = await evaluateAndNotifyDlpEvents();
    console.log("Netlify Scheduled DLP evaluation complete:", results);
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("Netlify Scheduled DLP evaluation failed:", err);
    return new Response(JSON.stringify({ success: false, error: err?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
