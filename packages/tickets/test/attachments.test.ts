import { describe, expect, it } from "vitest";

import {
  cleanAttachment,
  cleanFilename,
  FALLBACK_CONTENT_TYPE,
  humanDuration,
  humanSize,
  isAudio,
  isInlineRenderable,
  MAX_ATTACHMENT_BYTES,
  sniffContentType,
} from "../src/attachments";

const bytes = (...b: number[]) => new Uint8Array(b);
const png = () => bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3);
const webmAudio = () => bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4);

describe("sniffContentType", () => {
  it("reads the type from the bytes, not from a header", () => {
    expect(sniffContentType(png())).toBe("image/png");
    expect(sniffContentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffContentType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("application/pdf");
  });

  it("recognises what MediaRecorder produces on both engines", () => {
    // Chrome and Firefox record WebM; Safari records MP4. A voice note that
    // only plays in one browser is a voice note nobody trusts.
    expect(sniffContentType(webmAudio())).toBe("audio/webm");
    expect(sniffContentType(bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70))).toBe("audio/mp4");
  });

  it("falls back rather than guessing, so an unknown file downloads", () => {
    expect(sniffContentType(bytes(1, 2, 3, 4, 5, 6, 7, 8))).toBe(FALLBACK_CONTENT_TYPE);
  });

  it("does not read past the end of a very short file", () => {
    expect(() => sniffContentType(bytes(0x89))).not.toThrow();
    expect(sniffContentType(bytes(0x89))).toBe(FALLBACK_CONTENT_TYPE);
  });

  it("refuses to call HTML an image however it is labelled", () => {
    // The attack this closes: upload a page, claim image/png, get it served
    // back inline. Sniffing means the claim is never consulted.
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    expect(sniffContentType(html)).toBe(FALLBACK_CONTENT_TYPE);
    expect(isInlineRenderable(sniffContentType(html))).toBe(false);
  });
});

describe("isInlineRenderable", () => {
  it("is images and nothing else", () => {
    expect(isInlineRenderable("image/png")).toBe(true);
    expect(isInlineRenderable("application/pdf")).toBe(false);
    expect(isInlineRenderable(FALLBACK_CONTENT_TYPE)).toBe(false);
    expect(isInlineRenderable("text/html")).toBe(false);
  });
});

describe("cleanFilename", () => {
  it("keeps an ordinary name", () => {
    expect(cleanFilename("receipt 2026.pdf")).toBe("receipt 2026.pdf");
  });

  it("strips any path, so traversal cannot survive storage", () => {
    expect(cleanFilename("../../etc/passwd")).toBe("passwd");
    expect(cleanFilename("C:\\Users\\oli\\shot.png")).toBe("shot.png");
  });

  it("removes what would break the header it ends up in", () => {
    expect(cleanFilename('a"b\nc.png')).toBe("abc.png");
  });

  it("falls back when nothing usable is left", () => {
    expect(cleanFilename("...")).toBe("attachment");
    expect(cleanFilename(null)).toBe("attachment");
    expect(cleanFilename(42)).toBe("attachment");
    expect(cleanFilename("", "voice-note")).toBe("voice-note");
  });

  it("caps the length", () => {
    expect(cleanFilename("x".repeat(500)).length).toBe(120);
  });
});

describe("cleanAttachment", () => {
  it("accepts a real file and reports what it actually is", () => {
    const r = cleanAttachment({ filename: "shot.png", bytes: png() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.contentType).toBe("image/png");
    expect(r.value.byteSize).toBe(11);
    expect(r.value.kind).toBe("FILE");
    expect(r.value.durationSeconds).toBeNull();
  });

  it("measures size from the bytes it holds, not from a claim", () => {
    const r = cleanAttachment({
      filename: "big.bin",
      bytes: new Uint8Array(MAX_ATTACHMENT_BYTES + 1),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/at most 10 MB/);
  });

  it("refuses an empty file", () => {
    expect(cleanAttachment({ bytes: new Uint8Array(0) }).ok).toBe(false);
  });

  it("keeps a voice note's duration", () => {
    const r = cleanAttachment({ bytes: webmAudio(), kind: "VOICE", durationSeconds: 12.6 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe("VOICE");
    expect(r.value.durationSeconds).toBe(13);
    expect(r.value.filename).toBe("voice-note");
  });

  it("refuses a voice note that is not audio", () => {
    // Otherwise the player is handed a PNG on a row that claims to be
    // playable, and the failure surfaces at the moment somebody presses play.
    const r = cleanAttachment({ bytes: png(), kind: "VOICE", durationSeconds: 3 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/not audio/i);
  });

  it("ignores a nonsense duration rather than storing it", () => {
    for (const d of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, "12", null]) {
      const r = cleanAttachment({ bytes: webmAudio(), kind: "VOICE", durationSeconds: d });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.durationSeconds).toBeNull();
    }
  });

  it("caps an implausible duration at an hour", () => {
    const r = cleanAttachment({ bytes: webmAudio(), kind: "VOICE", durationSeconds: 999_999 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.durationSeconds).toBe(3600);
  });

  it("treats an unknown kind as a file", () => {
    const r = cleanAttachment({ bytes: png(), kind: "SOMETHING" as "FILE" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe("FILE");
  });
});

describe("isAudio", () => {
  it("covers every recorder output", () => {
    for (const t of ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"]) {
      expect(isAudio(t)).toBe(true);
    }
    expect(isAudio("image/png")).toBe(false);
  });
});

describe("human readouts", () => {
  it("sizes", () => {
    expect(humanSize(512)).toBe("512 B");
    expect(humanSize(2048)).toBe("2 KB");
    expect(humanSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("durations pad the seconds", () => {
    expect(humanDuration(5)).toBe("0:05");
    expect(humanDuration(65)).toBe("1:05");
    expect(humanDuration(600)).toBe("10:00");
  });
});
