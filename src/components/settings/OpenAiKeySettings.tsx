import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle, Loader2, KeyRound, Trash2, RefreshCw, Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useContentFactoryProviders } from "@/hooks/useContentFactoryProviders";
import { useProjectsStore } from "@/hooks/useProjectsStore";

export function OpenAiKeySettings() {
  const { activeId: projectId } = useProjectsStore();
  const { rows, loading, save, test, remove } = useContentFactoryProviders(projectId);
  const row = rows.find((r) => r.provider === "openai");

  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setBusy(true);
    try {
      await save("openai", apiKey.trim(), row?.priority ?? 50);
      toast.success("Ключ OpenAI подключен и проверен");
      setApiKey("");
    } catch (e: any) {
      toast.error(e?.message || "Ключ не прошел проверку");
    } finally { setBusy(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const r: any = await test("openai");
      if (r?.ok) toast.success("Ключ работает");
      else toast.error(r?.error || "Ошибка проверки");
    } catch (e: any) { toast.error(e?.message || "Ошибка"); }
    finally { setTesting(false); }
  };

  const handleRemove = async () => {
    if (!confirm("Удалить ключ OpenAI? Авто-генерация текстов рекламы перестанет работать.")) return;
    try { await remove("openai"); toast.success("Ключ удален"); }
    catch (e: any) { toast.error(e?.message || "Ошибка"); }
  };

  if (!projectId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Выберите активный проект, чтобы подключить ключ OpenAI.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Ключ OpenAI
          </CardTitle>
          <CardDescription>
            Ключ хранится в зашифрованном виде и используется только сервером. Браузеру не отдается.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {row ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/40 p-3">
              <Badge variant="outline" className="font-mono text-xs">{row.key_hint}</Badge>
              {row.status === "ok" && (
                <Badge className="gap-1 bg-success/15 text-success border-success/40">
                  <CheckCircle2 className="h-3 w-3" /> Работает
                </Badge>
              )}
              {row.status === "error" && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" /> Ошибка
                </Badge>
              )}
              {row.status === "quota" && (
                <Badge className="gap-1 bg-warning/15 text-warning border-warning/40">
                  <AlertCircle className="h-3 w-3" /> Нет баланса
                </Badge>
              )}
              {row.status === "unknown" && <Badge variant="outline">Не проверен</Badge>}
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  <span className="ml-1">Проверить</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={handleRemove}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              {row.last_error && (
                <div className="basis-full text-xs text-destructive">{row.last_error}</div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-card/40 p-3 text-sm text-muted-foreground">
              Ключ еще не подключен.
            </div>
          )}

          <div className="space-y-2">
            <Label>{row ? "Заменить ключ" : "API-ключ OpenAI"}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={show ? "text" : "password"}
                  autoComplete="off"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={show ? "Скрыть" : "Показать"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={handleSave} disabled={busy || !apiKey.trim()}>
                {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Сохранить и проверить
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Получить ключ: platform.openai.com -&gt; API keys. Для Vision подходит план с доступом к gpt-4o-mini.
            </p>
          </div>
          {loading && <div className="text-xs text-muted-foreground">Загрузка...</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Для чего используется ключ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <span className="text-primary">-</span>
            <div>
              <span className="font-medium text-foreground">Авто-генерация текстов рекламы.</span>
              {" "}При запуске рекламы загрузите креатив - система через GPT-4o Vision поймет, что на фото/видео,
              о чем оно, какой оффер на картинке, и сама напишет заголовок, основной текст и описание.
              Поля можно отредактировать перед запуском.
            </div>
          </div>
          <div className="flex gap-2">
            <span className="text-primary">-</span>
            <div>
              <span className="font-medium text-foreground">Контент-завод.</span>
              {" "}Тот же ключ используется как один из приоритетов в Контент-заводе для генерации картинок и копирайтов.
            </div>
          </div>
          <div className="flex gap-2 pt-2 text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
            <div>Каждый запрос анализа креатива - это вызов OpenAI и расход с вашего баланса (gpt-4o-mini, обычно меньше $0.01 за креатив).</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
