import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
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
import {
  metaConversionsTotal,
  metaCpc,
  metaCplAllConversions,
} from "@/lib/metaAdsMetrics";
import { supabase } from "@/integrations/supabase/client";
import { manualValueForSave } from "@/lib/cdiManualOverride";
import { ADS_TD_NUM } from "@/components/ads/adsTableLayout";
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
const formatMoney = (n: number, currency: string, fractionDigits = 0) => {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  const isPrefix = ["$", "€", "£"].includes(sym);
  const num = n.toLocaleString("ru-RU", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
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
  const autoSyncKeys = useRef<Set<string>>(new Set());

  const handleSync = async (opts?: { silent?: boolean }) => {
    if (!cabinet.adAccountId && !cabinet.externalId) {
      if (!opts?.silent) toast.error("Не указан Ad Account кабинета");
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
        if (!opts?.silent) {
          toast.success(
            `Загружено: ${r.days} дн. · клики ${r.clicks ?? 0} · лиды сайта ${r.leads ?? 0} · WhatsApp ${r.messages ?? 0} · расход ${Math.round(r.spend)}`,
          );
        }
        refresh();
        onSynced?.();
      } else if (!opts?.silent) {
        toast.error("Meta: " + (r?.error || "не удалось получить данные"));
      }
    } catch (e) {
      if (!opts?.silent) toast.error((e as Error).message || "Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  };

  // Если за выбранный период (вчера / день) данных нет — подтянуть из Meta один раз
  useEffect(() => {
    if (loading || syncing) return;
    const key = `${cabinet.id}:${since}:${until}`;
    const t = data?.totals;
    const empty =
      !t ||
      ((t.spend ?? 0) === 0 &&
        (t.clicks ?? 0) === 0 &&
        (t.leads ?? 0) === 0 &&
        (t.messages ?? 0) === 0 &&
        (t.impressions ?? 0) === 0);
    if (!empty || autoSyncKeys.current.has(key)) return;
    autoSyncKeys.current.add(key);
    void handleSync({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только смена периода / ответ загрузки
  }, [loading, data, since, until, cabinet.id]);

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

  const traffic = {
    spend: totals?.spend ?? 0,
    clicks: totals?.clicks ?? 0,
    leads: totals?.leads ?? 0,
    messages: totals?.messages ?? 0,
  };
  const cpc = metaCpc(traffic);
  const costPerLead = metaCplAllConversions(traffic);
  const conversionsTotal = metaConversionsTotal(traffic);


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

  const menuItems = (
    <>
      <DropdownMenuItem onClick={() => void handleSync()} disabled={syncing}>
        <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
        Обновить
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
    </>
  );

  const cabinetInfo = (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          cabinet.online ? "bg-success/15 text-success" : "bg-muted/40 text-muted-foreground",
        )}
      >
        <Megaphone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-primary">{cabinet.name}</h3>
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
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
          {cabinet.externalId}
        </div>
      </div>
    </div>
  );

  const actionButtons = (
    <div className="flex shrink-0 items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => void handleSync()}
        disabled={syncing}
        title="Обновить данные из Meta"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-[11px] font-medium text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-60"
      >
        {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        <span>Обновить</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Действия"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {menuItems}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        aria-label="Раскрыть"
        onClick={onToggle}
        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
      </button>
    </div>
  );

  const expandedPanel = (
        <div className="space-y-4 border-t border-border/60 p-3 sm:p-4 animate-fade-in-up">
          {cabinet.provider !== "instagram_organic" && (
            <CabinetCampaignsPanel cabinetId={cabinet.id} currency={currency} />
          )}
          {!loading && !error && !hasDailyData && (
            <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold">За выбранный месяц статистика не подтянута</div>
                <div className="text-xs opacity-80">Нажмите «Обновить», чтобы загрузить данные из Meta.</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleSync()}
                disabled={syncing}
                className="border-warning/40 bg-background/30 text-warning hover:bg-warning/10"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Обновить
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
                label: "Клики",
                value: formatNumber(totals?.clicks ?? 0),
                color: "text-violet-400",
                sub: cpc > 0 ? `CPC ${formatMoney(cpc, currency)}` : undefined,
              },
              {
                label: "Ватсап",
                value: formatNumber(totals?.messages ?? 0),
                color: "text-sky-500",
              },
              {
                label: "Лиды с сайта",
                value: formatNumber(totals?.leads ?? 0),
                color: "text-success",
              },
              {
                label: "Стоимость лида",
                value: costPerLead > 0 ? formatMoney(costPerLead, currency, 2) : "—",
                color: "text-primary",
                sub: conversionsTotal > 0 ? `${conversionsTotal} всего` : undefined,
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
                {m.sub ? (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{m.sub}</div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[640px] text-sm">

              <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Дата</th>
                  <th className="px-4 py-3 text-right font-medium">Расходы</th>
                  <th className="px-4 py-3 text-right font-medium">Клики</th>
                  <th className="px-4 py-3 text-right font-medium">Ватсап</th>
                  <th className="px-4 py-3 text-right font-medium">Лиды с сайта</th>
                  <th className="px-4 py-3 text-right font-medium">Стоимость лида</th>
                </tr>
              </thead>
              <tbody>
                {periodDays.map((d) => {
                  const row = dailyByDate.get(d.iso);
                  const dayConv = (row?.messages ?? 0) + (row?.leads ?? 0);
                  const dayCpl =
                    row && dayConv > 0 && row.spend > 0 ? row.spend / dayConv : 0;
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
                          "px-4 py-3 text-right text-violet-400",
                          !row?.clicks && "text-muted-foreground",
                        )}
                      >
                        {row?.clicks ? formatNumber(row.clicks) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right text-sky-500",
                          !row?.messages && "text-muted-foreground",
                        )}
                      >
                        {row?.messages ? formatNumber(row.messages) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right text-success",
                          !row?.leads && "text-muted-foreground",
                        )}
                      >
                        {row?.leads ? formatNumber(row.leads) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right text-primary",
                          !dayCpl && "text-muted-foreground",
                        )}
                      >
                        {dayCpl > 0 ? formatMoney(dayCpl, currency, 2) : "—"}
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
  );

  return (
    <>
      {/* Desktop: строка таблицы — колонки совпадают с <thead> */}
      <tr className="hidden border-b border-[hsl(var(--meta-border))] bg-white hover:bg-[hsl(var(--meta-header-bg))]/80 lg:table-row">
        <td className="px-3 py-3 align-middle">{cabinetInfo}</td>
        <td className={ADS_TD_NUM}>{formatMoney(totals?.spend ?? 0, currency)}</td>
        <td className={cn(ADS_TD_NUM, "text-violet-500")}>{formatNumber(totals?.clicks ?? 0)}</td>
        <td className={cn(ADS_TD_NUM, "text-sky-500")}>{formatNumber(totals?.messages ?? 0)}</td>
        <td className={cn(ADS_TD_NUM, "text-success")}>{formatNumber(totals?.leads ?? 0)}</td>
        <td className={cn(ADS_TD_NUM, "text-primary")}>
          {costPerLead > 0 ? formatMoney(costPerLead, currency, 2) : "—"}
        </td>
        <td className="px-3 py-3 align-middle">
          {actionButtons}
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
        </td>
      </tr>
      {expanded && (
        <tr className="hidden lg:table-row">
          <td colSpan={7} className="border-b border-[hsl(var(--meta-border))] bg-muted/10 p-0">
            {expandedPanel}
          </td>
        </tr>
      )}

      {/* Mobile: одна ячейка на всю ширину */}
      <tr className="border-b border-[hsl(var(--meta-border))] bg-white lg:hidden">
        <td colSpan={7} className="p-3">
          <div className="flex items-start justify-between gap-2">
            {cabinetInfo}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={syncing}
                aria-label="Обновить"
                className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-60"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Действия"
                    className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {menuItems}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="mt-3 grid w-full grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/30 p-2.5 text-left sm:grid-cols-3"
          >
            <Metric label="Расходы" value={formatMoney(totals?.spend ?? 0, currency)} />
            <Metric
              label="Клики"
              value={<span className="text-violet-400">{formatNumber(totals?.clicks ?? 0)}</span>}
            />
            <Metric
              label="Ватсап"
              value={<span className="text-sky-500">{formatNumber(totals?.messages ?? 0)}</span>}
            />
            <Metric
              label="Лиды с сайта"
              value={<span className="text-success">{formatNumber(totals?.leads ?? 0)}</span>}
            />
            <Metric
              label="Стоимость лида"
              value={
                <span className="text-primary">
                  {costPerLead > 0 ? formatMoney(costPerLead, currency, 2) : "—"}
                </span>
              }
            />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="mt-2 flex h-7 w-full items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            {expanded ? "Свернуть" : "Подробнее"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
          {expanded && expandedPanel}
        </td>
      </tr>
    </>
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
