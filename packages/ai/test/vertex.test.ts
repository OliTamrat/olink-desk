import { describe, expect, it, beforeEach } from "vitest";

import { buildPrompt } from "../src/draft";
import {
  accessToken,
  extractText,
  generate,
  isConfigured,
  LlmUnavailable,
  resetTokenCache,
  vertexConfig,
} from "../src/vertex";

beforeEach(() => resetTokenCache());

describe("vertexConfig", () => {
  it("is off without a project, so callers must handle absence", () => {
    expect(vertexConfig({})).toBeNull();
    expect(isConfigured({})).toBe(false);
  });

  it("defaults the location and model", () => {
    const c = vertexConfig({ GOOGLE_CLOUD_PROJECT: "p" });
    expect(c).toEqual({ project: "p", location: "us-central1", model: "gemini-2.5-flash" });
  });

  it("lets both be overridden", () => {
    const c = vertexConfig({
      GOOGLE_CLOUD_PROJECT: "p", VERTEX_LOCATION: "europe-west4", VERTEX_MODEL: "gemini-2.5-pro",
    });
    expect(c?.location).toBe("europe-west4");
    expect(c?.model).toBe("gemini-2.5-pro");
  });

  it("treats whitespace as absent", () => {
    expect(vertexConfig({ GOOGLE_CLOUD_PROJECT: "   " })).toBeNull();
  });
});

describe("extractText", () => {
  it("returns the text", () => {
    expect(extractText({ candidates: [{ content: { parts: [{ text: "hello" }] } }] })).toBe("hello");
  });

  it("drops thought parts — an agent must never see the reasoning", () => {
    const out = extractText({
      candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: "Real answer" }] } }],
    });
    expect(out).toBe("Real answer");
  });

  it("names the finishReason when there is no usable text", () => {
    // The failure this replaces logged "cannot read properties of undefined",
    // which names nothing and sends the reader to the wrong file.
    expect(() => extractText({ candidates: [{ finishReason: "MAX_TOKENS" }] }))
      .toThrow(/MAX_TOKENS/);
    expect(() => extractText({})).toThrow(LlmUnavailable);
  });
});

describe("generate", () => {
  const cfg = { project: "p", location: "us-central1", model: "gemini-2.5-flash" };
  const token = async () => "tok";

  it("budgets thinking ON TOP of the answer", async () => {
    // The bug this locks out: maxOutputTokens caps thinking and answer
    // together on 2.5, so a budget that does not add them returns a candidate
    // with no parts — and every mocked test still passes.
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await generate(cfg, { system: "s", prompt: "p", thinkingBudget: 512, maxOutputTokens: 700, fetchImpl, tokenImpl: token });
    const gc = body.generationConfig as { maxOutputTokens: number; thinkingConfig: { thinkingBudget: number } };
    expect(gc.maxOutputTokens).toBe(1212);
    expect(gc.thinkingConfig.thinkingBudget).toBe(512);
  });

  it("names the missing IAM role on a 403 rather than just the number", async () => {
    const fetchImpl = (async () => new Response("denied", { status: 403 })) as unknown as typeof fetch;
    await expect(
      generate(cfg, { system: "s", prompt: "p", thinkingBudget: 0, maxOutputTokens: 100, fetchImpl, tokenImpl: token }),
    ).rejects.toThrow(/aiplatform.user/);
  });

  it("turns a network failure into LlmUnavailable, never a raw throw", async () => {
    const fetchImpl = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    await expect(
      generate(cfg, { system: "s", prompt: "p", thinkingBudget: 0, maxOutputTokens: 100, fetchImpl, tokenImpl: token }),
    ).rejects.toThrow(LlmUnavailable);
  });

  it("targets the configured region's endpoint", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "x" }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await generate({ ...cfg, location: "europe-west4" }, {
      system: "s", prompt: "p", thinkingBudget: 0, maxOutputTokens: 10, fetchImpl, tokenImpl: token,
    });
    expect(url).toContain("europe-west4-aiplatform.googleapis.com");
    expect(url).toContain("/projects/p/locations/europe-west4/");
  });
});

describe("accessToken", () => {
  it("caches until shortly before expiry, so a draft is not two round trips", async () => {
    let calls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const now = 1_000_000;
      expect(await accessToken(now)).toBe("t");
      expect(await accessToken(now + 60_000)).toBe("t");
      expect(calls).toBe(1);
      // Past expiry minus the margin, it fetches again.
      await accessToken(now + 3_600_000);
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("is LlmUnavailable off Cloud Run, not a crash", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("no metadata server"); }) as unknown as typeof fetch;
    try {
      await expect(accessToken()).rejects.toThrow(LlmUnavailable);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("buildPrompt", () => {
  const base = { language: "Amharic", subject: "Login", articles: [], messages: [] };

  it("labels who said what", () => {
    const p = buildPrompt({ ...base, messages: [
      { from: "customer" as const, body: "I cannot log in" },
      { from: "agent" as const, body: "Which email?" },
    ] });
    expect(p).toContain("Customer: I cannot log in");
    expect(p).toContain("Agent: Which email?");
  });

  it("names the language, because the reply must be written in it", () => {
    expect(buildPrompt(base)).toContain("Customer's language: Amharic");
  });

  it("caps each message rather than the total, so one long one cannot crowd the rest out", () => {
    const p = buildPrompt({ ...base, messages: [
      { from: "customer" as const, body: "x".repeat(5000) },
      { from: "customer" as const, body: "the important last line" },
    ] });
    expect(p).toContain("the important last line");
    expect(p.length).toBeLessThan(3000);
  });

  it("keeps only the last dozen turns", () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ from: "customer" as const, body: `m${i}` }));
    const p = buildPrompt({ ...base, messages });
    expect(p).toContain("m39");
    expect(p).not.toContain("m20");
  });

  it("marks the articles as the ONLY facts that may be used", () => {
    const p = buildPrompt({ ...base, articles: [{ title: "Fees", body: "No fee for transfers." }] });
    expect(p).toMatch(/only facts you may use/i);
    expect(p).toContain("No fee for transfers.");
  });
});
