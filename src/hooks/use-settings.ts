// Reactive settings hook backed by localStorage.

import { useEffect, useSyncExternalStore } from "react";
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

export function useSettings() {
  const settings = useSyncExternalStore(
    subscribe,
    () => loadSettings(),
    () => loadSettings(),
  );

  useEffect(() => {
    // Hook used to ensure module-side subscribe kept alive.
    return subscribe(() => {});
  }, []);

  const update = (patch: Partial<StudioSettings>) => {
    const next = { ...loadSettings(), ...patch };
    // Deep-merge providers
    if (patch.providers) {
      next.providers = next.providers.map((p) => {
        const override = patch.providers?.find((x) => x.id === p.id);
        return override ? { ...p, ...override } : p;
      });
    }
    saveSettings(next);
    notify();
  };

  return { settings, update };
}

export function toggleThemePref() {
  const s = loadSettings();
  const order: Array<StudioSettings["themePref"]> = ["light", "dark", "system"];
  const idx = order.indexOf(s.themePref);
  const next = order[(idx + 1) % order.length];
  saveSettings({ ...s, themePref: next });
  notify();
}
