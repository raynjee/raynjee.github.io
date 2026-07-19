// ReaderSettingsMenu — a single popover from the BookReader header that
// gives the user per-book controls: layout, typography, font size,
// density, plus show/hide toggles for the original column. The TOC
// visibility button lives in the chapter header (PanelLeftOpen /
// PanelLeftClose) so this menu intentionally doesn't duplicate it.

import { useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  AlignJustify,
  Columns2,
  List,
  RotateCcw,
  Settings2,
  Type as TypeIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Leading,
  ParagraphGap,
  ReaderFont,
  ReaderLayout,
  ReaderPrefs,
} from "@/lib/types";
import {
  FONT_FAMILY,
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LEADINGS,
  PARAGRAPH_GAPS,
} from "@/lib/types";

const LEADING_INDEX: Leading[] = ["tight", "regular", "airy"];
const LEADING_LABELS = ["Tight", "Regular", "Airy"];
const GAP_INDEX: ParagraphGap[] = ["tight", "regular", "roomy"];
const GAP_LABELS = ["Tight", "Regular", "Roomy"];

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  Icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

// ── Reusable controls ────────────────────────────────────────────────────
// The body of the reader-settings popover, extracted so it can also be
// rendered directly inside a side drawer (no Popover wrapper needed).
export function ReaderSettingsControls({ bookId }: { bookId: string }) {
  const { prefsFor, updateBookPrefs } = useSettings();
  const prefs = prefsFor(bookId);
  const leadingIdx = LEADING_INDEX.indexOf(prefs.leading);
  const gapIdx = GAP_INDEX.indexOf(prefs.gap);

  return (
    <div className="space-y-5">
      <Segment
        label="Layout"
        value={prefs.layout}
        options={[
          { value: "split", label: "Side-by-side", Icon: Columns2 },
          { value: "stack", label: "Stacked", Icon: AlignJustify },
        ]}
        onChange={(v) => updateBookPrefs(bookId, { layout: v as ReaderLayout })}
      />

      <Segment
        label="Type"
        value={prefs.font}
        options={[
          { value: "serif", label: "Serif", Icon: TypeIcon },
          { value: "sans", label: "Sans", Icon: List },
        ]}
        onChange={(v) => updateBookPrefs(bookId, { font: v as ReaderFont })}
      />

      <SizeControl
        label="Size"
        value={prefs.fontSize}
        onChange={(v) => updateBookPrefs(bookId, { fontSize: v })}
      />

      <SteppedSlider
        label="Line height"
        idx={leadingIdx}
        total={LEADING_INDEX.length}
        labels={LEADING_LABELS}
        onChange={(i) => updateBookPrefs(bookId, { leading: LEADING_INDEX[i] })}
        displayValue={LEADING_LABELS[leadingIdx]}
      />

      <SteppedSlider
        label="Paragraphs"
        idx={gapIdx}
        total={GAP_INDEX.length}
        labels={GAP_LABELS}
        onChange={(i) => updateBookPrefs(bookId, { gap: GAP_INDEX[i] })}
        displayValue={GAP_LABELS[gapIdx]}
      />

      <div className="border-t border-border/50 pt-4 space-y-3">
        <Toggle
          label="Show original"
          checked={prefs.showOriginal}
          onChange={(v) => updateBookPrefs(bookId, { showOriginal: v })}
        />
      </div>
    </div>
  );
}

export function ReaderSettingsMenu({ bookId }: { bookId: string }) {
  const { prefsFor, resetBookPrefs, settings } = useSettings();
  const prefs = prefsFor(bookId);
  const hasOverride = !!settings.bookReaderPrefs[bookId];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Reader settings"
          className="h-9 px-3 inline-flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="w-4 h-4" strokeWidth={1.25} />
          <span>Reader</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[300px] p-0 rounded-xl border border-border/50 bg-popover shadow-lg"
      >
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Reader settings</span>
          {hasOverride && (
            <button
              type="button"
              onClick={() => resetBookPrefs(bookId)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
              aria-label="Reset reader settings to default"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.25} />
              Reset
            </button>
          )}
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto thin-scrollbar">
          <ReaderSettingsControls bookId={bookId} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const active = opt.value === value;
          const Icon = opt.Icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "h-9 px-3 inline-flex items-center justify-center gap-2 rounded-lg text-sm transition-all",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={1.25} />}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Continuous font-size control: a slider drives the primary value, and a
// small `<input type="number">` next to the label accepts direct typing so a
// reader can pin "22" without scrubbing the slider. Both inputs round to
// the nearest valid step and clamp to [FONT_SIZE_MIN, FONT_SIZE_MAX].
function SizeControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  // Local draft state so users can type "22" without committing on every
  // keystroke; we flush to the global pref on blur or Enter. Without this,
  // typing "230" then deleting back to "23" would briefly push the slider
  // to 230 (clamped) and re-render the input with that value, breaking the
  // edit cycle.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) =>
    Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            value={draft ?? String(value)}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={FONT_SIZE_STEP}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft === null) return;
              const n = parseInt(draft, 10);
              onChange(Number.isFinite(n) ? clamp(n) : FONT_SIZE_DEFAULT);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="h-7 w-14 bg-transparent text-right text-sm tabular-nums text-foreground/85 border-b border-border/50 hover:border-foreground/40 focus:border-foreground focus:outline-none rounded-none"
            aria-label={`${label} in pixels`}
          />
          <span className="text-[10px] text-muted-foreground">px</span>
        </div>
      </div>
      <Slider
        value={[value]}
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        step={FONT_SIZE_STEP}
        onValueChange={(v) => {
          // Drop the pending draft so the input reflects the slider's new
          // value instead of a stale typed string.
          setDraft(null);
          const n = v[0];
          onChange(Number.isFinite(n) ? clamp(n) : FONT_SIZE_DEFAULT);
        }}
        aria-label={`${label} (${value} pixels)`}
      />
      {/* Mini tick row under the slider — shows min/default/max anchors so
          the user knows where the slider sits at a glance without crowding
          the control with five labels. */}
      <div className="mt-1.5 grid text-[10px] text-muted-foreground/50 grid-cols-3">
        <span className="text-left">{FONT_SIZE_MIN}</span>
        <span className="text-center">{FONT_SIZE_DEFAULT}</span>
        <span className="text-right">{FONT_SIZE_MAX}</span>
      </div>
    </div>
  );
}

function SteppedSlider({
  label,
  idx,
  total,
  labels,
  onChange,
  displayValue,
}: {
  label: string;
  idx: number;
  total: number;
  labels: string[];
  onChange: (nextIdx: number) => void;
  displayValue: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-foreground/70">{displayValue}</span>
      </div>
      <Slider
        value={[idx]}
        min={0}
        max={Math.max(0, total - 1)}
        step={1}
        onValueChange={(v) => onChange(v[0] ?? 0)}
        aria-label={`${label} (${displayValue})`}
      />
      <div
        className="mt-1.5 grid text-[10px] text-muted-foreground/60"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {labels.map((l, i) => (
          <span
            key={l}
            className={cn(
              "text-center",
              i === idx && "text-foreground",
              i === 0 && "text-left",
              i === total - 1 && "text-right",
            )}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-foreground/85">{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={`Toggle ${label}`}
      />
    </label>
  );
}

// Re-export so BookReader can pull the CSS-var math without duplicating it.
// We emit literal px for font size (the user picks absolute pixels) and
// resolved CSS values for the rest. Font family uses the hardcoded stack so
// the sans/serif toggle visibly switches in the browser without depending on
// chained var() resolution.
export function prefsToCssVars(p: ReaderPrefs): React.CSSProperties {
  const styles: Record<string, string> = {};
  styles["--reader-font-family"] = FONT_FAMILY[p.font];
  styles["--reader-font-size"] = `${p.fontSize}px`;
  styles["--reader-leading"] = String(LEADINGS[p.leading]);
  styles["--reader-paragraph-gap"] = PARAGRAPH_GAPS[p.gap];
  return styles as React.CSSProperties;
}
