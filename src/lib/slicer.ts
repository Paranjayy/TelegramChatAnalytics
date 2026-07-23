/**
 * Splits a long Markdown string into chunks that fit a model's context
 * window. Real token counting via `gpt-tokenizer`; sentence-aware boundaries.
 *
 * Designed to produce a sequence of messages you can paste into ChatGPT /
 * Claude / Gemini / etc., with optional first-message prompt and per-chunk
 * headers/footers (so the LLM knows "this is part N of M, just say OK").
 */

import { encode, isWithinTokenLimit } from "gpt-tokenizer/encoding/o200k_base";
import { encode as encodeCl100k, isWithinTokenLimit as withinCl100k } from "gpt-tokenizer/encoding/cl100k_base";
import type { Encoding, ModelPreset } from "./modelPresets";

export interface SliceSettings {
  model: ModelPreset;
  /** Tokens reserved for the model's reply. */
  replyBudget: number;
  /** % of context to keep free as a safety guard band. */
  guardBandPct: number;
  /** Token overlap between adjacent chunks (helps with cross-chunk context). */
  overlap: number;
  /** Optional prompt prepended to chunk 1 (token budget counted against total). */
  firstMessage: string;
  /** Header/footer wrapped around each chunk. {part} and {total} are replaced. */
  chunkHeader: string;
  chunkFooter: string;
}

export interface OutputChunk {
  index: number;
  total: number;
  name: string;
  /** Tokens the chunk uses *including* any first/header/footer text. */
  tokens: number;
  content: string;
}

export interface SliceResult {
  chunks: OutputChunk[];
  totalTokens: number;
  inputTokens: number;       // tokens of the source text alone
  promptTokens: number;      // tokens of the first message
  overheadTokens: number;    // tokens used by headers/footers
  estimatedCost?: number;    // USD, if the model exposes pricing
  warnings: string[];
}

const DEFAULT_HEADER = "[START PART {part}/{total}]";
const DEFAULT_FOOTER = "[END PART {part}/{total}]";
const DEFAULT_FIRST =
  "I'm providing a long chat export in {total} parts. Please wait until I have sent all of them, then I'll ask my question.";

function pickEncoder(encoding: Encoding) {
  return encoding === "o200k_base"
    ? { encode, within: isWithinTokenLimit }
    : { encode: encodeCl100k, within: withinCl100k };
}

function tokenize(text: string, encoding: Encoding): number[] {
  return pickEncoder(encoding).encode(text);
}

/**
 * Split text into sentences, keeping the trailing whitespace so reassembly
 * stays lossless. Not a real sentence segmenter, but good enough for chat
 * text.
 */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /[^.!?\n]+(?:[.!?]+|\n+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const piece = m[0];
    if (piece.length) out.push(piece);
  }
  if (out.length === 0) out.push(text);
  return out;
}

/**
 * Group sentences into chunks whose token count stays under `targetTokens`.
 * Greedy packing: keep adding sentences until the next one would overflow,
 * then start a new chunk with optional overlap.
 */
function packChunks(sentences: string[], targetTokens: number, overlap: number, encoding: Encoding): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const sTokens = tokenize(s, encoding).length;
    if (currentTokens + sTokens > targetTokens && current.length > 0) {
      chunks.push(current);
      // Overlap: keep the last `overlap` tokens-worth of sentences.
      if (overlap > 0) {
        const overlapSentences: string[] = [];
        let overlapTokens = 0;
        for (let j = current.length - 1; j >= 0 && overlapTokens < overlap; j--) {
          overlapSentences.unshift(current[j]);
          overlapTokens += tokenize(current[j], encoding).length;
        }
        current = overlapSentences;
        currentTokens = overlapTokens;
      } else {
        current = [];
        currentTokens = 0;
      }
    }
    current.push(s);
    currentTokens += sTokens;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function sliceMarkdown(
  markdown: string,
  settings: SliceSettings,
): SliceResult {
  const { model, replyBudget, guardBandPct, overlap, firstMessage, chunkHeader, chunkFooter } = settings;
  const enc = model.encoding;

  // Total usable tokens for input = context − reply budget − guard band.
  const guardBand = Math.round(model.inputContext * guardBandPct);
  const usable = Math.max(1, model.inputContext - replyBudget - guardBand);

  // Tokens spent by templating (rough — counted once for the first message,
  // and once per chunk for the header/footer wrapper).
  const firstTokens = tokenize(firstMessage, enc).length;
  const headerTokens = tokenize(chunkHeader, enc).length;
  const footerTokens = tokenize(chunkFooter, enc).length;
  const overheadPerChunk = headerTokens + footerTokens;
  const inputBudget = Math.max(256, usable - firstTokens - overheadPerChunk);

  const sentences = splitSentences(markdown);
  const rawChunks = packChunks(sentences, inputBudget, overlap, enc);
  const total = rawChunks.length;
  const warnings: string[] = [];

  // If the markdown is empty / fits in one chunk, still produce a single chunk.
  if (total === 0) {
    warnings.push("Source markdown was empty.");
  }

  const expand = (raw: string, part: number): string => {
    const header = chunkHeader.replace(/\{part\}/g, String(part)).replace(/\{total\}/g, String(total));
    const footer = chunkFooter.replace(/\{part\}/g, String(part)).replace(/\{total\}/g, String(total));
    return [header, raw, footer].filter((s) => s.length > 0).join("\n\n");
  };

  let inputTokens = 0;
  let promptTokens = firstMessage ? firstTokens : 0;
  let overheadTokens = 0;
  const chunks: OutputChunk[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const body = rawChunks[i].join("").trimEnd();
    inputTokens += tokenize(body, enc).length;
    const wrapped = firstMessage && i === 0
      ? `${firstMessage.replace(/\{total\}/g, String(total))}\n\n${expand(body, i + 1)}`
      : expand(body, i + 1);
    const totalChunkTokens = tokenize(wrapped, enc).length;
    overheadTokens += totalChunkTokens - tokenize(body, enc).length;
    chunks.push({
      index: i + 1,
      total,
      name: `chat_part_${String(i + 1).padStart(3, "0")}_of_${String(total).padStart(3, "0")}.txt`,
      tokens: totalChunkTokens,
      content: wrapped,
    });
  }

  const totalTokens = inputTokens + promptTokens;
  if (total > 1 && totalTokens > model.inputContext) {
    warnings.push("Even with chunking, total input exceeds the context window — increase reply budget or reduce overlap.");
  }

  let estimatedCost: number | undefined;
  if (model.pricing && model.pricing.unit === "tokens") {
    const inputCost = (inputTokens / 1000) * model.pricing.inputPer1k;
    // Estimate output cost from reply budget (best guess).
    const outputCost = ((replyBudget * total) / 1000) * model.pricing.outputPer1k;
    estimatedCost = inputCost + outputCost;
  }

  return {
    chunks,
    totalTokens,
    inputTokens,
    promptTokens,
    overheadTokens,
    estimatedCost,
    warnings,
  };
}

export const DEFAULT_SLICE_SETTINGS: Omit<SliceSettings, "model"> = {
  replyBudget: 4_000,
  guardBandPct: 0.02,
  overlap: 200,
  firstMessage: DEFAULT_FIRST,
  chunkHeader: DEFAULT_HEADER,
  chunkFooter: DEFAULT_FOOTER,
};
