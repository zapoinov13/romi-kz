import { useEffect, useState } from "react";
import { ExternalLink, GitBranch, Rocket, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GITHUB_REPO,
  GITHUB_REPO_URL,
  LIVE_APP_URL,
  LOVABLE_PROJECT_URL,
  SUPABASE_PROJECT_REF,
} from "@/lib/deployConfig";

type SyncInfo = {
  git_sha?: string;
  updated_at?: string;
  label?: string;
  publish_hint?: string;
};

export function LovablePublishGuide() {
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [liveSync, setLiveSync] = useState<SyncInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [localR, liveR] = await Promise.all([
          fetch(`/lovable-sync.json?t=${Date.now()}`),
          fetch(`${LIVE_APP_URL}lovable-sync.json?t=${Date.now()}`),
        ]);
        if (!cancelled) {
          if (localR.ok) setSync((await localR.json()) as SyncInfo);
          if (liveR.ok) setLiveSync((await liveR.json()) as SyncInfo);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updatedLabel = sync?.updated_at
    ? new Date(sync.updated_at).toLocaleString("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const liveBehind =
    sync?.git_sha && liveSync?.git_sha && sync.git_sha !== liveSync.git_sha;

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Rocket className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Деплой на Vercel</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Продакшен:{" "}
            <a
              href={LIVE_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              romi-kz.vercel.app
            </a>
            . Обновления идут из GitHub <code className="text-xs">{GITHUB_REPO}</code> → Vercel,
            не через Lovable Publish.
          </p>
        </div>
      </div>

      <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          Закоммитьте и запушьте в{" "}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {GITHUB_REPO}
          </a>
          , ветка <code className="text-xs">main</code>.
        </li>
        <li>
          GitHub Action <span className="font-medium text-foreground">Vercel Production Deploy</span>
          {" "}соберёт и выложит сайт (нужны секреты VERCEL_* в репозитории).
        </li>
        <li>
          Либо вручную: Vercel Dashboard → проект <strong>romi-agency</strong> → Deployments →
          Redeploy.
        </li>
        <li>
          Проверьте версию ниже и обновите страницу (Ctrl+Shift+R).
        </li>
      </ol>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild variant="default" className="gap-2">
          <a href={LIVE_APP_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            Открыть прод
          </a>
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            <GitBranch className="h-4 w-4" />
            GitHub
          </a>
        </Button>
      </div>

      <details className="mb-4 rounded-xl border border-border/60 bg-background/40 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          Опционально: Lovable (только preview на lovable.app)
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Publish в Lovable <strong>не обновляет</strong> Vercel. Если нужен редактор — подключите Git
          к <code>{GITHUB_REPO}</code>, не к старому MarkVision2/markvision-a1.{" "}
          <a
            href={LOVABLE_PROJECT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Открыть Lovable
          </a>
        </p>
      </details>

      <div className="rounded-xl border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          Версии
        </div>
        {loading ? (
          <p className="mt-2 flex items-center gap-2">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Проверяем…
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            <li>
              <span className="font-medium text-foreground">GitHub (сборка):</span>{" "}
              <code>{sync?.git_sha ?? "—"}</code>
              {updatedLabel ? ` · ${updatedLabel}` : ""}
              {sync?.label && <div className="mt-0.5">{sync.label}</div>}
            </li>
            <li>
              <span className="font-medium text-foreground">На проде (Vercel):</span>{" "}
              <code>{liveSync?.git_sha ?? "—"}</code>
              {liveBehind && (
                <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-warning">
                  отстаёт от main
                </span>
              )}
            </li>
          </ul>
        )}
        <p className="mt-2">
          Supabase: <code>{SUPABASE_PROJECT_REF}</code> — Edge Functions отдельно от Vercel.
        </p>
      </div>
    </section>
  );
}
