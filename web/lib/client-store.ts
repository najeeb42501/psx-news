"use client";

// Browser-only preferences (no account needed): "My stocks" and the language choice.
// Read with useSyncExternalStore so components stay in sync and render the server default first.
import { useMemo, useSyncExternalStore } from "react";

const STOCKS_KEY = "myStocks";
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
  try {
    localStorage.setItem(STOCKS_KEY, JSON.stringify([...new Set(symbols)].slice(0, 50)));
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}

export function getMyStocks(): string[] {
  return parseList(readRaw(STOCKS_KEY));
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
  document.documentElement.dataset.lang = value;
  try {
    localStorage.setItem("lang", value);
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}
