"use client";

// Browser-only preferences (no account needed): "My stocks", the language choice and the
// time of the last visit (for "new" badges). Read with useSyncExternalStore so components stay
// in sync and render the server default first.
import { useMemo, useSyncExternalStore } from "react";

const STOCKS_KEY = "myStocks";
const SEEN_KEY = "myStocksSeenAt";
const CHANGE = "sharekhabar:prefs";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE, callback);
  };
}

function readRaw(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}

function parseList(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** null until the browser value is known (first render matches the server). */
export function useMyStocks(): string[] | null {
  const raw = useSyncExternalStore(subscribe, () => readRaw(STOCKS_KEY), () => null);
  return useMemo(() => (raw === null ? null : parseList(raw)), [raw]);
}

export function setMyStocks(symbols: string[]) {
  write(STOCKS_KEY, JSON.stringify([...new Set(symbols)].slice(0, 50)));
}

/** When the user last looked at their stocks (ISO string), or "" for never. */
export function useSeenAt(): string | null {
  return useSyncExternalStore(subscribe, () => readRaw(SEEN_KEY), () => null);
}

export function markSeen() {
  write(SEEN_KEY, new Date().toISOString());
}

export type Lang = "en" | "ur" | "both";

function readLang(): Lang {
  const v = document.documentElement.dataset.lang;
  return v === "ur" || v === "both" ? v : "en";
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, readLang, () => "en");
}

export function setLang(value: Lang) {
  const html = document.documentElement;
  html.dataset.lang = value;
  html.dir = value === "ur" ? "rtl" : "ltr"; // whole layout mirrors in Urdu mode
  html.lang = value === "ur" ? "ur" : "en";
  try {
    localStorage.setItem("lang", value);
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}

export type Theme = "system" | "light" | "dark";

function readTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "system");
}

/** "system" follows the device setting; light/dark override it (saved for the next visit). */
export function setTheme(value: Theme) {
  const html = document.documentElement;
  if (value === "system") delete html.dataset.theme;
  else html.dataset.theme = value;
  try {
    if (value === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", value);
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}
