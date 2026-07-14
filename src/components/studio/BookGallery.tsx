// Book cover tile — gallery-style with framing, title, author, language and
// word-level progress driven by aggregate BookStats for the whole book.

import { BookOpen } from "lucide-react";
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
        "group relative flex flex-col h-full border border-border p-3",
        "transition-[border-color,transform] duration-300 ease-out",
        "hover:border-foreground/30 hover:-translate-y-0.5",
      )}
    >
      <button
        onClick={onOpen}
        className="block w-full text-left outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
        aria-label={`Open ${book.title}`}
      >
        {/* Cover */}
        <div className="relative aspect-[3/4] overflow-hidden bg-muted">
          {book.coverDataUrl ? (
            <img
              src={book.coverDataUrl}
              alt={`${book.title} cover`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="grid place-items-center w-full h-full text-muted-foreground">
              <BookOpen className="w-8 h-8" strokeWidth={1.2} />
            </div>
          )}

          {/* Progress pill, top-right */}
          <div
            className={cn(
              "absolute top-2 right-2 inline-flex items-center px-2 py-0.5",
              "bg-background/90 border border-border",
            )}
            aria-hidden="true"
          >
            <span className="studio-num text-[10px] text-foreground">
              {pct}%
            </span>
          </div>
        </div>

        {/* Title block */}
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {language} · {totalChapters} ch
          </div>
          <h3 className="font-display text-[15px] leading-snug line-clamp-2 text-foreground mt-0.5">
            {book.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {book.author}
          </p>
        </div>
      </button>

      {/* Stats line */}
      <div className="mt-auto pt-2.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="studio-num">{totalWords.toLocaleString()}</span>
          <span>words</span>
        </span>
        <span className="studio-num">{updated}</span>
      </div>

      {/* Actions — hover-revealed on desktop, always visible on mobile */}
      <div
        className={cn(
          "mt-2 grid grid-cols-2 gap-2 transition-all duration-200 ease-out",
          "md:opacity-0 md:translate-y-0.5 md:pointer-events-none",
          "md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:group-hover:translate-y-0 md:group-hover:pointer-events-auto",
        )}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            onEdit?.();
          }}
          className="h-8 inline-flex items-center justify-center border border-border hover:border-foreground/40 text-[10px] uppercase tracking-[0.12em] transition-colors"
        >
          Edit
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete?.();
          }}
          className="h-8 inline-flex items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground text-[10px] uppercase tracking-[0.12em] transition-colors"
        >
          Delete
        </button>
      </div>
    </article>
  );
}
