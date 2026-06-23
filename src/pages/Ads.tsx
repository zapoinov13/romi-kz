import { useMemo, useState } from "react";
import {
  LayoutGrid,
  Megaphone,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  ShoppingCart,
  Target,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AddCabinetDialog from "@/components/ads/AddCabinetDialog";
import CreateCampaignDialog from "@/components/ads/CreateCampaignDialog";
import CabinetRow from "@/components/ads/CabinetRow";
import AlertsBanner from "@/components/ads/AlertsBanner";
import { PeriodPicker, monthRange } from "@/components/dashboard/PeriodPicker";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCabinetsStore } from "@/hooks/useCabinetsStore";

const SEARCH_THRESHOLD = 3;

const StatChip = ({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon: LucideIcon;
}) => (
  <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-2 py-2 sm:gap-2.5 sm:px-3">
    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${accent}`}>
      <Icon className="h-3.5 w-3.5" />
    </span>
    <div className="min-w-0 flex-1">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/80 leading-none">
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] sm:text-sm font-bold tabular-nums leading-none">{value}</div>
    </div>
  </div>
);

const Ads = () => {
  const { cabinets, addCabinet, updateCabinet, removeCabinet } = useCabinetsStore();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addInitialStep, setAddInitialStep] = useState<"pick" | "configure">("pick");
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [period, setPeriod] = useState<ReportPeriodRange>(() => monthRange(new Date()));
  const monthCursor = period.from;

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const filtered = useMemo(
    () =>
      cabinets.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [cabinets, query],
  );

  const active = cabinets.filter((c) => c.online).length;
  const showSearch = cabinets.length > SEARCH_THRESHOLD;
  const showAggregate = cabinets.length > 1;

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    toast.success("Данные обновлены");
  };

  const handleToggleOnline = async (id: string) => {
    const c = cabinets.find((x) => x.id === id);
    if (!c) return;
    if (c.provider !== "meta") {
      updateCabinet(id, { online: !c.online });
      toast.success(c.online ? "Кабинет на паузе" : "Кабинет запущен");
      return;
    }
    const action = c.online ? "pause" : "launch";
    const t = toast.loading(
      action === "launch" ? "Запускаем кампанию в Meta…" : "Ставим на паузу в Meta…",
    );
    try {
      const { data, error } = await supabase.functions.invoke("meta-launch-cabinet", {
        body: { cabinet_id: id, action },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { ok?: boolean; error?: string; campaign_id?: string };
      if (!payload.ok) throw new Error(payload.error || "Meta вернула ошибку");
      updateCabinet(id, { online: action === "launch" });
      toast.success(
        action === "launch"
          ? `Кампания запущена в Meta · ${payload.campaign_id ?? ""}`
          : "Кампания поставлена на паузу",
        { id: t },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg, { id: t, duration: 8000 });
    }
  };

  const totalSpend = cabinets.reduce((s, c) => s + (c.spend || 0), 0);
  const totalLeads = cabinets.reduce((s, c) => s + (c.leads || 0), 0);
  const totalSales = cabinets.reduce((s, c) => s + (c.sales || 0), 0);

  return (
    <PageContainer>
      <PageHeader
        icon={Megaphone}
        title="Управление рекламой"
        description={
          cabinets.length === 0
            ? "Нет подключённых кабинетов"
            : (
              <>
                {cabinets.length} {cabinets.length === 1 ? "кабинет" : cabinets.length < 5 ? "кабинета" : "кабинетов"}
                {" · "}
                <span className="text-success">{active} активных</span>
              </>
            )
        }
        actions={
          <div className="flex w-full items-center gap-1.5 sm:w-auto sm:gap-2">
            <PeriodPicker range={period} onChange={setPeriod} />

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg border-border/50"
              aria-label="Обновить"
              onClick={handleRefresh}
              title="Обновить данные"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>

            <Button
              onClick={() => {
                setAddInitialStep("pick");
                setAddOpen(true);
              }}
              size="sm"
              aria-label="Добавить кабинет"
              title="Добавить кабинет"
              className="h-9 w-9 shrink-0 gap-0 rounded-lg border border-success/30 bg-transparent px-0 text-success hover:bg-success/10 sm:w-auto sm:gap-1.5 sm:px-3"
            >
              <Zap className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Кабинет</span>
            </Button>

            <Button
              onClick={() => setCampaignOpen(true)}
              size="sm"
              className="h-9 flex-1 gap-1.5 rounded-lg bg-success font-semibold text-slate-950 shadow-[0_4px_14px_-4px_hsl(var(--success)/0.5)] hover:bg-success/90 sm:flex-none"
            >
              <Rocket className="h-3.5 w-3.5" />
              <span>Кампания</span>
            </Button>
          </div>
        }
      />

      {/* Aggregate KPIs — only when multiple cabinets (otherwise the row itself shows the same numbers) */}
      {showAggregate && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatChip
            label="Расход за месяц"
            value={`${Math.round(totalSpend).toLocaleString("ru-RU").replace(/\s/g, "\u00A0")}\u00A0₸`}
            accent="bg-warning/15 text-warning"
            icon={Wallet}
          />
          <StatChip
            label="Лиды"
            value={totalLeads.toLocaleString("ru-RU")}
            accent="bg-success/15 text-success"
            icon={Target}
          />
          <StatChip
            label="Продажи"
            value={totalSales.toLocaleString("ru-RU")}
            accent="bg-success/15 text-success"
            icon={ShoppingCart}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 space-y-3">
          {showSearch && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по кабинетам…"
                className="h-10 rounded-xl border-border/60 bg-card/60 pl-10"
              />
            </div>
          )}
          <AlertsBanner />
          {filtered.map((c) => (
            <CabinetRow
              key={`${c.id}-${refreshKey}`}
              cabinet={c}
              expanded={!!expanded[c.id]}
              onToggle={() => toggleExpanded(c.id)}
              monthCursor={monthCursor}
              onToggleOnline={handleToggleOnline}
              onRemove={removeCabinet}
            />
          ))}
          {filtered.length === 0 && (
            <div className="relative overflow-hidden rounded-[2rem] border border-dashed border-border/60 bg-gradient-to-b from-card/60 to-transparent p-12 text-center">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-success/10 blur-[100px]" />
              <div className="relative mx-auto mb-7 h-24 w-24">
                <div className="absolute inset-0 scale-150 rounded-full bg-success/20 blur-xl" />
                <div className="relative grid h-full w-full place-items-center rounded-full border border-success/30 bg-card shadow-2xl">
                  <Megaphone className="h-10 w-10 text-success" />
                </div>
              </div>
              <h3 className="relative text-2xl font-bold text-foreground">
                {cabinets.length === 0 ? "Пока нет кабинетов" : "Кабинеты не найдены"}
              </h3>
              <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                {cabinets.length === 0
                  ? "Подключите рекламный кабинет, чтобы видеть актуальные метрики, управлять бюджетами и запускать новые кампании в один клик"
                  : "Попробуйте изменить поисковый запрос"}
              </p>
              {cabinets.length === 0 && (
                <Button
                  onClick={() => {
                    setAddInitialStep("pick");
                    setAddOpen(true);
                  }}
                  className="relative mt-8 h-12 gap-2 rounded-2xl bg-success px-8 font-bold text-slate-950 shadow-[0_10px_25px_-5px_hsl(var(--success)/0.5)] transition-all hover:scale-[1.02] hover:bg-success/90 active:scale-95"
                >
                  <Plus className="h-5 w-5" />
                  Добавить первый кабинет
                </Button>
              )}
            </div>
          )}
      </div>

      <AddCabinetDialog
        key={addOpen ? addInitialStep : "closed"}
        open={addOpen}
        onOpenChange={setAddOpen}
        initialStep={addInitialStep}
        existingActIds={cabinets
          .map((c) => c.adAccountId || c.externalId || "")
          .filter(Boolean)}
        onCreate={async (c) => {
          try {
            const newId = await addCabinet(c);
            toast.success("Кабинет добавлен");
            if (newId && (c.adAccountId || c.externalId)) {
              toast.message("Подтягиваем статистику из Meta…");
              const today = new Date();
              const since = new Date(today.getFullYear(), today.getMonth(), 1)
                .toISOString().slice(0, 10);
              const until = today.toISOString().slice(0, 10);
              supabase.functions.invoke("meta-daily-sync", {
                body: { cabinet_id: newId, since, until },
              }).then(({ data, error }) => {
                if (error) {
                  toast.error("Sync ошибка: " + error.message);
                  return;
                }
                const r = (data?.results ?? [])[0];
                if (r?.ok) {
                  toast.success(
                    `Статистика загружена: ${r.days} дн., ${r.leads} лидов, расход ${Math.round(r.spend)}`,
                  );
                  setRefreshKey((k) => k + 1);
                } else if (r) {
                  toast.error("Meta: " + (r.error || "не удалось получить данные"));
                }
              });
            }
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Не удалось добавить кабинет");
          }
        }}
      />
      <CreateCampaignDialog
        open={campaignOpen}
        onOpenChange={setCampaignOpen}
        cabinets={cabinets}
      />
    </PageContainer>
  );
};

export default Ads;
