// Reactive settings hook backed by localStorage.
// Caches the snapshot so useSyncExternalStore receives a stable reference
// when nothing changed — avoiding infinite re-render loops.

import { useSyncExternalStore } from "react";
import { loadSettings, saveSettings } from "@/lib/db";
import { DEFAULT_READER_PREFS } from "@/lib/types";
import type { ReaderPrefs, StudioSettings } from "@/lib/types";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const l of listeners) l();
}

// Cached snapshot — only invalidated when notify() is called.
let snapshot: StudioSettings | null = null;
let snapshotKey = "";

function getSnapshot(): StudioSettings {
  // Use localStorage raw value as a fast dirty-key so we don't
  // need to deep-compare the whole settings object.
  const raw = typeof window !== "undefined"
    ? window.localStorage.getItem("atelier.settings.v1")
    : null;
  const key = raw ?? "<<absent>>";
  if (key !== snapshotKey || !snapshot) {
    snapshot = loadSettings();
    snapshotKey = key;
  }
  return snapshot!;
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const update = (patch: Partial<StudioSettings>) => {
    const next = { ...getSnapshot(), ...patch };
    if (patch.providers) {
      next.providers = next.providers.map((p) => {
        const override = patch.providers?.find((x) => x.id === p.id);
        return override ? { ...p, ...override } : p;
      });
    }
    saveSettings(next);
    snapshot = null; // force re-read on next snapshot
    notify();
  };

  // Apply a partial patch to a single book's reader prefs. We trim `undefined`
  // values so resetting a control to its global default removes the override
  // entirely (rather than pinning the book to "undefined").
  const updateBookPrefs = (
    bookId: string,
    patch: Partial<ReaderPrefs>,
  ) => {
    const current = getSnapshot();
    const existing = current.bookReaderPrefs[bookId] ?? {};
    const cleaned: Partial<ReaderPrefs> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (cleaned as Record<string, unknown>)[k] = v;
      }
    }
    const nextPatch: Partial<ReaderPrefs> = { ...existing, ...cleaned };
    // If the user has now matched the default for every key, drop the record
    // entirely so the localStorage payload stays tidy.
    const isEquivDefault = (Object.keys(DEFAULT_READER_PREFS) as Array<keyof ReaderPrefs>)
      // Compare every pref field by value (with a fallback to the default
      // for sparse overrides). Includes numeric fontSize comparison.
      .every((k) => (nextPatch[k] ?? DEFAULT_READER_PREFS[k]) === DEFAULT_READER_PREFS[k]);
    const nextBookPrefs = { ...current.bookReaderPrefs };
    if (isEquivDefault) {
      delete nextBookPrefs[bookId];
    } else {
      nextBookPrefs[bookId] = nextPatch;
    }
    update({ bookReaderPrefs: nextBookPrefs });
  };

  // Merge the global default with the book's per-book overrides to get the
  // reader's effective prefs. Cheap shallow merge — components then look up
  // individual fields as needed.
  const prefsFor = (bookId: string | undefined | null): ReaderPrefs => {
    if (!bookId) return currentDefault();
    const overrides = settings.bookReaderPrefs[bookId] ?? {};
    return { ...settings.defaultReaderPrefs, ...overrides };
  };

  const currentDefault = (): ReaderPrefs => settings.defaultReaderPrefs;

  const resetBookPrefs = (bookId: string) => {
    const nextBookPrefs = { ...settings.bookReaderPrefs };
    delete nextBookPrefs[bookId];
    update({ bookReaderPrefs: nextBookPrefs });
  };

  const resetAllDefaults = () => {
    update({ defaultReaderPrefs: { ...DEFAULT_READER_PREFS } });
  };

  return {
    settings,
    update,
    updateBookPrefs,
    prefsFor,
    resetBookPrefs,
    resetAllDefaults,
  };
}

export function toggleThemePref() {
  const s = getSnapshot();
  const order: Array<StudioSettings["themePref"]> = ["light", "dark", "system"];
  const idx = order.indexOf(s.themePref);
  const next = order[(idx + 1) % order.length];
  saveSettings({ ...s, themePref: next });
  snapshot = null;
  notify();
}
