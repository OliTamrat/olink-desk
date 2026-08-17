// Gemini over Vertex AI, ported from Olink Bank Assist (see its ADR on Vertex
// auth — that repo learned all of this the expensive way).
//
// **There is no API key anywhere.** On Cloud Run the token comes from the
// metadata server, which means the credential is the revision's own service
// account: nothing to store, nothing to leak, nothing to rotate. A key would
// be a regression, not a convenience — do not add one.
//
// Bank Assist's hard-won lesson, repeated here because it cost that project a
// silent outage: do NOT reach for `google.auth.transport` or an SDK. Those
// pull a transitive HTTP client this app does not install, the import throws,
// and the service reports "vertex" while every call falls through to nothing.
// A plain fetch against the metadata endpoint has no such failure mode.

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

/** Reached only when the model cannot be called at all. */
export class LlmUnavailable extends Error {}

let cached: { token: string; expiresAt: number } | null = null;

export function resetTokenCache(): void {
  cached = null;
}

/**
 * A token for the runtime service account.
 *
 * Cached until a minute before expiry — Cloud Run hands out the same token for
 * an hour, and asking per request would add a round trip to every draft.
 */
export async function accessToken(now = Date.now()): Promise<string> {
  if (cached && cached.expiresAt > now + 60_000) return cached.token;
  let resp: Response;
  try {
    resp = await fetch(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (e) {
    throw new LlmUnavailable(`metadata server unreachable: ${(e as Error).message}`);
  }
  if (!resp.ok) throw new LlmUnavailable(`metadata server said ${resp.status}`);
  const body = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new LlmUnavailable("metadata server returned no token");
  cached = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

export interface VertexConfig {
  project: string;
  location: string;
  model: string;
}

/**
 * What the environment says. Absent project → the feature is simply off, and
 * every caller must handle that rather than assuming it is configured.
 */
export function vertexConfig(env: NodeJS.ProcessEnv = process.env): VertexConfig | null {
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) return null;
  return {
    project,
    location: env.VERTEX_LOCATION?.trim() || "us-central1",
    // Flash: a reply draft is a short, cheap, latency-sensitive call, and an
    // agent waiting on a draft abandons it long before a larger model helps.
    model: env.VERTEX_MODEL?.trim() || "gemini-2.5-flash",
  };
}

export function isConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return vertexConfig(env) !== null;
}

export interface GenerateOptions {
  system: string;
  prompt: string;
  /**
   * REQUIRED, not defaulted. On Gemini 2.5, `maxOutputTokens` caps thinking
   * AND answer together, and thinking is on unless the request says otherwise
   * — so an under-budgeted call returns a candidate with no parts at all.
   * Bank Assist shipped a translation path that was dead in production for
   * exactly this reason, with every test passing. A default here would make
   * the next mis-sized call an accident rather than a decision.
   */
  thinkingBudget: number;
  maxOutputTokens: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
  tokenImpl?: () => Promise<string>;
}

/** Call the model, or throw `LlmUnavailable`. Never returns a partial answer. */
export async function generate(
  cfg: VertexConfig,
  opts: GenerateOptions,
): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const token = await (opts.tokenImpl ?? accessToken)();
  const url =
    `https://${cfg.location}-aiplatform.googleapis.com/v1/projects/${cfg.project}` +
    `/locations/${cfg.location}/publishers/google/models/${cfg.model}:generateContent`;

  let resp: Response;
  try {
    resp = await doFetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.4,
          maxOutputTokens: opts.maxOutputTokens + opts.thinkingBudget,
          thinkingConfig: { thinkingBudget: opts.thinkingBudget },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new LlmUnavailable(`vertex unreachable: ${(e as Error).message}`);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    // 403 here almost always means the runtime service account is missing
    // roles/aiplatform.user, or the API is not enabled on the project. Named,
    // because "403" alone sends somebody looking at the wrong thing.
    throw new LlmUnavailable(
      resp.status === 403
        ? `vertex refused (403) — the runtime service account needs roles/aiplatform.user and aiplatform.googleapis.com must be enabled: ${detail.slice(0, 200)}`
        : `vertex said ${resp.status}: ${detail.slice(0, 200)}`,
    );
  }

  return extractText((await resp.json()) as VertexResponse);
}

interface VertexResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
}

/**
 * The text, or a named failure.
 *
 * Thought parts are filtered: showing a model's reasoning to an agent about to
 * send something to a customer is worse than showing nothing. And a candidate
 * with no usable parts names its `finishReason` — the alternative is an error
 * reading "cannot read properties of undefined", which names nothing.
 */
export function extractText(body: VertexResponse): string {
  const candidate = body.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
  if (!text) {
    throw new LlmUnavailable(
      `no text in response (finishReason: ${candidate?.finishReason ?? "none"})`,
    );
  }
  return text;
}
