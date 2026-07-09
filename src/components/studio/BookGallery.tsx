// Book cover tile — gallery-style with framing, title, author and a
// minimal language / progress chip.

import { motion } from "framer-motion";
import { Languages, BookOpen } from "lucide-react";
import type { Book, ChapterTranslation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatLanguage } from "@/lib/util";

interface BookGalleryTileProps {
  book: Book;
  translation?: ChapterTranslation | null;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  asAdmin: boolean;
}

export function BookGalleryTile({
  book,
  translation,
  onOpen,
  onEdit,
  onDelete,
  asAdmin,
}: BookGalleryTileProps) {
  return (
    <motion.article
      layout
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="group bg-card border border-border p-3"
    >
      <button
        onClick={onOpen}
        className="block w-full text-left"
        aria-label={`Open ${book.title}`}
      >
        <div className="gallery-frame aspect-[3/4] grid place-items-center bg-muted overflow-hidden">
          {book.coverDataUrl ? (
            <img
              src={book.coverDataUrl}
              alt={`${book.title} cover`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="grid place-items-center text-muted-foreground">
              <BookOpen className="w-10 h-10" strokeWidth={1.2} />
            </div>
          )}
        </div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-[17px] leading-tight line-clamp-2 text-foreground">
              {book.title}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {book.author}
            </p>
          </div>
          <span className="studio-num text-[10px] text-muted-foreground whitespace-nowrap mt-1.5">
                · {String(book.chapterOrder.length).padStart(2, "0")}
          </span>
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Languages className="w-3.5 h-3.5" strokeWidth={1.4} />
          <span className="uppercase tracking-[0.16em]">
            {formatLanguage(book.language)}
          </span>
        </div>
        {asAdmin && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.preventDefault();
                onEdit?.();
              }}
              className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground px-1.5 py-1"
            >
              Edit
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                onDelete?.();
              }}
              className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-destructive px-1.5 py-1"
            >
              Delete
            </button>
          </div>
        )}
        <ProgressBar translation={translation} total={book.chapterOrder.length} />
      </div>
    </motion.article>
  );
}

function ProgressBar({
  translation,
  total,
}: {
  translation?: ChapterTranslation | null;
  total: number;
}) {
  if (!translation) return <span className={cn("text-muted-foreground")}>—</span>;
  const v = Math.round((translation.progress ?? 0) * 100);
  return (
    <span className="flex items-center gap-2 text-muted-foreground">
      <span className="studio-num text-foreground">{v}%</span>
      <span className="block w-10 h-px bg-border relative overflow-hidden">
        <span
          className="absolute left-0 top-0 h-full bg-foreground"
          style={{ width: `${v}%` }}
        />
      </span>
    </span>
  );
}
