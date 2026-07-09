import { Link } from "react-router";
import { BookOpen } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";

export default function NotFound() {
  return (
    <StudioShell>
      <div className="mx-auto max-w-[900px] px-6 lg:px-10 pt-32 pb-20 text-center">
        <div className="inline-flex items-center gap-3 studio-caps text-muted-foreground mb-6 justify-center">
          <BookOpen className="w-4 h-4" strokeWidth={1.4} />
          <span>Plate 404 — Off the shelf</span>
        </div>
        <h1 className="font-display text-7xl tracking-tight">No such page</h1>
        <p className="text-muted-foreground mt-4 max-w-[44ch] mx-auto leading-relaxed">
          The volume you're looking for isn't in this library. Return to the
          gallery and pick another — or wander back to the entrance.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link
            to="/"
            className="h-11 px-5 inline-flex items-center gap-2 border border-border hover:border-foreground/40"
          >
            <span className="text-xs uppercase tracking-[0.18em]">Landing</span>
          </Link>
          <Link
            to="/library"
            className="h-11 px-5 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90"
          >
            <span className="text-xs uppercase tracking-[0.18em]">Library</span>
          </Link>
        </div>
      </div>
    </StudioShell>
  );
}
