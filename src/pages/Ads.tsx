import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Target,
  ChevronDown,
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCabinetsStore } from "@/hooks/useCabinetsStore";

const SEARCH_THRESHOLD = 3;


const Ads = () => {
  const [searchParams, setSearchParams] = useSearchParams();
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

  useEffect(() => {
    const status = searchParams.get("meta_oauth");
    if (status !== "success") return;

    const name = searchParams.get("fb_name");
    toast.success(name ? `Facebook подключён: ${name}` : "Facebook подключён — выберите кабинет");
    setAddInitialStep("pick");
    setAddOpen(true);

    const next = new URLSearchParams(searchParams);
    next.delete("meta_oauth");
    next.delete("fb_name");
    next.delete("message");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
    <PageContainer noAnimate className="max-w-none px-2 sm:px-3">
      {/* Meta-style tabs + period */}
      <div className="meta-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--meta-border))] bg-white px-2 sm:px-3">
          <div className="flex items-center">
            <span className="px-3 py-2 text-[13px] font-semibold text-[hsl(var(--meta-create))]">
              Кабинеты
            </span>
          </div>
          <div className="flex items-center gap-2 py-2">
            <span className="hidden text-[12px] text-muted-foreground sm:inline">
              {cabinets.length} {cabinets.length === 1 ? "кабинет" : "кабинетов"}
              {cabinets.length > 0 && (
                <>
                  {" · "}
                  <span className="text-[hsl(var(--meta-create))]">{active} активных</span>
                </>
              )}
            </span>
            <PeriodPicker range={period} onChange={setPeriod} />
          </div>
        </div>

        {/* Toolbar — как в Meta Ads Manager */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--meta-border))] bg-white px-2 py-2 sm:px-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="meta-btn-create">
                <Plus className="h-4 w-4" />
                Создать
                <ChevronDown className="h-3.5 w-3.5 opacity-80" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                onClick={() => {
                  setAddInitialStep("pick");
                  setAddOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Кабинет
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCampaignOpen(true)}>
                <Target className="mr-2 h-4 w-4" />
                Кампанию
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={handleRefresh}
            className="meta-btn-outline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </button>

          {showSearch && (
            <div className="relative ml-auto w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск…"
                className="h-9 rounded-md border-[hsl(var(--meta-border))] bg-white pl-8 text-[13px]"
              />
            </div>
          )}
        </div>

        <AlertsBanner />

        {/* Table header — desktop */}
        {filtered.length > 0 && (
          <div className="meta-table-header hidden grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] gap-3 border-b border-[hsl(var(--meta-border))] px-3 py-2 lg:grid">
            <div>Кабинет</div>
            <div className="text-right">Расход</div>
            <div className="text-right">Лиды</div>
            <div className="text-right">Клики</div>
            <div className="text-right">Показы</div>
            <div />
          </div>
        )}

        <div className="divide-y divide-[hsl(var(--meta-border))] bg-white">
          {filtered.map((c) => (
            <CabinetRow
              key={`${c.id}-${refreshKey}`}
              cabinet={c}
              expanded={!!expanded[c.id]}
              onToggle={() => toggleExpanded(c.id)}
              monthCursor={monthCursor}
              onToggleOnline={handleToggleOnline}
              onRemove={removeCabinet}
              metaTable
            />
          ))}
          {filtered.length === 0 && (
            <div className="relative overflow-hidden rounded-lg border border-dashed border-border bg-white p-12 text-center shadow-sm">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[100px]" />
              <div className="relative mx-auto mb-7 h-24 w-24">
                <div className="absolute inset-0 scale-150 rounded-full bg-primary/15 blur-xl" />
                <div className="relative grid h-full w-full place-items-center rounded-full border border-primary/25 bg-white shadow-md">
                  <Megaphone className="h-10 w-10 text-primary" />
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
                <button
                  type="button"
                  onClick={() => {
                    setAddInitialStep("pick");
                    setAddOpen(true);
                  }}
                  className="meta-btn-create relative mt-8 gap-2 px-6"
                >
                  <Plus className="h-4 w-4" />
                  Создать
                </button>
              )}
            </div>
          )}
        </div>

        {showAggregate && filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-px border-t border-[hsl(var(--meta-border))] bg-[hsl(var(--meta-border))]">
            <StatChip
              label="Расход за месяц"
              value={`${Math.round(totalSpend).toLocaleString("ru-RU").replace(/\s/g, "\u00A0")}\u00A0₸`}
              accent="bg-warning/15 text-warning"
              icon={Wallet}
            />
            <StatChip
              label="Лиды"
              value={totalLeads.toLocaleString("ru-RU")}
              accent="bg-primary/10 text-primary"
              icon={Target}
            />
            <StatChip
              label="Продажи"
              value={totalSales.toLocaleString("ru-RU")}
              accent="bg-primary/10 text-primary"
              icon={ShoppingCart}
            />
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
