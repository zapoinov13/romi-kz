import { useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  ChevronDown,
  Copy,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Power,
  Pencil,
  RefreshCw,
  Target,
  Trash2,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AdCabinet } from "@/types/ads";
import { useMetaInsightsRange } from "@/hooks/useMetaInsights";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import { dateRangeToIso, eachDayInRange, isoDateLocal } from "@/lib/periodRange";
import { supabase } from "@/integrations/supabase/client";
import { manualValueForSave } from "@/lib/cdiManualOverride";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CabinetCampaignsPanel from "@/components/ads/CabinetCampaignsPanel";
import CabinetKpiDialog from "@/components/ads/CabinetKpiDialog";
import CabinetAutomationDialog from "@/components/ads/CabinetAutomationDialog";
import { MetaAccountStatusInline } from "@/components/ads/MetaAccountStatusBlock";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  KZT: "$",
  RUB: "₽",
  UAH: "₴",
  GBP: "£",
  TRY: "₺",
  BYN: "Br",
};
const formatMoney = (n: number, currency: string) => {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  const isPrefix = ["$", "€", "£"].includes(sym);
  const num = Math.round(n).toLocaleString("ru-RU");
  return isPrefix ? `${sym}${num}` : `${num} ${sym}`;
};
const formatNumber = (n: number) => Math.round(n).toLocaleString("ru-RU");

const MONTHS_RU_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

const Metric = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div>
    <div className="text-[9px] uppercase tracking-wider text-muted-foreground/80 leading-none">
      {label}
    </div>
    <div className="mt-1 text-sm font-bold tabular-nums leading-none">{value}</div>
  </div>
);

interface Props {
  cabinet: AdCabinet;
  expanded: boolean;
  onToggle: () => void;
  period: ReportPeriodRange;
  onToggleOnline: (id: string) => void;
  onRemove: (id: string) => void;
  onSynced?: () => void;
  metaTable?: boolean;
}

const CabinetRow = ({ cabinet, expanded, onToggle, period, onToggleOnline, onRemove, onSynced, metaTable }: Props) => {
  const { since, until } = dateRangeToIso(period);

  const { data, loading, error, refresh } = useMetaInsightsRange(
    cabinet.externalId,
    period,
    true,
  );

  const [syncing, setSyncing] = useState(false);
  const [kpiOpen, setKpiOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);

  const handleSync = async () => {
    if (!cabinet.adAccountId && !cabinet.externalId) {
      toast.error("Не указан Ad Account кабинета");
      return;
    }
    setSyncing(true);
    try {
      const { data: resp, error: err } = await supabase.functions.invoke("meta-daily-sync", {
        body: { cabinet_id: cabinet.id, since, until },
      });
      if (err) throw err;
      const r = (resp?.results ?? [])[0];
      if (r?.ok) {
        toast.success(`Загружено: ${r.days} дн., ${r.leads} лидов, расход ${Math.round(r.spend)}`);
        refresh();
        onSynced?.();
      } else {
        toast.error("Meta: " + (r?.error || "не удалось получить данные"));
      }
    } catch (e) {
      toast.error((e as Error).message || "Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  };

  const totals = data?.totals;
  const currency = data?.currency ?? cabinet.currency ?? "USD";
  const hasDailyData = !!data?.daily.length;
  const dailyByDate = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["daily"][number]>();
    for (const d of data?.daily ?? []) {
      map.set(d.date, d);
    }
    return map;
  }, [data]);

  const periodDays = useMemo(() => {
    return eachDayInRange(period).map((date) => {
      const isoDate = isoDateLocal(date);
      const monthShort = MONTHS_RU_SHORT[date.getMonth()];
      return {
        key: isoDate,
        label: `${date.getDate()} ${monthShort}`,
        iso: isoDate,
      };
    });
  }, [period.from, period.to]);

  const cpl = totals && totals.leads > 0 ? totals.spend / totals.leads : 0;

  const upsertManual = async (
    isoDate: string,
    patch: Record<string, number>,
  ) => {
    try {
      const { data: existing } = await supabase
        .from("cabinet_daily_insights")
        .select("id")
        .eq("cabinet_id", cabinet.id)
        .eq("date", isoDate)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await (supabase as any)
          .from("cabinet_daily_insights")
          .update(patch)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("cabinet_daily_insights")
          .insert({
            cabinet_id: cabinet.id,
            external_id: cabinet.externalId,
            project_id: (cabinet as { projectId?: string }).projectId ?? null,
            date: isoDate,
            ...patch,
          });
        if (error) throw error;
      }
      toast.success("Сохранено");
      refresh();
    } catch (e) {
      toast.error((e as Error).message || "Не удалось сохранить");
    }
  };

  const handleManualDiagnostics = (isoDate: string, v: number) =>
    upsertManual(isoDate, { manual_diagnostics: v });
  const handleManualSales = (isoDate: string, v: number) =>
    upsertManual(isoDate, { manual_sales: v });
  const handleManualRevenue = (isoDate: string, v: number) =>
    upsertManual(isoDate, { manual_revenue: v });

  return (
    <article
      className={cn(
        "group transition-colors",
        metaTable
          ? "border-0 bg-white hover:bg-[hsl(var(--meta-header-bg))]"
          : "meta-card hover:border-primary/30 hover:shadow-md",
      )}
    >
      <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:gap-4">
        {/* Header row: icon + name + actions (always on one row on mobile) */}
        <div className="flex items-center gap-2.5 lg:flex-1 lg:min-w-0">
          <span className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors lg:h-9 lg:w-9",
            cabinet.online ? "bg-success/15 text-success" : "bg-muted/40 text-muted-foreground",
          )}>
            <Megaphone className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate text-sm font-semibold text-primary hover:underline">{cabinet.name}</h3>
              {cabinet.online ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground">
                  <span className="meta-status-dot meta-status-active" />
                  Активно
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <span className="meta-status-dot meta-status-paused" />
                  Выкл.
                </span>
              )}
              <span className="hidden rounded-md bg-muted/30 px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground sm:inline">
                {cabinet.type}
              </span>
              {cabinet.type === "Агентский" && (
                <span
                  title="Агентский кабинет: данные не попадают в Дашборд / CRM / Аналитику"
                  className="rounded-md bg-warning/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-warning"
                >
                  Только список
                </span>
              )}
              <MetaAccountStatusInline actId={cabinet.externalId} compact className="w-full sm:w-auto" />
              {loading && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="mt-0.5 hidden truncate font-mono text-[10px] text-muted-foreground/70 sm:block">
              {cabinet.externalId}
            </div>
          </div>

          {/* Mobile-only actions cluster next to the name to save vertical space */}
          <div className="flex items-center gap-0.5 lg:hidden">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              aria-label="Получить статистику"
              title="Получить статистику из Meta"
              className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Действия"
                  className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
                  Получить статистику
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setKpiOpen(true)}>
                  <Target className="mr-2 h-4 w-4" />
                  Настроить KPI
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAutomationOpen(true)}>
                  <Bot className="mr-2 h-4 w-4" />
                  Автоматизация
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(cabinet.externalId);
                    toast.success("ID скопирован");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Скопировать ID
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleOnline(cabinet.id)}>
                  <Power className="mr-2 h-4 w-4" />
                  {cabinet.online ? "Поставить на паузу" : "Запустить"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    if (confirm(`Удалить кабинет «${cabinet.name}»?`)) {
                      onRemove(cabinet.id);
                      toast.success("Кабинет удалён");
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Compact metrics — tap to expand on mobile */}
        <button
          type="button"
          onClick={onToggle}
          className="grid w-full grid-cols-4 gap-2 rounded-lg border border-border bg-secondary/30 p-2.5 text-left transition-colors hover:border-primary/25 active:bg-secondary/50 lg:w-auto lg:border-0 lg:bg-transparent lg:p-0 lg:gap-5"
        >
          <Metric
            label="Расход"
            value={formatMoney(totals?.spend ?? 0, currency)}
          />
          <Metric
            label="Лиды"
            value={
              <span>
                <span className="text-primary">{formatNumber(totals?.leads ?? 0)}</span>{" "}
                <span className="text-[10px] font-normal text-muted-foreground">
                  {cpl > 0 ? formatMoney(cpl, currency) : ""}
                </span>
              </span>
            }
          />
          <Metric
            label="Клики"
            value={
              <span className="text-violet-400">
                {formatNumber(totals?.clicks ?? 0)}
              </span>
            }
          />
          <Metric
            label="Показы"
            value={
              <span className="text-blue-400">
                {formatNumber(totals?.impressions ?? 0)}
              </span>
            }
          />
        </button>

        {/* Desktop-only action cluster (mobile actions live next to the name above) */}
        <div className="hidden items-center gap-1 self-center lg:flex">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            title="Получить статистику из Meta"
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
            <span>{syncing ? "Загрузка" : "Статистика"}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Действия"
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleSync} disabled={syncing}>
                <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
                Получить статистику
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setKpiOpen(true)}>
                <Target className="mr-2 h-4 w-4" />
                Настроить KPI
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAutomationOpen(true)}>
                <Bot className="mr-2 h-4 w-4" />
                Автоматизация
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(cabinet.externalId);
                  toast.success("ID скопирован");
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Скопировать ID
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleOnline(cabinet.id)}>
                <Power className="mr-2 h-4 w-4" />
                {cabinet.online ? "Поставить на паузу" : "Запустить"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (confirm(`Удалить кабинет «${cabinet.name}»?`)) {
                    onRemove(cabinet.id);
                    toast.success("Кабинет удалён");
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            aria-label="Раскрыть"
            onClick={onToggle}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        </div>

        {/* Mobile expand hint — full-width chevron under metrics */}
        <button
          type="button"
          onClick={onToggle}
          className="flex h-7 items-center justify-center gap-1 rounded-md text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
        >
          {expanded ? "Свернуть" : "Подробнее"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>


      {expanded && (
        <div className="space-y-4 border-t border-border/60 p-3 sm:p-4 animate-fade-in-up">
          {cabinet.provider !== "instagram_organic" && (
            <CabinetCampaignsPanel cabinetId={cabinet.id} currency={currency} />
          )}
          {!loading && !error && !hasDailyData && (
            <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold">За выбранный месяц статистика не подтянута</div>
                <div className="text-xs opacity-80">Нажмите «Получить статистику», чтобы загрузить данные из Meta.</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSync}
                disabled={syncing}
                className="border-warning/40 bg-background/30 text-warning hover:bg-warning/10"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
                Получить статистику
              </Button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <div className="font-semibold">Ошибка Meta API</div>
                <div className="opacity-90">{error}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              {
                label: "Расходы",
                value: formatMoney(totals?.spend ?? 0, currency),
                color: "text-foreground",
              },
              {
                label: "Показы",
                value: formatNumber(totals?.impressions ?? 0),
                color: "text-blue-400",
              },
              {
                label: "Клики",
                value: formatNumber(totals?.clicks ?? 0),
                color: "text-violet-400",
              },
              {
                label: "Лиды",
                value: formatNumber(totals?.leads ?? 0),
                color: "text-success",
              },
              {
                label: "CPL",
                value: cpl > 0 ? formatMoney(cpl, currency) : `— ${CURRENCY_SYMBOLS[currency] ?? currency}`,
                color: "text-amber-400",
              },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-border/60 bg-background/40 p-3"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </div>
                <div className={cn("mt-1 text-lg font-semibold", m.color)}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[520px] text-sm">

              <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Дата</th>
                  <th className="px-4 py-3 text-right font-medium">Расходы</th>
                  <th className="px-4 py-3 text-right font-medium">Показы</th>
                  <th className="px-4 py-3 text-right font-medium">Клики</th>
                  <th className="px-4 py-3 text-right font-medium">Лиды</th>
                  <th className="px-4 py-3 text-right font-medium">CPL</th>
                </tr>
              </thead>
              <tbody>
                {periodDays.map((d) => {
                  const row = dailyByDate.get(d.iso);
                  const dayCpl =
                    row && row.leads > 0 ? row.spend / row.leads : 0;
                  return (
                    <tr
                      key={d.key}
                      className="border-t border-border/60 last:border-b-0"
                    >
                      <td className="px-4 py-3 font-medium">{d.label}</td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right",
                          !row?.spend && "text-muted-foreground",
                        )}
                      >
                        {row?.spend ? formatMoney(row.spend, currency) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right",
                          !row?.impressions && "text-muted-foreground",
                        )}
                      >
                        {row?.impressions ? formatNumber(row.impressions) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right",
                          !row?.clicks && "text-muted-foreground",
                        )}
                      >
                        {row?.clicks ? formatNumber(row.clicks) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right",
                          !row?.leads && "text-muted-foreground",
                        )}
                      >
                        {row?.leads ? formatNumber(row.leads) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right",
                          !dayCpl && "text-muted-foreground",
                        )}
                      >
                        {dayCpl > 0 ? formatMoney(dayCpl, currency) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Данные Meta подгружаются в реальном времени по дням выбранного месяца.
          </p>
        </div>
      )}
      <CabinetKpiDialog
        open={kpiOpen}
        onOpenChange={setKpiOpen}
        cabinetId={cabinet.id}
        cabinetName={cabinet.name}
      />
      <CabinetAutomationDialog
        open={automationOpen}
        onOpenChange={setAutomationOpen}
        cabinetId={cabinet.id}
        cabinetName={cabinet.name}
        currency={currency}
      />
    </article>
  );
};

const DiagnosticsCell = ({
  isoDate,
  diagnostics,
  crm,
  manual,
  onSave,
}: {
  isoDate: string;
  /** Итоговое значение (override-aware). */
  diagnostics: number;
  /** Чистое CRM значение, чтобы в попапе можно было увидеть авто-факт даже если поверх стоит manual. */
  crm: number;
  manual: number;
  onSave: (newManual: number) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>(String(manual));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const n = Math.max(0, Math.floor(Number(val) || 0));
    setSaving(true);
    try {
      await onSave(n);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(String(manual)); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-secondary",
            !diagnostics && "text-muted-foreground",
          )}
          title={`Дата ${isoDate}. CRM + ручные`}
        >
          {diagnostics ? diagnostics : "—"}
          <Pencil className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-2">
          <div className="text-xs font-medium">Диагностики вручную</div>
          <div className="text-[11px] text-muted-foreground">
            Из CRM: {crm} · Вручную: {manual} · Показано: {diagnostics}
          </div>
          <Input
            type="number"
            min={0}
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const EditableNumberCell = ({
  value,
  manual,
  fromAuto,
  autoLabel,
  render,
  onSave,
  title,
  allowDecimal,
}: {
  value: number;
  manual: number;
  fromAuto: number;
  autoLabel: string;
  render: (v: number) => React.ReactNode;
  onSave: (newManual: number) => Promise<void>;
  title: string;
  allowDecimal?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>(String(manual));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const num = Number(val) || 0;
    const n = allowDecimal ? Math.max(0, num) : Math.max(0, Math.floor(num));
    setSaving(true);
    try {
      await onSave(n);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(String(manual)); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-secondary",
            !value && "text-muted-foreground",
          )}
        >
          {render(value)}
          <Pencil className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-2">
          <div className="text-xs font-medium">{title}</div>
          <div className="text-[11px] text-muted-foreground">
            {autoLabel}: {fromAuto} · Вручную: {manual}
          </div>
          <Input
            type="number"
            min={0}
            step={allowDecimal ? "0.01" : "1"}
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default CabinetRow;
