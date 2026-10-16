// Thin wrapper around the Claude API. Every feature asks for JSON that matches a schema,
// so the browser always gets a predictable shape back.
import Anthropic from "@anthropic-ai/sdk";

export const DEMO = !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN;
export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const client = DEMO ? null : new Anthropic();

export class ClaudeRefusal extends Error {
  constructor(details) {
    super(details?.explanation || "Claude declined this request.");
    this.name = "ClaudeRefusal";
    this.category = details?.category ?? null;
  }
}

/**
 * Ask Claude for a JSON object that matches `schema`.
 * `content` is a Messages API content array (text and/or image blocks).
 */
export async function askJSON({ system, content, schema, effort = "medium", maxTokens = 16000 }) {
  if (DEMO) throw new Error("askJSON called in demo mode");
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    // If a safety classifier declines, the API retries on a fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content }],
    output_config: { effort, format: { type: "json_schema", schema } },
  });

  if (response.stop_reason === "refusal") throw new ClaudeRefusal(response.stop_details);
  if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off (max_tokens).");

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  return JSON.parse(text);
}

/** Turn a browser data URL ("data:image/jpeg;base64,....") into an image content block. */
export function imageBlock(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error("Expected a base64 image data URL (jpeg, png, webp or gif).");
  return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
}

export const text = (value) => ({ type: "text", text: value });
