import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Facebook,
  Globe2,
  Loader2,
  Megaphone,
  Plus,
  Save,
  Search,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  useMetaAdAccounts,
  type AvailableMetaAdAccount,
  type MetaListDiagnostics,
} from "@/hooks/useMetaAdAccounts";
import { MetaAccountStatusBlock } from "@/components/ads/MetaAccountStatusBlock";
import { startMetaOAuth } from "@/lib/metaOAuth";

function normalizeActId(id: string): string {
  const t = id.trim();
  if (/^act_\d+$/i.test(t)) return `act_${t.replace(/^act_/i, "")}`;
  if (/^\d+$/.test(t)) return `act_${t}`;
  return t;
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "FB";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function AccountRow({
  acc,
  disabled,
  badge,
  onSelect,
}: {
  acc: AvailableMetaAdAccount;
  disabled?: boolean;
  badge?: string;
  onSelect?: () => void;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "relative grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-bold",
          disabled
            ? "bg-muted text-muted-foreground"
            : "bg-gradient-to-br from-primary/25 via-primary/15 to-primary/5 text-primary ring-1 ring-primary/20",
        )}
      >
        <span className="leading-none">{initials(acc.name)}</span>
        <Facebook className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-card p-0.5 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
            {acc.name}
          </div>
          {badge && (
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80">
          {acc.id}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {acc.account_status === 1 ? (
            <span className="rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
              Активен
            </span>
          ) : acc.status_title ? (
            <MetaAccountStatusBlock status={acc} compact />
          ) : (
            <span className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {acc.status_label}
            </span>
          )}
          <span className="rounded-md border border-border/60 bg-background/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {acc.currency}
          </span>
          {acc.timezone_name && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/50 px-2 py-0.5 text-[10px] text-muted-foreground">
              <Globe2 className="h-2.5 w-2.5" /> {acc.timezone_name}
            </span>
          )}
          {acc.business_name && (
            <span className="truncate rounded-md bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {acc.business_name}
            </span>
          )}
        </div>
      </div>
      {disabled ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-muted-foreground" />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/60 text-muted-foreground transition group-hover:border-success/60 group-hover:bg-success group-hover:text-success-foreground">
          <Plus className="h-4 w-4" />
        </span>
      )}
    </>
  );

  if (disabled) {
    return (
      <div
        className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3.5 text-left opacity-80"
        aria-disabled
      >
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-success/50 hover:bg-success/5 hover:shadow-lg hover:shadow-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/50"
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-success opacity-0 transition group-hover:opacity-100" />
      {inner}
    </button>
  );
}

interface Props {
  active: boolean;
  existingActIds: string[];
  accessToken: string;
  onAccessTokenChange: (v: string) => void;
  onSelect: (acc: AvailableMetaAdAccount) => void;
  onManual: () => void;
}

export function AddCabinetPickStep({
  active,
  existingActIds,
  accessToken,
  onAccessTokenChange,
  onSelect,
  onManual,
}: Props) {
  const { listAvailable, listing } = useMetaAdAccounts();
  const [allAccounts, setAllAccounts] = useState<AvailableMetaAdAccount[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<MetaListDiagnostics | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "payment" | "other">("all");
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleOAuth = async () => {
    setOauthLoading(true);
    try {
      await startMetaOAuth({ returnTo: "/ads?meta_oauth=success" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setOauthLoading(false);
    }
  };

  const existingSet = useMemo(
    () => new Set(existingActIds.map(normalizeActId).filter(Boolean)),
    [existingActIds],
  );

  const { newAccounts, linkedAccounts } = useMemo(() => {
    const linked: AvailableMetaAdAccount[] = [];
    const fresh: AvailableMetaAdAccount[] = [];
    for (const acc of allAccounts) {
      if (existingSet.has(normalizeActId(acc.id))) linked.push(acc);
      else fresh.push(acc);
    }
    return { newAccounts: fresh, linkedAccounts: linked };
  }, [allAccounts, existingSet]);

  const filteredNew = useMemo(() => {
    const q = query.trim().toLowerCase();
    return newAccounts.filter((a) => {
      if (statusFilter === "active" && a.account_status !== 1) return false;
      if (statusFilter === "payment" && !a.needs_payment) return false;
      if (statusFilter === "other" && (a.account_status === 1 || a.needs_payment)) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.business_name?.toLowerCase().includes(q) ?? false) ||
        a.currency.toLowerCase().includes(q)
      );
    });
  }, [newAccounts, query, statusFilter]);

  const activeCount = useMemo(
    () => newAccounts.filter((a) => a.account_status === 1).length,
    [newAccounts],
  );
  const paymentCount = useMemo(
    () => newAccounts.filter((a) => a.needs_payment).length,
    [newAccounts],
  );
  const otherCount = useMemo(
    () => newAccounts.filter((a) => a.account_status !== 1 && !a.needs_payment).length,
    [newAccounts],
  );

  const load = useCallback(async () => {
    setListError(null);
    setDiagnostics(null);
    const { accounts, error, diagnostics: diag } = await listAvailable(accessToken.trim() || undefined);
    setAllAccounts(accounts);
    setDiagnostics(diag ?? null);
    if (error) setListError(error);
  }, [listAvailable, accessToken]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  if (listing) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Загружаем рекламные кабинеты, привязанные к Meta-токену…
        </p>
      </div>
    );
  }

  if (listError) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Не удалось получить список</div>
            <div className="mt-1">{listError}</div>
            <div className="mt-2 text-[11px] opacity-80">
              Подключите Facebook или укажите Access Token ниже.
            </div>
          </div>
        </div>
        <Button
          onClick={() => void handleOAuth()}
          disabled={oauthLoading}
          className="w-full gap-2 bg-[#1877F2] text-white hover:bg-[#166FE5]"
        >
          {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
          Подключить через Facebook
        </Button>
        <Button variant="outline" onClick={() => void load()}>
          Повторить
        </Button>
      </div>
    );
  }

  if (allAccounts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="py-4 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            {diagnostics?.meta_hint ??
              "Meta не вернула рекламных кабинетов. Укажите Access Token ниже или ID вручную."}
          </p>
          {diagnostics?.token_identity && (
            <p className="mt-2 text-xs text-muted-foreground">
              Токен: {diagnostics.token_identity.name} ({diagnostics.token_identity.id})
            </p>
          )}
          {diagnostics?.sources && diagnostics.sources.length > 0 && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">
              Запросы: {diagnostics.sources.join(", ")}
            </p>
          )}
        </div>
        <Button
          onClick={() => void handleOAuth()}
          disabled={oauthLoading}
          className="w-full gap-2 bg-[#1877F2] text-white hover:bg-[#166FE5]"
        >
          {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
          Подключить через Facebook
        </Button>
        <TokenRefreshBlock
          accessToken={accessToken}
          onAccessTokenChange={onAccessTokenChange}
          onRefresh={() => void load()}
        />
        <Button variant="outline" className="w-full" onClick={onManual}>
          Ввести ID кабинета вручную
        </Button>
      </div>
    );
  }

  if (newAccounts.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-center text-sm text-muted-foreground">
          Все кабинеты с этого токена уже добавлены в проект ({linkedAccounts.length}).
          Выберите другой токен или добавьте кабинет по ID вручную.
        </p>
        <div className="space-y-2">
          {linkedAccounts.map((acc) => (
            <AccountRow key={acc.id} acc={acc} disabled badge="Уже в проекте" />
          ))}
        </div>
        <Button variant="outline" className="w-full" onClick={onManual}>
          Ввести ID кабинета вручную
        </Button>
        <TokenRefreshBlock
          accessToken={accessToken}
          onAccessTokenChange={onAccessTokenChange}
          onRefresh={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 space-y-2.5 rounded-xl bg-background/80 px-1 py-2 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию, ID, валюте или бизнесу…"
            className="h-11 rounded-xl pl-9"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "all" as const, label: "Все", count: newAccounts.length },
              { key: "active" as const, label: "Активные", count: activeCount },
              { key: "payment" as const, label: "Оплата", count: paymentCount },
              { key: "other" as const, label: "Прочие", count: otherCount },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  statusFilter === f.key
                    ? "border-success/50 bg-success/15 text-success"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:bg-secondary/60",
                )}
              >
                {f.label}
                <span className="ml-1 opacity-60">{f.count}</span>
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            Найдено: {filteredNew.length}
          </span>
        </div>
      </div>

      {filteredNew.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
          По запросу ничего не найдено
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filteredNew.map((acc) => (
            <AccountRow key={acc.id} acc={acc} onSelect={() => onSelect(acc)} />
          ))}
        </div>
      )}

      {linkedAccounts.length > 0 && (
        <details className="rounded-2xl border border-border/60 bg-card/30 p-3 [&[open]>summary>svg]:rotate-90">
          <summary className="flex cursor-pointer items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <svg className="h-3 w-3 transition" viewBox="0 0 12 12" fill="currentColor">
              <path d="M4 2l4 4-4 4z" />
            </svg>
            Уже в проекте · {linkedAccounts.length}
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {linkedAccounts.map((acc) => (
              <AccountRow key={acc.id} acc={acc} disabled badge="Добавлен" />
            ))}
          </div>
        </details>
      )}

      <TokenRefreshBlock
        accessToken={accessToken}
        onAccessTokenChange={onAccessTokenChange}
        onRefresh={() => void load()}
      />
    </div>
  );
}

function TokenRefreshBlock({
  accessToken,
  onAccessTokenChange,
  onRefresh,
}: {
  accessToken: string;
  onAccessTokenChange: (v: string) => void;
  onRefresh: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const saveToken = async () => {
    const t = accessToken.trim();
    if (!t) {
      toast.error("Сначала вставьте токен");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)("save_meta_access_token", { p_token: t });
    setSaving(false);
    if (error) {
      toast.error("Не сохранено: " + error.message);
      return;
    }
    toast.success("Токен сохранён в Настройки → Автоматизация");
    onRefresh();
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background/40 p-3">
      <Label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Shield className="h-3.5 w-3.5" />
        Свой Access Token
      </Label>
      <Input
        type="password"
        value={accessToken}
        onChange={(e) => onAccessTokenChange(e.target.value)}
        placeholder="EAA…"
        className="h-11 rounded-xl bg-background/60"
      />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={onRefresh}>
          Обновить список
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 gap-1"
          onClick={saveToken}
          disabled={saving || !accessToken.trim()}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Сохранить в настройки
        </Button>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        После сохранения список будет загружаться автоматически без повторного ввода.
        Требуются права <b>ads_read</b> и <b>business_management</b>.
      </p>
    </div>
  );
}
