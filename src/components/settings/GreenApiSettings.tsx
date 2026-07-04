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

const GREEN_API_DOCS = [
  {
    title: "1. Создайте инстанс",
    text: "Зарегистрируйтесь в Green API Console, создайте инстанс WhatsApp. Скопируйте idInstance и apiTokenInstance.",
    href: "https://green-api.com/docs/about/",
  },
  {
    title: "2. Выберите проект и кабинет",
    text: "Номер WhatsApp привязывается к конкретному рекламному кабинету Meta — так лиды попадут в нужную аналитику.",
  },
  {
    title: "3. Авторизуйте WhatsApp",
    text: "QR-код (рекомендуется) или код по номеру телефона — как в документации Green API /qr и /getAuthorizationCode.",
    href: "https://green-api.com/docs/api/account/QR/",
  },
  {
    title: "4. Готово",
    text: "Входящие сообщения создают лиды в CRM с привязкой к кабинету. Для n8n-бота укажите URL в шаге webhook.",
  },
];

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
            Подключение по{" "}
            <a
              href="https://green-api.com/docs/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              официальной документации Green API
            </a>
            . Один инстанс = один номер WhatsApp на рекламный кабинет.
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

          <div className="flex flex-wrap items-center gap-2">
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
          </div>

          <ol className="grid gap-2 sm:grid-cols-2">
            {GREEN_API_DOCS.map((step) => (
              <li
                key={step.title}
                className="rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-sm"
              >
                <p className="font-medium">{step.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.text}</p>
                {step.href && (
                  <a
                    href={step.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Документация <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ol>
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
