import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MessageCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { GreenApiConnectionPanel } from "@/pages/SettingsConnection";
import { supabase } from "@/integrations/supabase/client";

type CabinetOption = { id: string; name: string };

export function GreenApiSettings() {
  const { projects, active } = useProjectsStore();
  const [projectId, setProjectId] = useState("");
  const [cabinetId, setCabinetId] = useState("");
  const [cabinets, setCabinets] = useState<CabinetOption[]>([]);
  const [cabinetsLoading, setCabinetsLoading] = useState(false);

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
        .from("ad_cabinets_safe" as any)
        .select("id, name")
        .eq("project_id", projectId)
        .order("name");
      if (cancelled) return;
      const list = (data ?? []) as CabinetOption[];
      setCabinets(list);
      setCabinetId((prev) => (list.some((c) => c.id === prev) ? prev : list[0]?.id ?? ""));
      setCabinetsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const projectName = useMemo(
    () => projects.find((p) => p.id === projectId)?.name ?? null,
    [projects, projectId],
  );

  const cabinetName = useMemo(
    () => cabinets.find((c) => c.id === cabinetId)?.name ?? null,
    [cabinets, cabinetId],
  );

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-primary" />
            Green API · WhatsApp
          </CardTitle>
          <CardDescription>
            Один инстанс Green API = один номер WhatsApp на рекламный кабинет Meta.
            Авторизация WhatsApp — в Green API Console. Webhook CRM настраивается автоматически после привязки.
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

          <a
            href="https://console.green-api.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-secondary"
          >
            Green API Console
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          {projectId && cabinets.length === 0 && !cabinetsLoading && (
            <p className="text-xs text-muted-foreground">
              Добавьте Meta-кабинет в разделе «Управление рекламой».
            </p>
          )}
        </CardContent>
      </Card>

      {projectId && cabinetId ? (
        <GreenApiConnectionPanel
          embedded
          projectId={projectId}
          projectName={projectName}
          cabinetId={cabinetId}
          cabinetName={cabinetName}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Выберите проект и рекламный кабинет, к которому привязать номер WhatsApp.
        </p>
      )}
    </div>
  );
}
