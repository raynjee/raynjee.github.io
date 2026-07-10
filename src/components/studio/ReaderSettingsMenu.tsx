// ReaderSettingsMenu — a single popover from the BookReader header that
// gives the user per-book controls: layout, typography, scale, density,
// plus show/hide toggles for the TOC and the original column. Float
// above the existing Studio shell; do not depend on the index page.

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
  FontScale,
  Leading,
  ParagraphGap,
  ReaderFont,
  ReaderLayout,
  ReaderPrefs,
} from "@/lib/types";
import {
  FONT_FAMILY,
  FONT_SCALES,
  LEADINGS,
  PARAGRAPH_GAPS,
} from "@/lib/types";

const SCALE_INDEX: FontScale[] = ["xs", "s", "m", "l", "xl"];
const SCALE_LABELS = ["XS", "S", "M", "L", "XL"];
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

  // Numeric indices for sliders — convert both ways so the slider primitive
  // (continuous) drives a discrete enum.
  const scaleIdx = SCALE_INDEX.indexOf(prefs.scale);
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

          <SteppedSlider
            label="Size"
            idx={scaleIdx}
            total={SCALE_INDEX.length}
            labels={SCALE_LABELS}
            onChange={(i) =>
              updateBookPrefs(bookId, { scale: SCALE_INDEX[i] })
            }
            displayValue={SCALE_LABELS[scaleIdx]}
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
              label="Table of contents"
              checked={prefs.showToc}
              onChange={(v) => updateBookPrefs(bookId, { showToc: v })}
            />
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
export function prefsToCssVars(p: ReaderPrefs): React.CSSProperties {
  const styles: Record<string, string> = {};
  styles["--reader-font-family"] = FONT_FAMILY[p.font];
  styles["--reader-font-scale"] = String(FONT_SCALES[p.scale]);
  styles["--reader-leading"] = String(LEADINGS[p.leading]);
  styles["--reader-paragraph-gap"] = PARAGRAPH_GAPS[p.gap];
  return styles as React.CSSProperties;
}
