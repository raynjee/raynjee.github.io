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

export function ReaderSettingsMenu({ bookId }: { bookId: string }) {
  const {
    prefsFor,
    updateBookPrefs,
    resetBookPrefs,
    settings,
  } = useSettings();
  const prefs = prefsFor(bookId);
  const hasOverride = !!settings.bookReaderPrefs[bookId];

  // Stepped-slider indices for the two enum-based controls.
  const leadingIdx = LEADING_INDEX.indexOf(prefs.leading);
  const gapIdx = GAP_INDEX.indexOf(prefs.gap);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Reader settings"
          className="h-10 px-3 inline-flex items-center gap-2 border border-border hover:border-foreground/40 transition-colors"
        >
          <Settings2 className="w-4 h-4" strokeWidth={1.4} />
          <span className="text-xs uppercase tracking-[0.18em]">
            Reader
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[320px] p-0 rounded-none border border-border bg-popover"
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="studio-caps text-foreground">Reader</span>
          {hasOverride && (
            <button
              type="button"
              onClick={() => resetBookPrefs(bookId)}
              className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
              aria-label="Reset reader settings to default"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.4} />
              Reset to default
            </button>
          )}
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto thin-scrollbar space-y-5">
          <Segment
            label="Layout"
            value={prefs.layout}
            options={[
              { value: "split", label: "Side-by-side", Icon: Columns2 },
              { value: "stack", label: "Stacked", Icon: AlignJustify },
            ]}
            onChange={(v) =>
              updateBookPrefs(bookId, { layout: v as ReaderLayout })
            }
          />

          <Segment
            label="Type"
            value={prefs.font}
            options={[
              { value: "serif", label: "Serif", Icon: TypeIcon },
              { value: "sans", label: "Sans", Icon: List },
            ]}
            onChange={(v) =>
              updateBookPrefs(bookId, { font: v as ReaderFont })
            }
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
            onChange={(i) =>
              updateBookPrefs(bookId, { leading: LEADING_INDEX[i] })
            }
            displayValue={LEADING_LABELS[leadingIdx]}
          />

          <SteppedSlider
            label="Paragraphs"
            idx={gapIdx}
            total={GAP_INDEX.length}
            labels={GAP_LABELS}
            onChange={(i) =>
              updateBookPrefs(bookId, { gap: GAP_INDEX[i] })
            }
            displayValue={GAP_LABELS[gapIdx]}
          />

          <div className="border-t border-border pt-4 space-y-3">
            <Toggle
              label="Original column"
              checked={prefs.showOriginal}
              onChange={(v) => updateBookPrefs(bookId, { showOriginal: v })}
            />
          </div>
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
      <div className="studio-caps text-muted-foreground mb-2">{label}</div>
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
                "h-9 px-3 inline-flex items-center justify-center gap-2 border text-xs uppercase tracking-[0.16em] transition-colors",
                active
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={1.4} />}
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
        <span className="studio-caps text-muted-foreground">{label}</span>
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
            className="h-7 w-14 bg-transparent text-right text-[12px] tabular-nums tracking-[0.04em] text-foreground/85 border-b border-border hover:border-foreground/40 focus:border-foreground focus:outline-none"
            aria-label={`${label} in pixels`}
          />
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            px
          </span>
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
      <div className="mt-1.5 grid text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70 grid-cols-3">
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
        <span className="studio-caps text-muted-foreground">{label}</span>
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/80">
          {displayValue}
        </span>
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
        className="mt-1.5 grid text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70"
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
