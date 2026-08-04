// Shared layout shell for the studio pages. Provides the top brand bar,
// the route tabs, and a thin frame around the working area.

import { Link, NavLink, useLocation } from "react-router";
import { motion } from "framer-motion";
import {
  Bookmark,
  Heart,
  Library,
  Menu,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Moon,
  LaptopMinimal,
  X,
  Coffee,
} from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface StudioShellProps {
  children: React.ReactNode;
  hideChrome?: boolean;
}

export function StudioShell({ children, hideChrome }: StudioShellProps) {
  const { settings, update } = useSettings();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    const pref = settings.themePref;
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // Only auto-flip to dark after evening hours when the user has chosen
    // "system". Explicit light/dark selections are honoured so a bedtime
    // override never gets clobbered by an automatic theme switch.
    const inLowLightHours = () => {
      const h = new Date().getHours();
      return h >= 20 || h < 7;
    };
    const apply = () => {
      const isDark =
        pref === "dark" ||
        (pref === "system" && (mq.matches || inLowLightHours()));
      root.classList.toggle("dark", isDark);
    };
    apply();
    if (pref === "system") {
      // React to the OS preference changing in real time.
      mq.addEventListener("change", apply);
      // And tick once a minute so the 8pm / 7am boundary flips without the
      // user having to reload. One DOM write per minute is negligible.
      const timer = window.setInterval(apply, 60_000);
      return () => {
        mq.removeEventListener("change", apply);
        window.clearInterval(timer);
      };
    }
    return () => window.clearInterval(0);
  }, [settings.themePref]);

  const ThemeIcon =
    settings.themePref === "dark"
      ? Moon
      : settings.themePref === "light"
        ? Sun
        : LaptopMinimal;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {!hideChrome && (
        <header className="border-b border-border sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
          <div className="mx-auto max-w-[1400px] px-6 lg:px-10 h-16 flex items-center justify-between gap-6">
            <Link to="/" className="flex items-center gap-2 text-base font-semibold tracking-tight" aria-label="RaynETS home">
              <img src="/logo.svg" alt="" className="w-5 h-5 dark:hidden" />
              <img src="/logo-dark.svg" alt="" className="w-5 h-5 hidden dark:block" />
              RaynETS
              <Heart className="w-3 h-3 text-primary/60 hidden sm:block" strokeWidth={2} fill="currentColor" />
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <StudioTab to="/library" label="Library" active={location.pathname.startsWith("/library")} />
              <StudioTab to="/import" label="Import" active={location.pathname.startsWith("/import")} />
              <StudioTab to="/settings" label="Settings" active={location.pathname.startsWith("/settings")} />
            </nav>

            <div className="flex items-center gap-0.5">
              {/* ── Mobile hamburger ──────────────────────────── */}
              <button
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="Toggle menu"
                className="md:hidden w-9 h-9 grid place-items-center border border-border hover:border-foreground/40 transition-colors"
              >
                {mobileMenuOpen ? (
                  <X className="w-4 h-4" strokeWidth={1.4} />
                ) : (
                  <Menu className="w-4 h-4" strokeWidth={1.4} />
                )}
              </button>

              <a
                href="https://ko-fi.com/raynjee"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Support on Ko-fi"
                className="w-8 h-8 grid place-items-center hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
              >
                <Coffee className="w-4 h-4" strokeWidth={1.4} />
              </a>
              <button
                onClick={() => update({ themePref: nextTheme(settings.themePref) })}
                aria-label="Toggle theme"
                className="w-8 h-8 grid place-items-center hover:bg-muted rounded-md transition-colors"
              >
                <ThemeIcon className="w-4 h-4" strokeWidth={1.4} />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* ── Mobile slide-down menu ──────────────────────────── */}
      {!hideChrome && mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="md:hidden border-b border-border bg-background/95 backdrop-blur-sm"
        >
          <div className="px-6 py-4 flex flex-col gap-2">
            <Link
              to="/library"
              className={cn(
                "h-11 px-4 inline-flex items-center gap-3 border transition-colors text-sm",
                location.pathname.startsWith("/library")
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:border-foreground/40"
              )}
            >
              <Library className="w-4 h-4" strokeWidth={1.4} />
              Library
            </Link>
            <Link
              to="/import"
              className={cn(
                "h-11 px-4 inline-flex items-center gap-3 border transition-colors text-sm",
                location.pathname.startsWith("/import")
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:border-foreground/40"
              )}
            >
              <Bookmark className="w-4 h-4" strokeWidth={1.4} />
              Import Chapters
            </Link>
            <Link
              to="/settings"
              className={cn(
                "h-11 px-4 inline-flex items-center gap-3 border transition-colors text-sm",
                location.pathname.startsWith("/settings")
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:border-foreground/40"
              )}
            >
              <SettingsIcon className="w-4 h-4" strokeWidth={1.4} />
              Settings
            </Link>
          </div>
        </motion.div>
      )}

      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex-1 w-full"
      >
        {children}
      </motion.main>

      {/* ── ♡ Cute global footer ────────────────────────────── */}
      {!hideChrome && (
        <footer className="border-t border-border bg-background/60 backdrop-blur-sm">
          <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-3 h-3 text-accent" strokeWidth={1.5} />
              <span>Made with</span>
              <Heart className="w-3 h-3 text-primary" strokeWidth={2} fill="currentColor" />
              <span>by Rayn</span>
              <Sparkles className="w-3 h-3 text-accent" strokeWidth={1.5} />
            </div>
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
              <span>✦ EPUB Translation Studio ✦</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

function StudioTab({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={cn(
        "text-sm transition-colors",
        active
          ? "text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </NavLink>
  );
}

function nextTheme(p: "light" | "dark" | "system"): "light" | "dark" | "system" {
  const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
  return order[(order.indexOf(p) + 1) % order.length];
}
