/**
 * LLM model presets. Mirrors TokenSlicer's `constants.ts` but with
 * a few additions and removals. Encodings map onto `gpt-tokenizer`
 * import paths.
 *
 * Token counts are *context window* sizes, not output limits.
 */

export type Encoding = "o200k_base" | "cl100k_base";

export interface ModelPreset {
  id: string;
  label: string;
  provider: "openai" | "anthropic" | "google" | "xai" | "mistral" | "other";
  platform?: string;
  inputContext: number;
  outputContext?: number;
  pricing?: { inputPer1k: number; outputPer1k: number; unit: "tokens" };
  capabilities?: ("fast" | "vision" | "reasoning" | "tool_calling")[];
  status?: "new" | "degraded" | "premium" | "default";
  encoding: Encoding;
  notes?: string;
  defaultReplyBudget: number;
  defaultGuardBandPct: number;
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "openai:gpt-4.1",
    label: "GPT-4.1",
    provider: "openai",
    platform: "API",
    inputContext: 1_000_000,
    outputContext: 32_768,
    pricing: { inputPer1k: 0.003, outputPer1k: 0.012, unit: "tokens" },
    capabilities: ["reasoning", "vision", "tool_calling"],
    status: "premium",
    encoding: "o200k_base",
    defaultReplyBudget: 8_000,
    defaultGuardBandPct: 0.02,
    notes: "OpenAI's long-context flagship. 1M context.",
  },
  {
    id: "openai:gpt-4.1-mini",
    label: "GPT-4.1 mini",
    provider: "openai",
    platform: "API",
    inputContext: 1_000_000,
    outputContext: 32_768,
    pricing: { inputPer1k: 0.0004, outputPer1k: 0.0016, unit: "tokens" },
    capabilities: ["fast", "vision", "tool_calling"],
    status: "default",
    encoding: "o200k_base",
    defaultReplyBudget: 4_000,
    defaultGuardBandPct: 0.02,
    notes: "Cheap and fast. 1M context.",
  },
  {
    id: "openai:gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    platform: "API",
    inputContext: 128_000,
    outputContext: 16_384,
    pricing: { inputPer1k: 0.0025, outputPer1k: 0.01, unit: "tokens" },
    capabilities: ["fast", "vision", "reasoning"],
    encoding: "o200k_base",
    defaultReplyBudget: 4_000,
    defaultGuardBandPct: 0.02,
    notes: "Multimodal workhorse. 128K context.",
  },
  {
    id: "openai:o3",
    label: "o3 (reasoning)",
    provider: "openai",
    platform: "API",
    inputContext: 200_000,
    outputContext: 100_000,
    pricing: { inputPer1k: 0.002, outputPer1k: 0.008, unit: "tokens" },
    capabilities: ["reasoning", "tool_calling", "vision"],
    status: "new",
    encoding: "o200k_base",
    defaultReplyBudget: 8_000,
    defaultGuardBandPct: 0.02,
    notes: "Reasoning model. Slow but very capable.",
  },
  {
    id: "google:gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    platform: "AI Studio",
    inputContext: 1_048_576,
    outputContext: 65_536,
    pricing: { inputPer1k: 0.00125, outputPer1k: 0.01, unit: "tokens" },
    capabilities: ["reasoning", "vision", "tool_calling"],
    status: "premium",
    encoding: "cl100k_base",
    defaultReplyBudget: 8_000,
    defaultGuardBandPct: 0.02,
    notes: "Google's flagship. 1M context. (cl100k_base is an approximation; real Gemini tokenizer is internal.)",
  },
  {
    id: "google:gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    platform: "AI Studio",
    inputContext: 1_048_576,
    outputContext: 8_192,
    pricing: { inputPer1k: 0.0003, outputPer1k: 0.0025, unit: "tokens" },
    capabilities: ["fast", "reasoning"],
    status: "default",
    encoding: "cl100k_base",
    defaultReplyBudget: 4_000,
    defaultGuardBandPct: 0.02,
    notes: "Fast and cheap. 1M context.",
  },
  {
    id: "anthropic:claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    provider: "anthropic",
    platform: "API",
    inputContext: 200_000,
    outputContext: 8_192,
    pricing: { inputPer1k: 0.003, outputPer1k: 0.015, unit: "tokens" },
    capabilities: ["reasoning", "vision"],
    status: "default",
    encoding: "cl100k_base",
    defaultReplyBudget: 4_000,
    defaultGuardBandPct: 0.02,
    notes: "Anthropic's general-purpose model.",
  },
  {
    id: "anthropic:claude-3.5-haiku",
    label: "Claude 3.5 Haiku",
    provider: "anthropic",
    platform: "API",
    inputContext: 200_000,
    outputContext: 8_192,
    pricing: { inputPer1k: 0.0008, outputPer1k: 0.004, unit: "tokens" },
    capabilities: ["fast"],
    status: "default",
    encoding: "cl100k_base",
    defaultReplyBudget: 2_000,
    defaultGuardBandPct: 0.02,
    notes: "Anthropic's cheap fast model.",
  },
  {
    id: "xai:grok-2",
    label: "Grok 2",
    provider: "xai",
    platform: "API",
    inputContext: 131_072,
    outputContext: 8_192,
    pricing: { inputPer1k: 0.002, outputPer1k: 0.01, unit: "tokens" },
    capabilities: ["fast", "vision"],
    status: "new",
    encoding: "cl100k_base",
    defaultReplyBudget: 4_000,
    defaultGuardBandPct: 0.02,
    notes: "xAI's Grok. 128K context.",
  },
  {
    id: "custom",
    label: "Custom",
    provider: "other",
    inputContext: 8_000,
    outputContext: 2_000,
    encoding: "cl100k_base",
    defaultReplyBudget: 1_000,
    defaultGuardBandPct: 0.05,
    notes: "Generic starting point for custom configurations.",
  },
];

export const DEFAULT_PRESET_ID = "openai:gpt-4.1-mini";

export function findPreset(id: string): ModelPreset {
  return MODEL_PRESETS.find((p) => p.id === id) ?? MODEL_PRESETS[MODEL_PRESETS.length - 1];
}
