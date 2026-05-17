import OpenAI from "openai";
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const grok = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

async function runHybridAgent() {
  const topicArg = process.argv[2];
  if (!topicArg) {
    console.error("❌ Error: Specify a topic profile. Example: node agent.js ai");
    process.exit(1);
  }

  const configPath = path.resolve(`topics/${topicArg}.json`);
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Error: Config missing at ${configPath}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log(`📡 Spawning Hybrid Discovery Agent for [${config.topicName}]...`);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateString = yesterday.toISOString().split('T')[0];

  try {
    const response = await grok.chat.completions.create({
      model: "grok-4.3",
      messages: [
        {
          role: "system",
          content: `You are an elite research agent monitoring developments for: ${config.topicName}.
          
          You have access to two search scopes. You MUST utilize both to gather intelligence:
          1. EXPERT TIMELINE SCOPE: Pull updates natively generated or interacted with by your trusted circle.
          2. GLOBAL TREND SCOPE: Scour all of X globally for raw keywords to surface emergent, viral breakthroughs from unknown authors.
          
          Synthesize insights from both streams. ${config.filteringDirectives}`
        },
        {
          role: "user",
          content: `Execute a dual-scope analysis for date window: ${dateString}. Scan global data matching keywords "${config.searchKeywords}" and intersect it with structural data from these seed users: ${config.seedHandles.join(", ")}.`
        }
      ],
      // THE HYBRID MULTI-TOOL ENGINE: Passing two distinct instances of x_search
      tools: [
        {
          type: "x_search",
          from_date: dateString,
          to_date: dateString,
          allowed_x_handles: config.seedHandles // Pass 1: Bound securely to your premium core list
        },
        {
          type: "x_search",
          from_date: dateString,
          to_date: dateString
          // Pass 2: No handle restrictions = scans the entire global ecosystem
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "hybrid_news_schema",
          strict: true,
          schema: {
            type: "object",
            properties: {
              topic: { type: "string" },
              date_processed: { type: "string" },
              seed_expert_discoveries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    project: { type: "string" },
                    technical_takeaway: { type: "string" },
                    author_handle: { type: "string" }
                  },
                  required: ["project", "technical_takeaway", "author_handle"],
                  additionalProperties: false
                }
              },
              global_horizon_discoveries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    emerging_trend_or_repo: { type: "string" },
                    summary: { type: "string" },
                    source_handle: { type: "string" },
                    engagement_context: { type: "string" }
                  },
                  required: ["emerging_trend_or_repo", "summary", "source_handle", "engagement_context"],
                  additionalProperties: false
                }
              }
            },
            required: ["topic", "date_processed", "seed_expert_discoveries", "global_horizon_discoveries"],
            additionalProperties: false
          }
        }
      },
      temperature: 0.1,
    });

    const structuredData = response.choices[0].message.content;
    console.log("\n🎯 --- HYBRID MULTI-SCOPE PAYLOAD GENERATED --- 🎯");
    console.log(structuredData);

    const logDir = "./digest_logs";
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    fs.writeFileSync(`${logDir}/${topicArg}_hybrid_${dateString}.json`, structuredData);
    console.log(`\n💾 Saved hybrid payload copy to ./digest_logs/${topicArg}_hybrid_${dateString}.json`);

  } catch (error) {
    console.error("❌ Hybrid processing track failed:", error);
  }
}

runHybridAgent();