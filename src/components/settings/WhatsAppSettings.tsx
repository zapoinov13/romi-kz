import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  Plug,
  RefreshCw,
  Unplug,
  XCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  completeWaOnboarding,
  disconnectWaAccount,
  fetchWaEmbeddedConfig,
  fetchWaStatus,
  launchWhatsAppEmbeddedSignup,
  type WaEmbeddedConfig,
  type WhatsAppAccountSafe,
} from "@/lib/whatsappCloud";

type CabinetOption = { id: string; name: string };

export function WhatsAppSettings() {
  const { projects, active } = useProjectsStore();
  const [projectId, setProjectId] = useState("");
  const [cabinetId, setCabinetId] = useState("");
  const [cabinets, setCabinets] = useState<CabinetOption[]>([]);
  const [cabinetsLoading, setCabinetsLoading] = useState(false);

  const [cfg, setCfg] = useState<WaEmbeddedConfig | null>(null);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [account, setAccount] = useState<WhatsAppAccountSafe | null>(null);
  const [connected, setConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(active?.id ?? projects[0].id);
    }
  }, [projects, active?.id, projectId]);

  useEffect(() => {
    if (!projectId) {
      setCabinets([]);
      setCabinetId("");
      return;
    }
    let cancelled = false;
    setCabinetsLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("ad_cabinets_safe" as never)
        .select("id, name")
        .eq("project_id", projectId)
        .order("name");
      if (cancelled) return;
      const list = (data ?? []) as unknown as CabinetOption[];
      setCabinets(list);
      setCabinetId((prev) => (list.some((c) => c.id === prev) ? prev : list[0]?.id ?? ""));
      setCabinetsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setCfgLoading(true);
    void fetchWaEmbeddedConfig()
      .then((c) => {
        if (!cancelled) setCfg(c);
      })
      .catch((e) => {
        if (!cancelled) {
          setCfg({
            ready: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCfgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStatus = async () => {
    if (!projectId || !cabinetId) {
      setAccount(null);
      setConnected(false);
      return;
    }
    setStatusLoading(true);
    try {
      const s = await fetchWaStatus(projectId, cabinetId);
      setAccount(s.account);
      setConnected(!!s.connected);
      if (s.liveError) {
        toast.message("WhatsApp подключён, но Meta API вернул предупреждение", {
          description: s.liveError,
        });
      }
    } catch (e) {
      toast.error("Не удалось получить статус", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, cabinetId]);

  const projectName = useMemo(
    () => projects.find((p) => p.id === projectId)?.name ?? null,
    [projects, projectId],
  );
  const cabinetName = useMemo(
    () => cabinets.find((c) => c.id === cabinetId)?.name ?? null,
    [cabinets, cabinetId],
  );

  const handleConnect = async () => {
    if (!projectId || !cabinetId) {
      toast.error("Выберите проект и рекламный кабинет");
      return;
    }
    if (!cfg?.ready || !cfg.appId || !cfg.configId) {
      toast.error("Embedded Signup ещё не настроен на сервере", {
        description: cfg?.hint ?? cfg?.error ?? "Нужен WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID",
      });
      return;
    }
    setConnecting(true);
    try {
      const { code, session } = await launchWhatsAppEmbeddedSignup({
        appId: cfg.appId,
        configId: cfg.configId,
        graphVersion: cfg.graphVersion ?? "v21.0",
        featureType: cfg.featureType,
        sessionInfoVersion: cfg.sessionInfoVersion,
      });
      await completeWaOnboarding({
        projectId,
        cabinetId,
        code,
        wabaId: session?.waba_id,
        phoneNumberId: session?.phone_number_id,
      });
      toast.success("WhatsApp Business подключён", {
        description: `${cabinetName ?? "Кабинет"} · ${projectName ?? "проект"} — входящие попадут в CRM «Новая»`,
      });
      await refreshStatus();
    } catch (e) {
      toast.error("Не удалось подключить WhatsApp", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!projectId || !cabinetId) return;
    setDisconnecting(true);
    try {
      await disconnectWaAccount({
        accountId: account?.id,
        projectId,
        cabinetId,
      });
      toast.success("WhatsApp отключён от кабинета");
      setAccount(null);
      setConnected(false);
    } catch (e) {
      toast.error("Не удалось отключить", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-primary" />
            WhatsApp Business
          </CardTitle>
          <CardDescription>
            Подключите обычный WhatsApp Business через официальный Meta (QR в приложении).
            Все новые входящие сообщения попадут в CRM проекта на этап «Новая».
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Проект</p>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Выберите проект" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Рекламный кабинет</p>
              <Select
                value={cabinetId || undefined}
                onValueChange={setCabinetId}
                disabled={!projectId || cabinetsLoading || cabinets.length === 0}
              >
                <SelectTrigger className="h-10">
                  <SelectValue
                    placeholder={
                      cabinetsLoading
                        ? "Загрузка…"
                        : cabinets.length === 0
                          ? "Нет кабинетов в проекте"
                          : "Выберите кабинет"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {cabinets.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {projectId && cabinets.length === 0 && !cabinetsLoading && (
            <p className="text-xs text-muted-foreground">
              Добавьте Meta-кабинет в разделе «Управление рекламой».
            </p>
          )}

          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>Выберите проект и кабинет</li>
            <li>Нажмите «Подключить WhatsApp Business»</li>
            <li>В окне Meta выберите «Подключить WhatsApp Business app» и отсканируйте QR</li>
            <li>Готово — сообщения клиентов появятся в CRM</li>
          </ol>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Статус</CardTitle>
            <CardDescription>
              {cabinetName
                ? `Кабинет «${cabinetName}» · проект «${projectName ?? "—"}»`
                : "Выберите кабинет"}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={statusLoading || !projectId || !cabinetId}
            onClick={() => void refreshStatus()}
          >
            {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Обновить
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {connected ? (
              <CheckCircle2 className="h-6 w-6 text-success" />
            ) : (
              <XCircle className="h-6 w-6 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <Badge
                variant="outline"
                className={
                  connected
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border bg-muted text-muted-foreground"
                }
              >
                {connected ? "Подключён" : "Не подключён"}
              </Badge>
              {account?.display_phone && (
                <p className="mt-1.5 text-sm font-semibold">{account.display_phone}</p>
              )}
              {account?.display_name && (
                <p className="text-xs text-muted-foreground">{account.display_name}</p>
              )}
              {account?.phone_number_id && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  phone_number_id: <code>{account.phone_number_id}</code>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void handleConnect()}
              disabled={connecting || !projectId || !cabinetId || cfgLoading}
              className="gap-2 bg-[#25D366] text-white hover:bg-[#1ebe5d]"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              {connected ? "Переподключить" : "Подключить WhatsApp Business"}
            </Button>
            {connected && (
              <Button
                variant="outline"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="gap-2"
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                Отключить
              </Button>
            )}
          </div>

          {cfgLoading ? (
            <p className="text-xs text-muted-foreground">Проверяем конфигурацию Meta…</p>
          ) : !cfg?.ready ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              <p className="font-semibold">Нужна настройка Meta App</p>
              <p className="mt-1 opacity-90">
                {cfg?.error ?? "Embedded Signup config не найден."}
                {" "}
                Secrets: <code>META_APP_ID</code>, <code>META_APP_SECRET</code>,{" "}
                <code>WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID</code>,{" "}
                <code>META_WA_WEBHOOK_VERIFY_TOKEN</code>, <code>META_APP_WEBHOOK_SECRET</code>.
                Webhook URL: <code>.../functions/v1/wa-cloud-webhook</code>.
                Требуется Tech Provider / Solution Partner и Advanced Access к WhatsApp.
              </p>
              {cfg?.hint && <p className="mt-1 opacity-80">{cfg.hint}</p>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Используется официальный Meta Coexistence — номер остаётся в приложении WhatsApp Business.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
