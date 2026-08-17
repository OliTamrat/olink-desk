"use client";
// Attaching files, and recording a voice note, on a ticket.
//
// One component for both because they are the same row in the database and the
// same list on screen — a voice note is a file that happens to have been made
// here rather than chosen from a disk, and it is played rather than downloaded.
//
// The recorder is deliberately plain `MediaRecorder`: it is in every browser
// this desk runs on, it produces a Blob that goes straight up the same
// multipart endpoint, and it needs no library. The two things that DO need
// care are asking for the microphone at the moment of pressing record (not on
// page load), and releasing it afterwards — a tab that keeps the mic light on
// is one an agent will not trust twice.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { humanDuration, humanSize } from "@olink-desk/tickets/src/attachments";

import { colors, radius } from "./theme";
import { stroke } from "./card";

export interface Attached {
  id: string;
  filename: string;
  contentType: string;
  byteSize: number;
  kind: "FILE" | "VOICE";
  durationSeconds: number | null;
  /** Set when the bytes were erased. The row survives; the file does not. */
  redactedAt?: string | null;
}

/** A file waiting to be uploaded, or one already stored. */
export interface PendingFile {
  file: File;
  kind: "FILE" | "VOICE";
  durationSeconds?: number;
}

const icon = {
  paperclip: (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
      <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 0 1 5.18 5.18l-9.2 9.19a1.83 1.83 0 0 1-2.59-2.59l8.49-8.48" />
    </svg>
  ),
  mic: (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10a7 7 0 0 1-14 0M12 17v4" />
    </svg>
  ),
  stop: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ),
  remove: (
    <svg width="13" height="13" viewBox="0 0 24 24" {...stroke}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
};

/**
 * The attach + record controls, plus the list of what is queued.
 *
 * Stateless about uploading on purpose: the parent decides WHEN files go up,
 * because on a new ticket they cannot be uploaded until the ticket exists.
 */
export function AttachmentPicker({
  files,
  onChange,
  t,
  disabled,
}: {
  files: PendingFile[];
  onChange: (next: PendingFile[]) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  disabled?: boolean;
}): ReactNode {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  // Whatever happens — unmount, navigation, an error — the microphone is
  // released. Without this the browser's recording indicator stays on after
  // the agent has moved to another ticket.
  const stopTracks = useCallback(() => {
    recorderRef.current?.stream.getTracks().forEach((tr) => tr.stop());
    recorderRef.current = null;
  }, []);
  useEffect(() => stopTracks, [stopTracks]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [recording]);

  async function startRecording() {
    setMicError("");
    try {
      // Asked for HERE, on the press, rather than on page load. A permission
      // prompt that appears for no reason is one people deny.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        // The extension follows the container the browser actually produced —
        // Safari records mp4, Chrome and Firefox webm — so a downloaded note
        // opens in whatever the agent's machine associates with it.
        const ext = (rec.mimeType || "").includes("mp4") ? "m4a" : "webm";
        onChange([
          ...files,
          {
            file: new File([blob], `voice-note.${ext}`, { type: blob.type }),
            kind: "VOICE",
            durationSeconds: seconds,
          },
        ]);
        stopTracks();
        setRecording(false);
        setElapsed(0);
      };
      recorderRef.current = rec;
      startedAt.current = Date.now();
      rec.start();
      setRecording(true);
    } catch {
      // Denied, or no microphone. Named rather than left as a button that
      // does nothing when pressed.
      setMicError(t("ui_attach_mic_denied"));
    }
  }

  const remove = (i: number) => onChange(files.filter((_, n) => n !== i));

  return (
    <div style={{ display: "grid", gap: 8 }} data-attachments>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          ref={inputRef}
          type="file"
          multiple
          data-attach-input
          style={{ display: "none" }}
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])].map((file) => ({
              file,
              kind: "FILE" as const,
            }));
            onChange([...files, ...picked]);
            // Reset, so choosing the SAME file twice in a row still fires a
            // change event the second time.
            e.target.value = "";
          }}
        />
        <button
          type="button"
          data-attach-open
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          style={pill}
        >
          {icon.paperclip}
          {t("ui_attach_file")}
        </button>

        {recording ? (
          <button type="button" data-record-stop onClick={() => recorderRef.current?.stop()} style={{ ...pill, borderColor: colors.danger, color: colors.danger }}>
            {icon.stop}
            {t("ui_attach_stop")} · {humanDuration(elapsed)}
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: colors.danger,
                marginInlineStart: 2,
              }}
            />
          </button>
        ) : (
          <button
            type="button"
            data-record-start
            disabled={disabled}
            onClick={() => void startRecording()}
            style={pill}
          >
            {icon.mic}
            {t("ui_attach_record")}
          </button>
        )}
      </div>

      {micError ? (
        <p data-mic-error style={{ margin: 0, fontSize: 12, color: colors.warn }}>
          {micError}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }} data-attach-list>
          {files.map((f, i) => (
            <div
              key={`${f.file.name}-${i}`}
              data-attach-pending
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "7px 10px",
                borderRadius: radius.sm,
                border: `1px solid ${colors.border}`,
                background: colors.surfaceRaised,
                fontSize: 13,
              }}
            >
              <span aria-hidden style={{ color: colors.textMuted, display: "flex" }}>
                {f.kind === "VOICE" ? icon.mic : icon.paperclip}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: colors.textBody,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {f.kind === "VOICE"
                  ? t("ui_attach_voice_note", { d: humanDuration(f.durationSeconds ?? 0) })
                  : f.file.name}
              </span>
              <span style={{ color: colors.textMuted, flexShrink: 0 }}>
                {humanSize(f.file.size)}
              </span>
              <button
                type="button"
                data-attach-remove={i}
                onClick={() => remove(i)}
                aria-label={t("ui_attach_remove")}
                style={{
                  border: "none",
                  background: "none",
                  color: colors.textMuted,
                  cursor: "pointer",
                  display: "flex",
                  padding: 2,
                  flexShrink: 0,
                }}
              >
                {icon.remove}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Files already stored on a ticket: images shown, voice played, rest linked. */
export function AttachmentList({
  items,
  t,
}: {
  items: Attached[];
  t: (key: string, params?: Record<string, string | number>) => string;
}): ReactNode {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 8 }} data-attach-stored>
      {items.map((a) => {
        const href = `/api/attachments/${a.id}`;
        // An erased attachment is drawn first, before the kind branches. A
        // voice note whose bytes are gone would otherwise render an audio
        // player pointed at a 410 — a control that looks playable and does
        // nothing, which reads as broken rather than as erased.
        if (a.redactedAt) {
          return (
            <div
              key={a.id}
              data-attach-redacted={a.id}
              style={{
                ...row,
                background: "transparent",
                border: `1px dashed ${colors.border}`,
                color: colors.textMuted,
                fontStyle: "italic",
              }}
            >
              <span aria-hidden style={{ display: "flex" }}>{icon.paperclip}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{t("ui_redacted_file")}</span>
              <span style={{ flexShrink: 0, fontSize: 12, fontStyle: "normal" }}>
                {humanSize(a.byteSize)}
              </span>
            </div>
          );
        }
        if (a.kind === "VOICE") {
          return (
            <div key={a.id} data-attach-voice={a.id} style={row}>
              {/* The browser's own player. A custom one would be a scrubber,
                  a clock and a volume control to get wrong for no gain. */}
              <audio controls preload="none" src={href} style={{ width: "100%", height: 34 }}>
                <track kind="captions" />
              </audio>
            </div>
          );
        }
        if (a.contentType.startsWith("image/")) {
          return (
            <a key={a.id} href={href} target="_blank" rel="noreferrer" data-attach-image={a.id} style={{ ...row, padding: 0, overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={href}
                alt={a.filename}
                style={{ maxWidth: "100%", maxHeight: 240, display: "block" }}
              />
            </a>
          );
        }
        return (
          <a key={a.id} href={href} data-attach-file={a.id} style={{ ...row, textDecoration: "none" }}>
            <span aria-hidden style={{ color: colors.textMuted, display: "flex" }}>
              {icon.paperclip}
            </span>
            <span style={{ flex: 1, minWidth: 0, color: colors.textBody, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.filename}
            </span>
            <span style={{ color: colors.textMuted, flexShrink: 0, fontSize: 12 }}>
              {humanSize(a.byteSize)}
            </span>
          </a>
        );
      })}
      <span style={{ fontSize: 11.5, color: colors.textMuted }}>
        {t("ui_attach_count", { n: items.length })}
      </span>
    </div>
  );
}

/**
 * Upload everything queued against a ticket that now exists.
 *
 * Returns the errors rather than throwing: a ticket that was created must not
 * be reported as a failure because one of its five screenshots was too big.
 */
export async function uploadPending(
  ticketId: string,
  files: PendingFile[],
  messageId?: string,
): Promise<string[]> {
  const errors: string[] = [];
  for (const f of files) {
    const form = new FormData();
    form.append("file", f.file);
    form.append("kind", f.kind);
    if (f.durationSeconds) form.append("durationSeconds", String(f.durationSeconds));
    if (messageId) form.append("messageId", messageId);
    const resp = await fetch(`/api/tickets/${ticketId}/attachments`, {
      method: "POST",
      body: form,
    });
    if (!resp.ok) {
      const body = (await resp.json().catch(() => ({}))) as { error?: string };
      errors.push(`${f.file.name}: ${body.error ?? resp.status}`);
    }
  }
  return errors;
}

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "7px 11px",
  borderRadius: radius.sm,
  border: `1px solid ${colors.border}`,
  background: "transparent",
  color: colors.textSecondary,
  fontSize: 13,
  fontFamily: "inherit",
  cursor: "pointer",
} as const;

const row = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "8px 10px",
  borderRadius: radius.sm,
  border: `1px solid ${colors.border}`,
  background: colors.surfaceRaised,
  fontSize: 13,
} as const;
