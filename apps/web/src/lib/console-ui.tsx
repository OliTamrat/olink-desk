"use client";
// Shared chrome for the staff console pages: the language picker (six
// languages, the fleet's golden rule — console included) and the handful of
// inline styles the pages share. Language choice is per-device
// (localStorage); a signed-in user's stored locale seeds it on first load.
import {
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  tUi,
  type Language,
} from "@olink-desk/i18n";
import { useEffect, useState } from "react";

const LANG_KEY = "desk_console_lang";

export function useConsoleLanguage(): [Language, (l: Language) => void] {
  const [lang, setLang] = useState<Language>("en");
  useEffect(() => {
    const stored = window.localStorage.getItem(LANG_KEY);
    if (stored && isSupportedLanguage(stored)) setLang(stored);
  }, []);
  const update = (l: Language) => {
    window.localStorage.setItem(LANG_KEY, l);
    setLang(l);
  };
  return [lang, update];
}

export function LanguagePicker({
  lang,
  onChange,
}: {
  lang: Language;
  onChange: (l: Language) => void;
}) {
  return (
    <select
      aria-label="Language"
      value={lang}
      onChange={(e) => onChange(e.target.value as Language)}
      style={{
        padding: "6px 8px",
        borderRadius: 6,
        border: "1px solid #d0d5dd",
        background: "#fff",
        fontSize: 13,
      }}
    >
      {SUPPORTED_LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {LANGUAGE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}

export { tUi };
export type { Language };

export const ui = {
  page: {
    minHeight: "100vh",
    background: "#f6f7f9",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#101828",
  } as const,
  card: {
    background: "#fff",
    border: "1px solid #e4e7ec",
    borderRadius: 12,
    padding: 24,
    boxShadow: "0 1px 2px rgba(16,24,40,.05)",
  } as const,
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
  } as const,
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d0d5dd",
    fontSize: 15,
    boxSizing: "border-box",
  } as const,
  button: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  } as const,
  error: {
    background: "#fef3f2",
    border: "1px solid #fda29b",
    color: "#b42318",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
  } as const,
  ok: {
    background: "#ecfdf3",
    border: "1px solid #a6f4c5",
    color: "#067647",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
  } as const,
  warn: {
    background: "#fffaeb",
    border: "1px solid #fedf89",
    color: "#b54708",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
  } as const,
};
