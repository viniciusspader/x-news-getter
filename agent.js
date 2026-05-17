// agent.js
import OpenAI from "openai";
import 'dotenv/config';
import fs from "fs/promises";
import path from "path";

const grok = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

// Load config
const configPath = path.resolve("./topics/ai.json");
const configRaw = await fs.readFile(configPath, "utf8");
const config = JSON.parse(configRaw);

const seedHandlesStr = config.seedHandles.map(h => `@${h}`).join(", ");
const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

const systemPrompt = `You are an elite technical research agent monitoring X for high-signal updates in ${config.topicName}.

=== PHASE 1: SEED EXPERTS ===
Focus EXCLUSIVELY on these ${config.seedHandles.length} experts:
${seedHandlesStr}
Only posts from the past 24 hours (since:${sinceDate}).

=== PHASE 2: GLOBAL SEARCH ===
After seeds, search broadly using: ${config.searchKeywords}

STRICT FILTERING DIRECTIVES (apply to BOTH phases):
${config.filteringDirectives}

Additional rules:
- Maximum 6 items per main array.
- If nothing is truly high-signal, put the next-best relevant posts in near_misses with a reason.

Use the x_search tool aggressively.`;

const userPrompt = `Run both phases for the past 24 hours and return ONLY a valid JSON object matching the schema.
Topic: ${config.topicName}`;

async function runAgent() {
  console.log(`🚀 Starting ${config.topicName} curation agent...`);

  const response = await grok.responses.create({
    model: "grok-4.3",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    tools: [{ type: "x_search" }, { type: "web_search" }],
    text: {
      format: {
        type: "json_schema",
        name: "curation_schema",
        strict: true,
        schema: { /* same schema as before – unchanged */ 
          type: "object",
          properties: {
            topic: { type: "string" },
            seed_expert_discoveries: { type: "array", items: { /* ... */ } },
            global_discoveries: { type: "array", items: { /* ... */ } },
            near_misses: { type: "array", items: { /* ... */ } },
            notes: { type: "string" }
          },
          required: ["topic", "seed_expert_discoveries", "global_discoveries", "near_misses"],
          additionalProperties: false
        }
      }
    },
    temperature: 0.2,
    max_output_tokens: 8000,
  });

  const outputItem = response.output?.find(item => item.type === "message" && item.role === "assistant");
  if (!outputItem?.content?.[0]?.text) throw new Error("No valid JSON output");

  const parsed = JSON.parse(outputItem.content[0].text);

  console.log(`✅ ${parsed.seed_expert_discoveries.length} seed + ${parsed.global_discoveries.length} global + ${parsed.near_misses.length} near-misses`);
  if (parsed.notes) console.log(`📝 Notes: ${parsed.notes}`);

  const outputDir = "./curations";
  await fs.mkdir(outputDir, { recursive: true });
  const filename = path.join(outputDir, `curation-${config.topicName.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`);
  await fs.writeFile(filename, JSON.stringify(parsed, null, 2));
  console.log(`💾 Saved ${filename}`);

  // === NEW: Send Telegram notification ===
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    await sendTelegramUpdate(parsed, filename);
  } else {
    console.log("ℹ️  No Telegram credentials found – skipping notification");
  }

  return parsed;
}

async function sendTelegramUpdate(parsed, filename) {
  const date = new Date().toISOString().slice(0, 10);
  let message = `🚀 *AI Curation Report* – ${date}\n\n`;
  message += `📌 *Topic:* ${parsed.topic}\n`;
  message += `🔍 Seed: ${parsed.seed_expert_discoveries.length} | Global: ${parsed.global_discoveries.length} | Near-misses: ${parsed.near_misses.length}\n\n`;

  const sections = [
    { title: "🌟 Seed Expert Discoveries", items: parsed.seed_expert_discoveries },
    { title: "🌍 Global Discoveries", items: parsed.global_discoveries },
    { title: "📌 Near Misses", items: parsed.near_misses }
  ];

  for (const section of sections) {
    if (section.items.length > 0) {
      message += `*${section.title}*\n`;
      for (const item of section.items) {
        message += `• *${item.project}* — ${item.technical_takeaway}\n`;
        message += `  @${item.author_handle} ${item.post_url ? `[link](${item.post_url})` : ''}\n\n`;
      }
    }
  }

  if (parsed.notes) message += `*Notes:*\n${parsed.notes}\n`;

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
      disable_web_page_preview: false
    })
  });
  console.log("📨 Telegram update sent!");
}

runAgent().catch(err => {
  console.error("❌ Agent failed:", err.message);
  process.exit(1);
});