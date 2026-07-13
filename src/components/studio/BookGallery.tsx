// Book cover tile — gallery-style with framing, title, author, language and
// word-level progress driven by aggregate BookStats for the whole book.

import { BookOpen, Languages, Pencil, Trash2 } from "lucide-react";
import type { Book, ChapterTranslation } from "@/lib/types";
import type { BookStats } from "@/hooks/use-library";
import { cn } from "@/lib/utils";
import { formatLanguage, formatRelativeTime } from "@/lib/util";

interface BookGalleryTileProps {
  book: Book;
  stats?: BookStats;
  translation?: ChapterTranslation | null;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function BookGalleryTile({
  book,
  stats,
  onOpen,
  onEdit,
  onDelete,
}: BookGalleryTileProps) {
  const progress = stats?.progress ?? 0;
  const totalWords = stats?.totalWords ?? 0;
  const totalChapters =
    stats?.totalChapters ?? book.chapterOrder.length;
  const pct = Math.round(progress * 100);
  const language = formatLanguage(book.language);
  const updated = formatRelativeTime(book.updatedAt);

  return (
    <article
      className={cn(
        "group relative flex flex-col h-full bg-card border border-border p-3",
        "transition-[border-color,transform] duration-200 ease-out",
        "hover:border-foreground/40 hover:-translate-y-0.5",
      )}
    >
      <button
        onClick={onOpen}
        className="block w-full text-left outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
        aria-label={`Open ${book.title}`}
      >
        {/* Cover */}
        <div className="gallery-frame relative aspect-[3/4] overflow-hidden bg-muted">
          {book.coverDataUrl ? (
            <img
              src={book.coverDataUrl}
              alt={`${book.title} cover`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="grid place-items-center w-full h-full text-muted-foreground">
              <BookOpen className="w-10 h-10" strokeWidth={1.2} />
            </div>
          )}

          {/* Progress pill, top-right inside the frame */}
          <div
            className={cn(
              "absolute top-2 right-2 inline-flex items-center px-2 py-0.5",
              "bg-background/95 border border-border backdrop-blur-[2px]",
            )}
            aria-hidden="true"
          >
            <span className="studio-num text-[10px] text-foreground">
              {pct}%
            </span>
          </div>
        </div>

        {/* Title block */}
        <div className="mt-4 px-0.5">
          <div className="studio-caps text-muted-foreground">
            {language} · {String(totalChapters).padStart(2, "0")} ch
          </div>
          <h3 className="font-display text-[17px] leading-tight line-clamp-2 text-foreground mt-1">
            {book.title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground truncate">
            {book.author}
          </p>
        </div>
      </button>

      {/* Stats line — pushed to the bottom so tiles in a row align evenly */}
      <div className="plate mt-auto pt-3 px-0.5 flex items-center justify-between studio-caps text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Languages className="w-3 h-3" strokeWidth={1.4} />
          <span className="studio-num">{totalWords.toLocaleString()}</span>
          <span>words</span>
        </span>
        <span className="studio-num">{updated}</span>
      </div>

      {/* Actions — hover-revealed on desktop, always visible on mobile */}
      <div
        className={cn(
          "mt-2 grid grid-cols-2 gap-2 transition-all duration-200 ease-out",
          // On mobile: always visible
          // On desktop (md+): hidden until hover/focus
          "md:opacity-0 md:translate-y-0.5 md:pointer-events-none",
          "md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:group-hover:translate-y-0 md:group-hover:pointer-events-auto",
        )}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            onEdit?.();
          }}
          className="h-8 inline-flex items-center justify-center gap-1.5 border border-border hover:border-foreground/40 text-[10px] uppercase tracking-[0.18em]"
        >
          <Pencil className="w-3 h-3" strokeWidth={1.4} />
          Edit
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete?.();
          }}
          className="h-8 inline-flex items-center justify-center gap-1.5 border border-border hover:border-destructive hover:text-destructive text-[10px] uppercase tracking-[0.18em]"
        >
          <Trash2 className="w-3 h-3" strokeWidth={1.4} />
          Delete
        </button>
      </div>
    </article>
  );
}
