// Minimal book cover tile — clean, few borders, essential info only.

import { BookOpen } from "lucide-react";
import type { Book } from "@/lib/types";
import type { BookStats } from "@/hooks/use-library";
import { cn } from "@/lib/utils";

interface BookGalleryTileProps {
  book: Book;
  stats?: BookStats;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function BookGalleryTile({
  book,
  stats,
  onOpen,
  onEdit,
  onDelete,
  selected = false,
  onToggleSelect,
}: BookGalleryTileProps) {
  const progress = stats?.progress ?? 0;
  const pct = Math.round(progress * 100);
  const totalChapters = stats?.totalChapters ?? book.chapterOrder.length;
  const totalWords = stats?.totalWords ?? 0;

  return (
    <article
      className={cn(
        "group relative flex flex-col h-full rounded-lg overflow-hidden transition-all duration-200",
        "hover:bg-muted/50",
        selected && "ring-2 ring-foreground",
      )}
    >
      <button
        onClick={onOpen}
        className="block w-full text-left outline-none"
        aria-label={`Open ${book.title}`}
      >
        {/* Cover */}
        <div className="relative aspect-[3/4] bg-muted rounded-md overflow-hidden">
          {book.coverDataUrl ? (
            <img
              src={book.coverDataUrl}
              alt={`${book.title} cover`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="grid place-items-center w-full h-full text-muted-foreground">
              <BookOpen className="w-6 h-6" strokeWidth={1.2} />
            </div>
          )}

          {/* Select checkbox */}
          {onToggleSelect && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(); }}
              className={cn(
                "absolute top-2 left-2 w-5 h-5 grid place-items-center rounded border transition-all",
                selected
                  ? "bg-foreground border-foreground text-background"
                  : "border-foreground/30 bg-background/70 text-transparent md:opacity-0 md:group-hover:opacity-100",
              )}
              aria-label={selected ? `Deselect ${book.title}` : `Select ${book.title}`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={cn("transition-opacity", selected ? "opacity-100" : "opacity-0")}>
                <path d="M2 6l2.5 2.5L10 3" />
              </svg>
            </button>
          )}

          {/* Progress bar at bottom of cover */}
          {progress > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-0.5 bg-muted">
              <div className="h-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-2.5 px-0.5">
          <div className="text-[11px] text-muted-foreground">
            {pct}% translated · {totalChapters} ch · {totalWords.toLocaleString()}w
          </div>
          <h3 className="font-medium text-sm leading-snug line-clamp-2 mt-0.5">
            {book.title}
          </h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{book.author}</p>
        </div>
      </button>

      {/* Actions */}
      <div className="mt-2 px-0.5 pb-1 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <button
            onClick={(e) => { e.preventDefault(); onEdit(); }}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Edit
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.preventDefault(); onDelete(); }}
            className="text-[11px] text-destructive/70 hover:text-destructive transition-colors"
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
