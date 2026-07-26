import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  Unplug,
  WifiOff,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { toast } from "sonner";
import {
  fetchWaWebStatus,
  logoutWaWeb,
  startWaWebPair,
  type WaWebSession,
} from "@/lib/whatsappWeb";

export function WhatsAppWebCard() {
  const { projects, active } = useProjectsStore();
  const [projectId, setProjectId] = useState("");
  const [session, setSession] = useState<WaWebSession | null>(null);
  const [workerOnline, setWorkerOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pairing, setPairing] = useState(false);

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(active?.id ?? projects[0].id);
    }
  }, [projects, active?.id, projectId]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const s = await fetchWaWebStatus(projectId);
      setSession(s.session);
      setWorkerOnline(!!s.worker_online);
    } catch (e) {
      toast.error("Не удалось получить статус WhatsApp", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    if (!projectId) return;
    const t = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(t);
  }, [projectId, refresh]);

  const handlePair = async () => {
    if (!projectId) {
      toast.error("Выберите проект");
      return;
    }
    setPairing(true);
    try {
      const s = await startWaWebPair(projectId);
      setSession(s.session);
      setWorkerOnline(!!s.worker_online);
      if (!s.worker_online) {
        toast.message("Команда отправлена, но worker offline", {
          description: "Запустите daemon на VPS (pm2 wa-web)",
        });
      } else {
        toast.success("Ожидаем QR — отсканируйте в WhatsApp");
      }
    } catch (e) {
      toast.error("Не удалось начать подключение", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPairing(false);
    }
  };

  const handleLogout = async () => {
    if (!projectId) return;
    try {
      await logoutWaWeb(projectId);
      toast.success("WhatsApp отключён");
      await refresh();
    } catch (e) {
      toast.error("Не удалось отключить", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const status = session?.status ?? "disconnected";
  const connected = status === "connected";
  const showQr =
    status === "pairing" &&
    !!session?.qr_data &&
    (!session.qr_expires_at || new Date(session.qr_expires_at).getTime() > Date.now());

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-primary" />
            WhatsApp Web
          </CardTitle>
          <CardDescription>
            Подключите номер как связанное устройство (QR, как WhatsApp Web).
            Входящие сообщения сразу создают/обновляют лида в CRM («Новая»).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Проект</p>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-10 max-w-md">
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
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>Выберите проект</li>
            <li>Нажмите «Показать QR»</li>
            <li>WhatsApp на телефоне → Связанные устройства → Сканировать</li>
            <li>Сообщения клиентов появятся в CRM</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Статус</CardTitle>
            <CardDescription>
              {projects.find((p) => p.id === projectId)?.name ?? "Проект"}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={loading || !projectId}
            onClick={() => void refresh()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Обновить
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {connected ? (
              <CheckCircle2 className="h-6 w-6 text-success" />
            ) : (
              <XCircle className="h-6 w-6 text-muted-foreground" />
            )}
            <Badge
              variant="outline"
              className={
                connected
                  ? "border-success/40 bg-success/10 text-success"
                  : status === "pairing"
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-border bg-muted text-muted-foreground"
              }
            >
              {status === "connected"
                ? "Подключён"
                : status === "pairing"
                  ? "Ожидание QR"
                  : status === "error"
                    ? "Ошибка"
                    : "Не подключён"}
            </Badge>
            <Badge
              variant="outline"
              className={
                workerOnline
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/5 text-destructive"
              }
            >
              {workerOnline ? (
                "Worker online"
              ) : (
                <span className="inline-flex items-center gap-1">
                  <WifiOff className="h-3 w-3" /> Worker offline
                </span>
              )}
            </Badge>
          </div>

          {session?.phone && (
            <p className="text-sm font-semibold">{session.phone}</p>
          )}
          {session?.display_name && (
            <p className="text-xs text-muted-foreground">{session.display_name}</p>
          )}
          {session?.last_error && (
            <p className="text-xs text-destructive">{session.last_error}</p>
          )}

          {showQr && session?.qr_data && (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Отсканируйте QR в приложении WhatsApp
              </p>
              <img
                src={session.qr_data}
                alt="WhatsApp QR"
                className="h-56 w-56 rounded-lg bg-white p-2"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void handlePair()}
              disabled={pairing || !projectId}
              className="gap-2 bg-[#25D366] text-white hover:bg-[#1ebe5d]"
            >
              {pairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              {connected ? "Переподключить (QR)" : "Показать QR"}
            </Button>
            {(connected || status === "pairing") && (
              <Button variant="outline" className="gap-2" onClick={() => void handleLogout()}>
                <Unplug className="h-4 w-4" />
                Отключить
              </Button>
            )}
          </div>

          {!workerOnline && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              Daemon на VPS не отвечает (heartbeat старше 90 сек). Без него QR не появится.
              См. <code className="rounded bg-background/50 px-1">wa-web/README.md</code>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default WhatsAppWebCard;
