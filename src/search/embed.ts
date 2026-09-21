/** OpenAI-compatible embeddings for Muton card vectors. */

export type EmbeddingResult = {
  vector: Float32Array;
  model: string;
};

const DEFAULT_EMBED_MODEL = "text-embedding-3-small";

export function embedModel(): string {
  return (process.env.MUTON_EMBED_MODEL ?? DEFAULT_EMBED_MODEL).trim() || DEFAULT_EMBED_MODEL;
}

function apiKey(): string | undefined {
  return process.env.MUTON_API_KEY || process.env.OPENAI_API_KEY || undefined;
}

function apiBase(): string {
  return (process.env.MUTON_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
}

/** Deterministic fake embedding for tests (MUTON_EMBED_MOCK=1). */
export function mockEmbed(text: string, dims = 32): Float32Array {
  const out = new Float32Array(dims);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
    out[h % dims]! += 1;
  }
  return l2Normalize(out);
}

export function l2Normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const n = Math.sqrt(sum);
  if (n === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / n;
  return out;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return dot;
}

export function cardEmbedText(card: {
  title: string;
  use_when: string;
  body: string;
}): string {
  return `${card.title}\nUse when: ${card.use_when}\n${card.body}`.trim();
}

/** Embed one string. Uses mock when MUTON_EMBED_MOCK=1. */
export async function embedText(text: string): Promise<EmbeddingResult> {
  const model = embedModel();
  const trimmed = text.trim();
  if (!trimmed) {
    return { vector: mockEmbed("", 32), model: "mock-empty" };
  }
  if (process.env.MUTON_EMBED_MOCK === "1" || process.env.MUTON_EMBED_MOCK === "true") {
    return { vector: mockEmbed(trimmed), model: "mock" };
  }
  const key = apiKey();
  if (!key) {
    throw new Error("MUTON_API_KEY or OPENAI_API_KEY required for embeddings");
  }
  const res = await fetch(`${apiBase()}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: trimmed.slice(0, 30_000),
    }),
  });
  if (!res.ok) {
    throw new Error(`Embeddings HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
    model?: string;
  };
  const raw = data.data?.[0]?.embedding;
  if (!raw?.length) throw new Error("Embeddings response missing vector");
  return {
    vector: l2Normalize(Float32Array.from(raw)),
    model: data.model ?? model,
  };
}

export function vectorToBuffer(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function bufferToVector(buf: Buffer | Uint8Array): Float32Array {
  const copy = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  // Ensure alignment for Float32Array
  const aligned = new ArrayBuffer(copy.byteLength);
  new Uint8Array(aligned).set(copy);
  return new Float32Array(aligned);
}
