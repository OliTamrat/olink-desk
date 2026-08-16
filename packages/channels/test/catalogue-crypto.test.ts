import { afterEach, describe, expect, it } from "vitest";

import { CATALOGUE, catalogue } from "../src/catalogue";
import {
  openChannelConfig,
  sealChannelConfig,
  secretsMatch,
} from "../src/crypto";

describe("catalogue", () => {
  it("lists all nine channels", () => {
    expect(CATALOGUE.map((c) => c.key)).toEqual([
      "web",
      "telegram",
      "whatsapp",
      "messenger",
      "instagram",
      "viber",
      "sms",
      "email",
      "ussd",
    ]);
  });

  it("every built adapter reads available, none planned", () => {
    expect(CATALOGUE.some((c) => c.status === "planned")).toBe(false);
  });

  it("every non-live channel states what it needs", () => {
    for (const entry of CATALOGUE) {
      if (entry.status !== "live") {
        expect(entry.needs.length, entry.key).toBeGreaterThan(0);
      }
    }
  });

  it("folds a tenant's connections in without mutating the catalogue", () => {
    const folded = catalogue({ telegramConnected: true });
    expect(folded.find((c) => c.key === "telegram")!.status).toBe("live");
    expect(CATALOGUE.find((c) => c.key === "telegram")!.status).toBe(
      "available",
    );
  });
});

describe("sealed channel config", () => {
  const KEY = Buffer.alloc(32, 7).toString("base64");
  afterEach(() => {
    process.env.CHANNEL_CONFIG_KEY = KEY;
  });

  it("round-trips a credential", () => {
    process.env.CHANNEL_CONFIG_KEY = KEY;
    const sealed = sealChannelConfig({ botToken: "12345:abc" });
    expect(JSON.stringify(sealed)).not.toContain("12345:abc");
    expect(openChannelConfig<{ botToken: string }>(sealed).botToken).toBe(
      "12345:abc",
    );
  });

  it("fails closed with no key", () => {
    delete process.env.CHANNEL_CONFIG_KEY;
    expect(() => sealChannelConfig({ botToken: "x" })).toThrow();
    expect(() => openChannelConfig({})).toThrow();
  });

  it("rejects a key of the wrong size", () => {
    process.env.CHANNEL_CONFIG_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => sealChannelConfig({ botToken: "x" })).toThrow();
  });
});

describe("secretsMatch", () => {
  it("an unset credential accepts nothing", () => {
    expect(secretsMatch(undefined, "anything")).toBe(false);
    expect(secretsMatch("", "")).toBe(false);
    expect(secretsMatch("expected", null)).toBe(false);
  });

  it("compares correctly", () => {
    expect(secretsMatch("token", "token")).toBe(true);
    expect(secretsMatch("token", "Token")).toBe(false);
    expect(secretsMatch("token", "token-longer")).toBe(false);
  });
});
