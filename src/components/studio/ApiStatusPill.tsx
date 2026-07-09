// Small status pill that surfaces the active provider and overall health.

import { motion } from "framer-motion";
import type { ProviderId } from "@/lib/types";

const LABEL: Record<ProviderId, string> = {
  deepseek: "DeepSeek",
  gemini: "Gemini",
};

export function ApiStatusPill({
  provider,
  ok,
  rateLimited,
  message,
}: {
  provider: ProviderId | null;
  ok: boolean | null;
  rateLimited: boolean;
  message?: string | null;
}) {
  const state = !provider
    ? "idle"
    : rateLimited
      ? "rate"
      : ok === true
        ? "ok"
        : ok === false
          ? "error"
          : "idle";
  const color =
    state === "ok"
      ? "bg-foreground text-background"
      : state === "error"
        ? "bg-destructive text-white"
        : state === "rate"
          ? "bg-accent text-accent-foreground"
          : "border border-border text-muted-foreground";
  return (
    <motion.div
      layout
      className={`inline-flex items-center gap-2 px-2.5 h-7 text-[11px] uppercase tracking-[0.18em] ${color}`}
      title={message ?? undefined}
    >
      <span className="w-1.5 h-1.5 inline-block" style={{
        background: state === "ok" ? "currentColor" : "transparent",
        border: state === "idle" ? "1px solid currentColor" : "none",
        opacity: 0.6,
      }} />
      {provider ? LABEL[provider] : "No Provider"} · {stateLabel(state)}
    </motion.div>
  );
}

function stateLabel(s: string) {
  switch (s) {
    case "ok":
      return "Ready";
    case "error":
      return "Error";
    case "rate":
      return "Paused";
    default:
      return "Idle";
  }
}
