// Shared layout shell for the studio pages. Provides the top brand bar,
// the route tabs, and a thin frame around the working area.

import { Link, NavLink, useLocation } from "react-router";
import { motion } from "framer-motion";
import {
  BookOpen,
  Coffee,
  Library,
  Menu,
  Settings as SettingsIcon,
  Sun,
  Moon,
  LaptopMinimal,
  X,
} from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { useEffect, useState, useRef } from "react";
import { pullFromDrive } from "@/lib/drive-sync";
import { notifyLibraryChanged } from "@/hooks/use-library";

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

  // Auto-pull from Google Drive on app open if sync is configured.
  const autoPullRan = useRef(false);
  useEffect(() => {
    if (autoPullRan.current) return;
    if (!settings.driveClientId || !settings.driveEmail) return;
    autoPullRan.current = true;
    const t = setTimeout(async () => {
      try {
        const result = await pullFromDrive(settings.driveClientId);
        if (result.ok) {
          update({ lastSyncAt: result.syncedAt });
          notifyLibraryChanged();
        }
      } catch {
        /* quiet */
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pref = settings.themePref;
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = pref === "dark" || (pref === "system" && mq.matches);
      root.classList.toggle("dark", isDark);
    };
    apply();
    // When the user wants to follow the OS, react to the system preference
    // changing in real time (e.g., a sunset schedule switch).
    if (pref === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    return undefined;
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
            <Link
              to="/"
              className="flex items-center gap-3 group"
              aria-label="Atelier home"
            >
              <div className="relative w-9 h-9 grid place-items-center border border-foreground/40">
                <div className="absolute inset-1.5 border border-foreground/15" />
                <BookOpen className="w-4 h-4 text-foreground" strokeWidth={1.4} />
              </div>
              <div className="leading-tight">
                <div className="font-display text-[15px] tracking-wide">
                  Atelier
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Translation Studio
                </div>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-2">
              <StudioTab to="/library" label="Library" icon={Library} active={location.pathname.startsWith("/library")} />
              <StudioTab to="/settings" label="Settings" icon={SettingsIcon} active={location.pathname.startsWith("/settings")} />
            </nav>

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

            <div className="flex items-center gap-2">
              <a
                href="https://ko-fi.com/raynjee"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Buy me a coffee on Ko-fi"
                className="group inline-flex items-center gap-2 h-9 px-3 border border-border hover:border-foreground/40 transition-colors text-xs uppercase tracking-[0.18em] text-foreground/80 hover:text-foreground"
              >
                <Coffee className="w-3.5 h-3.5" strokeWidth={1.4} />
                <span className="hidden sm:inline">Ko-fi</span>
              </a>
              <button
                onClick={() =>
                  update({ themePref: nextTheme(settings.themePref) })
                }
                aria-label="Toggle theme"
                className="w-9 h-9 grid place-items-center border border-border hover:border-foreground/40 transition-colors"
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

      {!hideChrome && (
        <footer className="border-t border-border mt-16">
          <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-xs text-muted-foreground">
            <div className="col-span-2">
              <div className="font-display text-base text-foreground">Atelier</div>
              <p className="leading-relaxed mt-2 max-w-[34ch]">
                A quiet studio for translating novels between languages. Your
                library lives on your machine — nothing leaves the room.
              </p>
            </div>
            <div>
              <div className="studio-caps text-foreground mb-3">Studio</div>
              <ul className="space-y-1.5">
                <li><Link to="/library" className="hover:text-foreground transition-colors">Library</Link></li>
                <li><Link to="/settings" className="hover:text-foreground transition-colors">Settings</Link></li>
              </ul>
            </div>
            <div>
              <div className="studio-caps text-foreground mb-3">Practice</div>
              <ul className="space-y-1.5">
                <li>EPUB in, EPUB out</li>
                <li>Multi-provider failover</li>
                <li>Curated by saberyyang09@gmail.com</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border">
            <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground flex justify-between">
              <span>Atelier — Edition 01</span>
              <span>© {new Date().getFullYear()}</span>
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
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={cn(
        "h-9 px-3 inline-flex items-center gap-2 border border-border transition-colors text-sm",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-foreground/80 hover:border-foreground/40 hover:text-foreground",
      )}
    >
      <Icon className="w-4 h-4" strokeWidth={1.4} />
      <span>{label}</span>
    </NavLink>
  );
}

function nextTheme(p: "light" | "dark" | "system"): "light" | "dark" | "system" {
  const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
  return order[(order.indexOf(p) + 1) % order.length];
}
