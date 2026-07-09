// Reactive settings hook backed by localStorage.
// Caches the snapshot so useSyncExternalStore receives a stable reference
// when nothing changed — avoiding infinite re-render loops.

import { useSyncExternalStore } from "react";
import { loadSettings, saveSettings } from "@/lib/db";
import type { StudioSettings } from "@/lib/types";

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

  return { settings, update };
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
