// Channel credentials at rest. ChannelAccount.config promises "encrypted at
// the application layer before storage" (schema.prisma) — this is that layer.
//
// AES-256-GCM under CHANNEL_CONFIG_KEY (base64, 32 bytes). Fails closed both
// ways: sealing without a key refuses to store a plaintext credential, and
// opening without one refuses to pretend a credential exists. An unset secret
// is a deploy mistake fixable in a minute; a bot token readable by anyone
// with a database dump is not.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// A type alias (not an interface) so it stays assignable to Prisma's
// InputJsonValue — interfaces lack the implicit index signature.
export type SealedConfig = {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

function key(): Buffer {
  const raw = process.env.CHANNEL_CONFIG_KEY;
  if (!raw) {
    throw new Error(
      "CHANNEL_CONFIG_KEY is not set — refusing to handle channel credentials",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("CHANNEL_CONFIG_KEY must be 32 bytes, base64-encoded");
  }
  return buf;
}

export function sealChannelConfig(config: Record<string, unknown>): SealedConfig {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf-8"),
    cipher.final(),
  ]);
  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export function openChannelConfig<T = Record<string, unknown>>(
  sealed: unknown,
): T {
  const box = sealed as SealedConfig;
  if (!box || box.v !== 1 || box.alg !== "aes-256-gcm") {
    throw new Error("Unrecognized sealed channel config");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(box.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(box.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf-8")) as T;
}

/**
 * Constant-time credential comparison, failing closed: an unset or empty
 * expected value accepts nothing. Ported doctrine — every channel's webhook
 * credential is compared this way, no exceptions.
 */
export function secretsMatch(
  expected: string | null | undefined,
  got: string | null | undefined,
): boolean {
  if (!expected || !got) return false;
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(got, "utf-8");
  // Length leak is acceptable; content leak is not. timingSafeEqual demands
  // equal lengths, so compare like-for-like and reject on mismatch.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
