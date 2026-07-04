import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, RefreshCw, Circle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { WHATSAPP_SETUP_STEPS, ensureCrmWebhook } from "@/lib/whatsappSetup";

type GreenResp<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | { message?: string } | string;
};

type StateData = { stateInstance?: string };

const STATE_LABELS: Record<string, { label: string; tone: "success" | "warning" | "muted" | "danger" }> = {
  authorized: { label: "Авторизован", tone: "success" },
  notAuthorized: { label: "Не авторизован", tone: "warning" },
  blocked: { label: "Заблокирован", tone: "danger" },
  sleepMode: { label: "Спящий режим", tone: "muted" },
  starting: { label: "Запускается", tone: "muted" },
  yellowCard: { label: "Жёлтая карточка", tone: "warning" },
};

const callProxy = async <T = unknown,>(
  action: "status" | "qr" | "getCode" | "logout" | "settings" | "setWebhook",
  body?: Record<string, unknown>,
  projectId?: string | null,
  cabinetId?: string | null,
): Promise<GreenResp<T>> => {
  const { data, error } = await supabase.functions.invoke("greenapi-proxy", {
    body: {
      action,
      ...(projectId ? { project_id: projectId } : {}),
      ...(cabinetId ? { cabinet_id: cabinetId } : {}),
      ...(body ?? {}),
    },
  });
  if (error) throw new Error(error.message);
  return data as GreenResp<T>;
};

type WaBindRow = {
  id: string;
  project_id: string | null;
  cabinet_id: string | null;
  id_instance: string | null;
  api_token_present: boolean | null;
  api_url: string | null;
  phone: string | null;
  connected: boolean | null;
  ads_only: boolean | null;
  bot_webhook_url?: string | null;
  webhook_url?: string | null;
};

const SettingsConnection = () => {
  const navigate = useNavigate();
  const { active, projects } = useProjectsStore();
  const [projectId, setProjectId] = useState<string>("");
  const [cabinetId, setCabinetId] = useState<string>("");
  const [cabinets, setCabinets] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!projectId && active?.id) setProjectId(active.id);
  }, [active?.id, projectId]);

  useEffect(() => {
    if (!projectId) {
      setCabinets([]);
      setCabinetId("");
      return;
    }
    void supabase
      .from("ad_cabinets_safe" as any)
      .select("id, name")
      .eq("project_id", projectId)
      .order("name")
      .then(({ data }) => {
        const list = (data ?? []) as Array<{ id: string; name: string }>;
        setCabinets(list);
        setCabinetId((prev) => (list.some((c) => c.id === prev) ? prev : list[0]?.id ?? ""));
      });
  }, [projectId]);

  const projectName = projects.find((p) => p.id === projectId)?.name ?? null;
  const cabinetName = cabinets.find((c) => c.id === cabinetId)?.name ?? null;

  return (
    <main className="min-h-screen">
      <section className="container max-w-3xl pt-10 pb-16 sm:pt-14 animate-fade-in-up">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/settings?tab=whatsapp")}
          className="-ml-2 mb-4 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          К настройкам
        </Button>
        <GreenApiConnectionPanel
          projectId={projectId || null}
          projectName={projectName}
          cabinetId={cabinetId || null}
          cabinetName={cabinetName}
        />
        <div className="mt-10">
          <SiteIntakeCard />
        </div>
      </section>
    </main>
  );
};

export type GreenApiConnectionPanelProps = {
  projectId: string | null;
  projectName: string | null;
  cabinetId: string | null;
  cabinetName: string | null;
  embedded?: boolean;
};

export function GreenApiConnectionPanel({
  projectId,
  projectName,
  cabinetId,
  cabinetName,
  embedded = false,
}: GreenApiConnectionPanelProps) {
  const [waRow, setWaRow] = useState<WaBindRow | null>(null);
  const [waLoading, setWaLoading] = useState(true);
  const [webhookOk, setWebhookOk] = useState(false);
  const [webhookEnsuring, setWebhookEnsuring] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const webhookAutoTried = useRef(false);

  const refreshWaRow = useCallback(async () => {
    if (!projectId || !cabinetId) {
      setWaRow(null);
      setWaLoading(false);
      return;
    }
    setWaLoading(true);
    let q = supabase
      .from("whatsapp_config_safe")
      .select("id, project_id, cabinet_id, id_instance, api_token_present, api_url, phone, connected, ads_only, bot_webhook_url, webhook_url")
      .eq("cabinet_id", cabinetId);
    const { data } = await q.maybeSingle();
    if (!data) {
      const legacy = await supabase
        .from("whatsapp_config_safe")
        .select("id, project_id, cabinet_id, id_instance, api_token_present, api_url, phone, connected, ads_only, bot_webhook_url, webhook_url")
        .eq("project_id", projectId)
        .is("cabinet_id", null)
        .maybeSingle();
      setWaRow((legacy.data as WaBindRow | null) ?? null);
    } else {
      setWaRow((data as WaBindRow | null) ?? null);
    }
    setWaLoading(false);
  }, [projectId, cabinetId]);

  const refreshState = useCallback(async () => {
    if (!projectId || !waRow?.id_instance || !waRow?.api_token_present) {
      setState(null);
      return;
    }
    setLoadingState(true);
    try {
      const r = await callProxy<StateData>("status", undefined, projectId, cabinetId);
      const s = (r.data as StateData)?.stateInstance ?? null;
      setState(s);
      await refreshWaRow();
    } catch (e) {
      toast.error("Не удалось получить статус", { description: (e as Error).message });
    } finally {
      setLoadingState(false);
    }
  }, [projectId, cabinetId, waRow?.api_token_present, waRow?.id_instance, refreshWaRow]);

  useEffect(() => {
    void refreshWaRow();
  }, [refreshWaRow]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const isBound = !!(waRow?.id_instance && waRow?.api_token_present);

  const ensureWebhookSetup = useCallback(async (silent = false) => {
    if (!projectId || !cabinetId || !waRow?.id_instance || !waRow?.api_token_present) {
      return false;
    }
    setWebhookEnsuring(true);
    try {
      const result = await ensureCrmWebhook(projectId, cabinetId);
      if (result.matched) {
        setWebhookOk(true);
        await refreshWaRow();
        if (!silent) toast.success("Webhook CRM подключён — сообщения идут в CRM");
        return true;
      }
      if (result.ok && !result.matched) {
        setWebhookOk(false);
        if (!silent) {
          toast.warning("Webhook прописан, но проверка не прошла", {
            description: result.error ?? "Попробуйте обновить статус",
          });
        }
        return false;
      }
      setWebhookOk(false);
      if (!silent) {
        toast.error("Не удалось настроить webhook", { description: result.error });
      }
      return false;
    } finally {
      setWebhookEnsuring(false);
    }
  }, [projectId, cabinetId, waRow?.id_instance, waRow?.api_token_present, refreshWaRow]);

  useEffect(() => {
    webhookAutoTried.current = false;
    setWebhookOk(false);
  }, [projectId, cabinetId, waRow?.id_instance]);

  useEffect(() => {
    if (!isBound || webhookOk || webhookEnsuring || webhookAutoTried.current) return;
    webhookAutoTried.current = true;
    void ensureWebhookSetup(true);
  }, [isBound, webhookOk, webhookEnsuring, ensureWebhookSetup]);

  const handleAfterBind = useCallback(async () => {
    await refreshWaRow();
    await refreshState();
    await ensureWebhookSetup(false);
  }, [refreshWaRow, refreshState, ensureWebhookSetup]);

  const stateMeta = state ? STATE_LABELS[state] : null;
  const isAuthed = state === "authorized";
  const setupSteps = {
    bind: isBound,
    webhook: webhookOk || !!waRow?.webhook_url,
  };

  return (
    <>
        {!embedded && (
          <>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Подключение WhatsApp</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Green API → CRM. Проект: <strong>{projectName ?? "не выбран"}</strong>
              {cabinetName ? (
                <>
                  {" "}
                  · Кабинет: <strong>{cabinetName}</strong>
                </>
              ) : null}
              . Webhook CRM прописывается автоматически после привязки инстанса.
            </p>
          </>
        )}

        {!embedded && (
          <WhatsAppSetupChecklist steps={setupSteps} loading={waLoading} />
        )}

        <WhatsappProjectBindCard
          projectId={projectId}
          projectName={projectName}
          cabinetId={cabinetId}
          cabinetName={cabinetName}
          row={waRow}
          loading={waLoading}
          embedded={embedded}
          onRefresh={refreshWaRow}
          onBound={handleAfterBind}
        />

        {isBound && (
          <div className={cn(
            "flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
            embedded ? "mt-4" : "mt-6",
          )}>
            {webhookEnsuring ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : webhookOk || waRow?.webhook_url ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0" />
            )}
            {webhookEnsuring
              ? "Настраиваем webhook CRM…"
              : webhookOk || waRow?.webhook_url
                ? "Webhook CRM подключён — входящие WhatsApp попадают в CRM и аналитику продаж"
                : "Webhook CRM настроится автоматически"}
          </div>
        )}

        {/* Status Card */}
        <Card className={cn("border-border bg-card", embedded ? "mt-4" : "mt-8")}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">
                {embedded ? "Статус WhatsApp" : "Текущий статус"}
              </CardTitle>
              <CardDescription>
                {embedded
                  ? "Авторизация WhatsApp — в Green API Console"
                  : "Состояние инстанса Green API"}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshState}
              disabled={loadingState || !isBound}
              className="gap-2"
            >
              {loadingState ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Обновить
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {isAuthed ? (
                <CheckCircle2 className="h-6 w-6 text-success" />
              ) : (
                <XCircle className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium",
                    stateMeta?.tone === "success" && "border-success/40 bg-success/10 text-success",
                    stateMeta?.tone === "warning" && "border-warning/40 bg-warning/10 text-warning",
                    stateMeta?.tone === "danger" && "border-destructive/40 bg-destructive/10 text-destructive",
                    (!stateMeta || stateMeta.tone === "muted") && "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {stateMeta?.label ?? state ?? (isBound ? "Неизвестно" : "Не привязан")}
                </Badge>
                {waRow?.phone ? (
                  <p className="mt-1.5 text-sm font-semibold text-foreground">{waRow.phone}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {isAuthed
                    ? "WhatsApp авторизован — входящие попадают в CRM"
                    : isBound
                      ? (
                        <>
                          Авторизуйте WhatsApp в{" "}
                          <a
                            href="https://console.green-api.com"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                          >
                            Green API Console
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {" "}(QR-код на стороне Green API)
                        </>
                      )
                      : "Сначала привяжите idInstance и токен"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
    </>
  );
};

function WhatsAppSetupChecklist({
  steps,
  loading,
}: {
  steps: { bind: boolean; webhook: boolean };
  loading: boolean;
}) {
  const values = [steps.bind, steps.webhook];
  return (
    <Card className="mt-6 border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Чек-лист подключения</CardTitle>
        <CardDescription>После привязки инстанса webhook настраивается автоматически.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {WHATSAPP_SETUP_STEPS.map((step, i) => {
          const done = values[i];
          return (
            <div key={step.id} className="flex items-start gap-2 text-sm">
              {loading ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div>
                <span className="font-medium">{i + 1}. {step.title}</span>
                <p className="text-xs text-muted-foreground">{step.hint}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function WhatsappProjectBindCard({
  projectId,
  projectName,
  cabinetId,
  cabinetName,
  row,
  loading,
  embedded = false,
  onRefresh,
  onBound,
}: {
  projectId: string | null;
  projectName: string | null;
  cabinetId: string | null;
  cabinetName: string | null;
  row: WaBindRow | null;
  loading: boolean;
  embedded?: boolean;
  onRefresh: () => Promise<void>;
  onBound?: () => Promise<void>;
}) {
  const { projects } = useProjectsStore();
  const [rows, setRows] = useState<WaBindRow[]>([]);
  const [cabinetNames, setCabinetNames] = useState<Map<string, string>>(new Map());
  const [instance, setInstance] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshAll = useCallback(async () => {
    if (!embedded) {
      const { data } = await supabase
        .from("whatsapp_config_safe")
        .select("id, project_id, cabinet_id, id_instance, api_token_present, api_url, phone, connected, ads_only, bot_webhook_url, webhook_url");
      const list = (data ?? []) as WaBindRow[];
      setRows(list);
      const cabinetIds = Array.from(new Set(list.map((r) => r.cabinet_id).filter(Boolean))) as string[];
      if (cabinetIds.length > 0) {
        const { data: cabs } = await supabase
          .from("ad_cabinets_safe" as any)
          .select("id, name")
          .in("id", cabinetIds);
        const map = new Map<string, string>();
        for (const c of cabs ?? []) {
          map.set(String((c as { id: string }).id), String((c as { name: string }).name));
        }
        setCabinetNames(map);
      } else {
        setCabinetNames(new Map());
      }
    }
    await onRefresh();
  }, [onRefresh, embedded]);

  useEffect(() => { void refreshAll(); }, [refreshAll]);

  const currentRow = row;
  useEffect(() => {
    setInstance(currentRow?.id_instance ?? "");
    setApiToken("");
    setApiUrl(currentRow?.api_url ?? "");
  }, [currentRow?.id_instance, currentRow?.api_token_present, currentRow?.api_url]);

  const onBind = async () => {
    if (!projectId) {
      toast.error("Сначала выберите проект");
      return;
    }
    if (!cabinetId) {
      toast.error("Выберите рекламный кабинет");
      return;
    }
    const idInstance = instance.trim();
    const token = apiToken.trim();
    if (!/^\d{6,}$/.test(idInstance)) {
      toast.error("idInstance — это число из Green API console");
      return;
    }
    const hasStoredToken = !!currentRow?.api_token_present;
    if (!hasStoredToken && (!token || token.length < 20)) {
      toast.error("apiTokenInstance обязателен — скопируйте его из Green API console");
      return;
    }
    const trimmedApiUrl = apiUrl.trim();
    if (trimmedApiUrl) {
      try {
        const u = new URL(trimmedApiUrl);
        const host = u.hostname.toLowerCase();
        const allowed =
          host === "api.green-api.com"
          || host === "api.greenapi.com"
          || /^[a-z0-9-]+\.api\.greenapi\.com$/i.test(host);
        if (u.protocol !== "https:" || !allowed || (u.pathname !== "/" && u.pathname !== "")) {
          toast.error("apiUrl должен быть https://api.green-api.com или региональный *.api.greenapi.com");
          return;
        }
      } catch {
        toast.error("Некорректный apiUrl");
        return;
      }
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("bind_whatsapp_to_project", {
        p_project_id: projectId,
        p_cabinet_id: cabinetId,
        p_id_instance: idInstance,
        p_api_token: token.length >= 20 ? token : undefined,
        p_api_url: trimmedApiUrl || null,
      });
      if (error) throw error;
      toast.success(`WhatsApp ${idInstance} → «${cabinetName ?? "кабинет"}»`, {
        description: "Webhook CRM настраивается автоматически…",
      });
      await refreshAll();
      await onBound?.();
    } catch (e) {
      toast.error("Не удалось привязать", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const conflict = instance.trim() && rows.find(
    (r) => r.id_instance === instance.trim() && r.cabinet_id !== cabinetId,
  );
  const conflictCabinet = conflict?.cabinet_id
    ? cabinetNames.get(conflict.cabinet_id) ?? "другой кабинет"
    : conflict
      ? projects.find((p) => p.id === conflict.project_id)?.name ?? "другой проект"
      : null;

  return (
    <Card className={cn("border-border bg-card", embedded ? "mt-0" : "mt-6")}>
      <CardHeader>
        <CardTitle className="text-lg">
          {embedded ? "Данные Green API" : "Шаг 1 — Привязать Green API"}
        </CardTitle>
        <CardDescription>
          {embedded ? (
            <>
              idInstance и apiToken из{" "}
              <a href="https://console.green-api.com" target="_blank" rel="noreferrer" className="underline">
                Green API Console
              </a>
              . Кабинет: <strong>{cabinetName ?? "—"}</strong>
            </>
          ) : (
            <>
              Скопируйте из{" "}
              <a href="https://console.green-api.com" target="_blank" rel="noreferrer" className="underline">
                Green API Console
              </a>{" "}
              idInstance и apiTokenInstance. Номер будет привязан к кабинету{" "}
              <strong>{cabinetName ?? "—"}</strong> (проект <strong>{projectName ?? "—"}</strong>).
              Сообщения попадут в CRM этого проекта с атрибуцией к кабинету.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка…
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  idInstance (число из Green API console)
                </p>
                <Input
                  value={instance}
                  onChange={(e) => setInstance(e.target.value)}
                  placeholder="например 7107605912"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  apiTokenInstance (длинный токен, видно рядом с idInstance)
                </p>
                <Input
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={
                    currentRow?.api_token_present
                      ? "•••••• (оставьте пустым, чтобы не менять)"
                      : "b3e0…"
                  }
                  type="password"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  apiUrl (опционально — если у вашего инстанса другой регион)
                </p>
                <Input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.green-api.com"
                />
              </div>
              {currentRow?.id && !embedded ? (
                <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/30 p-3">
                  <div className="text-xs">
                    <p className="font-medium text-foreground">Только заявки с рекламы Meta (CTWA)</p>
                    <p className="mt-1 text-muted-foreground">
                      Выключено по умолчанию — все входящие попадают в CRM. Включите, если нужны только лиды из Click-to-WhatsApp рекламы. Существующим лидам сообщения сохраняются всегда; n8n-бот получает копии в любом случае.
                    </p>
                  </div>
                  <Switch
                    checked={!!currentRow.ads_only}
                    onCheckedChange={async (v) => {
                      const { error } = await supabase
                        .from("whatsapp_config")
                        .update({ ads_only: v })
                        .eq("id", currentRow.id);
                      if (error) {
                        toast.error("Не удалось сохранить", { description: error.message });
                      } else {
                        toast.success(v ? "Фильтр включён: только реклама" : "Фильтр выключен: все входящие");
                        await refreshAll();
                      }
                    }}
                  />
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-muted-foreground">
                  {conflictCabinet ? (
                    <span className="text-destructive">
                      Этот idInstance уже привязан к «{conflictCabinet}». Перепривязка перенесёт его на «
                      {cabinetName}».
                    </span>
                  ) : currentRow ? (
                    <>
                      Текущая привязка: <code>{currentRow.id_instance ?? "—"}</code>
                      {currentRow.phone ? `, номер ${currentRow.phone}` : ""}
                      {currentRow.connected ? " · подключён" : ""}
                    </>
                  ) : (
                    "У этого проекта пока нет привязанного WhatsApp."
                  )}
                </div>
                <Button onClick={onBind} disabled={saving || !projectId || !cabinetId}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {currentRow?.id_instance ? "Перепривязать" : "Привязать"}
                </Button>
              </div>
            </div>

            {rows.length > 0 && !embedded && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Все привязки в системе
                </p>
                <div className="overflow-hidden rounded-md border border-border/60">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Проект</th>
                        <th className="px-3 py-2 font-medium">Кабинет</th>
                        <th className="px-3 py-2 font-medium">idInstance</th>
                        <th className="px-3 py-2 font-medium">Номер</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const proj = projects.find((p) => p.id === r.project_id);
                        return (
                          <tr key={r.id} className="border-t border-border/40">
                            <td className="px-3 py-2">{proj?.name ?? "—"}</td>
                            <td className="px-3 py-2">
                              {r.cabinet_id ? cabinetNames.get(r.cabinet_id) ?? "—" : "—"}
                            </td>
                            <td className="px-3 py-2"><code>{r.id_instance ?? "—"}</code></td>
                            <td className="px-3 py-2">{r.phone ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SiteIntakeCard() {
  const { active, rotateIntakeToken } = useProjectsStore();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-intake`;
  const token = active?.intakeToken ?? "";
  const projectName = active?.name ?? "—";
  const [testing, setTesting] = useState(false);
  const [rotating, setRotating] = useState(false);

  const sendTestLead = async () => {
    if (!token) {
      toast.error("Сначала выберите проект");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: "Тестовая заявка",
          phone: `+7700${Math.floor(1000000 + Math.random() * 8999999)}`,
          email: "test@example.com",
          message: "Это проверка вебхука с сайта",
          source: "site",
          utm_source: "test",
          utm_campaign: "webhook_check",
          landing_url: window.location.href,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && (data as { ok?: boolean } | null)?.ok) {
        toast.success(`Тест прошёл — заявка в CRM проекта «${projectName}»`, {
          description: "Откройте CRM, чтобы её увидеть в этапе «Новая».",
        });
      } else {
        toast.error("Тест не прошёл", {
          description: `HTTP ${res.status}: ${(data as { error?: string } | null)?.error ?? "неизвестная ошибка"}`,
        });
      }
    } catch (e) {
      toast.error("Сеть недоступна", {
        description: (e as Error).message,
      });
    } finally {
      setTesting(false);
    }
  };

  const onRotate = async () => {
    if (!active?.id) return;
    if (!confirm("Перевыпустить webhook? Старый URL перестанет работать на всех сайтах этого проекта.")) {
      return;
    }
    setRotating(true);
    try {
      await rotateIntakeToken(active.id);
      toast.success("Webhook перевыпущен", {
        description: "Скопируйте новый URL и обновите его на всех сайтах проекта.",
      });
    } catch (e) {
      toast.error("Не удалось перевыпустить", { description: (e as Error).message });
    } finally {
      setRotating(false);
    }
  };

  const htmlSnippet = `<!-- Форма заявки → CRM проекта «${projectName}», этап «Новая» -->
<form id="lead-form">
  <input name="name" placeholder="Имя" required />
  <input name="phone" placeholder="+7..." required />
  <input name="email" placeholder="Email" type="email" />
  <textarea name="message" placeholder="Комментарий"></textarea>
  <!-- honeypot: скрытое поле против ботов, оставьте пустым -->
  <input name="company" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" />
  <button type="submit">Отправить</button>
</form>

<script>
(function () {
  // Токен проекта — НЕ удалять, привязывает заявки к нужному CRM-проекту.
  var PROJECT_TOKEN = '${token}';
  var WEBHOOK_URL = '${url}';
  var form = document.getElementById('lead-form');
  if (!form) return;
  // Подхватываем UTM из URL и сохраняем между страницами
  var qs = new URLSearchParams(location.search);
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function (k) {
    var v = qs.get(k); if (v) try { sessionStorage.setItem(k, v); } catch(e) {}
  });
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var payload = Object.fromEntries(fd.entries());
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function (k) {
      try { var v = sessionStorage.getItem(k); if (v && !payload[k]) payload[k] = v; } catch(e) {}
    });
    payload.token = PROJECT_TOKEN;
    payload.referrer = document.referrer || '';
    payload.landing_url = location.href;
    payload.source = payload.source || 'site';
    try {
      var r = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) { form.reset(); alert('Спасибо! Мы свяжемся с вами.'); }
      else { alert('Ошибка отправки. Попробуйте ещё раз.'); }
    } catch (err) { alert('Ошибка сети. Попробуйте ещё раз.'); }
  });
})();
</script>`;

  const tildaHint = `Tilda → Настройки сайта → Формы → WebHook
URL: ${url}
Метод: POST (JSON)
Проект: ${projectName}

ВАЖНО: добавь в форму скрытое поле:
  Имя поля: token
  Значение: ${token}

Без этого поля заявка не привяжется к проекту. Также сохранятся имя, телефон, email, комментарий и UTM-метки.`;

  return (
    <Card className="mt-6 border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg">Webhook для заявок с сайта</CardTitle>
        <CardDescription>
          Активный проект: <strong>{projectName}</strong>. На сайте используйте <strong>URL вебхука</strong> + добавьте <strong>скрытое поле <code>token</code></strong> со значением токена ниже — это привяжет заявку к нужному проекту. Заявка попадёт в этап «Новая».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!token && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            Создайте или выберите проект — тогда здесь появится уникальный webhook.
          </div>
        )}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">URL вебхука</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">{url}</code>
            <Button
              variant="outline"
              size="sm"
              disabled={!token}
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast.success("URL скопирован");
              }}
            >
              Копировать
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!token || rotating}
              onClick={onRotate}
              title="Перевыпустить токен (старый URL перестанет работать)"
            >
              {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              onClick={sendTestLead}
              disabled={!token || testing}
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Отправить тест
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            «Отправить тест» создаст одну тестовую заявку в CRM текущего проекта.
            «Перевыпустить» меняет токен — после этого старый токен <strong>перестаёт работать</strong> на всех сайтах.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Токен проекта (добавьте в форму как скрытое поле <code>token</code>)
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">
              {token || "—"}
            </code>
            <Button
              variant="outline"
              size="sm"
              disabled={!token}
              onClick={() => {
                navigator.clipboard.writeText(token);
                toast.success("Токен скопирован");
              }}
            >
              Копировать
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Без этого токена заявка попадёт в общий пул без привязки к проекту.
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Подключение к Tilda</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(tildaHint);
                toast.success("Инструкция скопирована");
              }}
            >
              Копировать
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
{tildaHint}
          </pre>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Готовый сниппет для любой HTML-формы (UTM подхватываются автоматически)</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(htmlSnippet);
                toast.success("Сниппет скопирован");
              }}
            >
              Копировать сниппет
            </Button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed">
{htmlSnippet}
          </pre>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          Поддерживаются <code>application/json</code> и <code>application/x-www-form-urlencoded</code>. CORS открыт. Поля: <code>name</code>, <code>phone</code> (обязательно), <code>email</code>, <code>message</code>, <code>service</code>, <code>city</code>, <code>utm_source/medium/campaign/content/term</code>, <code>referrer</code>, <code>landing_url</code>, <code>source</code> (необязательно — переопределит источник).
        </div>
      </CardContent>
    </Card>
  );
}

export default SettingsConnection;

