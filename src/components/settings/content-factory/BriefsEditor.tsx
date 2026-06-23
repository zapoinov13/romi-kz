import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, Save, FileText } from "lucide-react";
import { toast } from "sonner";
import { useContentFactoryBriefs } from "@/hooks/useContentFactoryBriefs";
import { CONTENT_TYPE_LABELS, DEFAULT_BRIEFS, type ContentFactoryType } from "@/lib/contentFactoryDefaults";

const TYPES: ContentFactoryType[] = ["facebook-ads", "marketplace", "insta-carousel", "stories", "warmup"];

export function BriefsEditor({ projectId }: { projectId: string | null }) {
  const { rows, save, resetToDefault } = useContentFactoryBriefs(projectId);
  const [tab, setTab] = useState<ContentFactoryType>("facebook-ads");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const current = rows.find((r) => r.content_type === tab);

  useEffect(() => {
    setDraft(current?.system_prompt ?? DEFAULT_BRIEFS[tab]);
  }, [tab, current?.system_prompt]);

  const dirty = draft.trim() !== (current?.system_prompt ?? DEFAULT_BRIEFS[tab]).trim();

  const handleSave = async () => {
    if (!projectId) { toast.error("Нет активного проекта"); return; }
    setSaving(true);
    try {
      await save(tab, draft.trim());
      toast.success("ТЗ сохранён");
    } catch (e: any) { toast.error(e?.message || "Ошибка"); }
    finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!current?.is_custom) {
      setDraft(DEFAULT_BRIEFS[tab]);
      return;
    }
    if (!confirm("Сбросить ТЗ к стандартному шаблону?")) return;
    try {
      await resetToDefault(tab);
      setDraft(DEFAULT_BRIEFS[tab]);
      toast.success("Сброшено");
    } catch (e: any) { toast.error(e?.message || "Ошибка"); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4"/> ТЗ по форматам</CardTitle>
        <CardDescription>
          Системный промпт, который Контент-завод отправляет в AI-провайдера для каждого формата. Меняйте под свой бренд и тон.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!projectId ? (
          <div className="text-sm text-muted-foreground">Выберите активный проект.</div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as ContentFactoryType)}>
            <TabsList className="mb-4 flex h-auto w-full flex-wrap gap-1 bg-card/40 p-1">
              {TYPES.map((t) => (
                <TabsTrigger key={t} value={t} className="text-xs">
                  {CONTENT_TYPE_LABELS[t]}
                  {rows.find(r => r.content_type === t)?.is_custom && (
                    <Badge variant="outline" className="ml-2 h-4 px-1 text-[10px]">кастом</Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            {TYPES.map((t) => (
              <TabsContent key={t} value={t} className="space-y-3 mt-0">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-[280px] font-mono text-xs"
                  placeholder="Опишите тон, стиль, структуру для этого формата…"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{draft.length} символов</span>
                  <span>Переменные: {'{product}'}, {'{audience}'}, {'{tone}'}, {'{brand}'}, {'{aspect}'}, {'{slides}'}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5"/> Сбросить к дефолту
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
                    {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Save className="mr-1 h-3.5 w-3.5"/>}
                    Сохранить
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}