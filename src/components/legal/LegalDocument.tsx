import { Link } from "react-router-dom";
import { RomiLogo } from "@/components/brand/RomiLogo";

type Props = {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
};

/** Публичная оболочка для политик (без авторизации) — для Meta App Review. */
export function LegalDocument({ title, updatedAt, children }: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/login" className="flex items-center gap-2.5">
            <RomiLogo size="sm" />
            <span className="text-sm font-semibold tracking-wide">ROMI</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">
              Политика конфиденциальности
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Пользовательское соглашение
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Обновлено: {updatedAt}</p>
        <div className="prose prose-sm mt-8 max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-primary">
          {children}
        </div>
      </main>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ROMI ·{" "}
        <a href="https://romi.kz" className="hover:text-foreground" rel="noreferrer">
          romi.kz
        </a>
      </footer>
    </div>
  );
}
