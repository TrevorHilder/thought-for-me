import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BookOpen, Heart, Settings, LogOut, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

interface LayoutProps {
  children: ReactNode;
}

// SVG Logo — geometric ornament + wordmark
function Logo() {
  return (
    <div className="flex items-center gap-2.5" aria-label="A Thought for Me">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* Outer circle */}
        <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
        {/* Inner 8-pointed star (Islamic geometric motif) */}
        <path
          d="M14 4 L15.5 10.5 L22 8 L17.5 13 L24 14 L17.5 15 L22 20 L15.5 17.5 L14 24 L12.5 17.5 L6 20 L10.5 15 L4 14 L10.5 13 L6 8 L12.5 10.5 Z"
          fill="currentColor"
          opacity="0.85"
        />
        {/* Center dot */}
        <circle cx="14" cy="14" r="2" fill="hsl(var(--background))" />
      </svg>
      <span className="font-serif text-base font-medium tracking-wide" style={{ fontFamily: 'Lora, Georgia, serif' }}>
        A Thought for Me
      </span>
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    // Seed from system preference on mount
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    document.documentElement.classList.toggle("dark", mq.matches);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      data-testid="button-theme-toggle"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const [loc] = useLocation();

  const navItems = [
    { href: "/", label: "Thread", Icon: BookOpen },
    { href: "/favourites", label: "Favourites", Icon: Heart },
    { href: "/settings", label: "Settings", Icon: Settings },
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      {/* ── Top nav ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" data-testid="link-logo">
            <span className="text-foreground hover:text-primary transition-colors">
              <Logo />
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {user && (
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                data-testid="button-logout"
                aria-label="Log out"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        {children}
      </main>

      {/* ── Bottom nav (mobile) ── */}
      {user && (
        <nav
          className="sticky bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm md:hidden"
          aria-label="Main navigation"
        >
          <div className="flex items-stretch h-14">
            {navItems.map(({ href, label, Icon }) => {
              const active = loc === href;
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={`link-nav-${label.toLowerCase()}`}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors
                    ${active ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Desktop side nav ── */}
      {user && (
        <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-52 flex-col border-r border-border bg-sidebar pt-16 px-3 pb-4">
          <nav className="flex flex-col gap-0.5 mt-2" aria-label="Sidebar navigation">
            {navItems.map(({ href, label, Icon }) => {
              const active = loc === href;
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={`link-sidebar-${label.toLowerCase()}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
                    ${active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto pt-4">
            <Separator className="mb-4" />
            <p className="text-xs text-muted-foreground truncate px-3 mb-2">{user.email}</p>
            <button
              onClick={logout}
              data-testid="button-sidebar-logout"
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              Log out
            </button>
          </div>
        </aside>
      )}

      <footer className="border-t border-border py-4 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Passages from the works of Idries Shah
          </p>
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
