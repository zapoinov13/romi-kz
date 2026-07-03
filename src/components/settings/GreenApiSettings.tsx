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

const GREEN_API_DOCS = [
  {
    title: "1. Создайте инстанс",
    text: "Зарегистрируйтесь в Green API Console, создайте инстанс WhatsApp. Скопируйте idInstance и apiTokenInstance.",
    href: "https://green-api.com/docs/about/",
  },
  {
    title: "2. Привяжите к проекту",
    text: "Вставьте idInstance и apiToken ниже — инстанс привяжется к выбранному проекту. CRM webhook настроится автоматически.",
  },
  {
    title: "3. Авторизуйте WhatsApp",
    text: "QR-код (рекомендуется) или код по номеру телефона — как в документации Green API /qr и /getAuthorizationCode.",
    href: "https://green-api.com/docs/api/account/QR/",
  },
  {
    title: "4. Готово",
    text: "Входящие сообщения создают лиды в CRM. Для n8n-бота укажите URL в шаге 4 webhook-карточки.",
  },
];

export function GreenApiSettings() {
  const { projects, active } = useProjectsStore();
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(active?.id ?? projects[0].id);
    }
  }, [projects, active?.id, projectId]);

  const projectName = useMemo(
    () => projects.find((p) => p.id === projectId)?.name ?? null,
    [projects, projectId],
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
            . Один инстанс = один номер WhatsApp на проект.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
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
            <a
              href="https://console.green-api.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-secondary"
            >
              Green API Console
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
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

      {projectId ? (
        <GreenApiConnectionPanel
          embedded
          projectId={projectId}
          projectName={projectName}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Создайте или выберите проект в шапке сайта.</p>
      )}
    </div>
  );
}
