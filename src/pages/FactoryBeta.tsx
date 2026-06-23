import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const TYPES = [
  { id: "insta-carousel", label: "Карусели Instagram (10 слайдов)" },
  { id: "ad-creative", label: "Креативы для рекламы (1 кадр)" },
  { id: "marketplace", label: "Карточки товара (1-3 кадра)" },
  { id: "warmup", label: "Прогревы (серия)" },
];

const PLATFORMS = ["WB", "Ozon", "Kaspi"];

const FactoryBeta = () => {
  const navigate = useNavigate();
  const [contentType, setContentType] = useState("insta-carousel");
  const [brief, setBrief] = useState("");
  const [customText, setCustomText] = useState("");
  const [chatId, setChatId] = useState("");
  // marketplace
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState("WB");
  // ad-creative
  const [extraInstructions, setExtraInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!brief.trim()) {
      toast.error("Опиши задачу в брифе");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        brief: brief.trim(),
        brief_text: brief.trim(),
        custom_text: customText.trim(),
        assets: {},
      };
      if (contentType === "marketplace") {
        payload.name = name.trim();
        payload.description = description.trim();
        payload.platform = platform;
      }
      if (contentType === "ad-creative") {
        payload.extra_instructions = extraInstructions.trim();
      }
      const { data, error } = await supabase.functions.invoke("clony-ingest", {
        body: {
          content_type: contentType,
          chat_id: chatId.trim() || null,
          payload,
        },
      });
      if (error) throw error;
      const jobId = (data as { job_id?: string })?.job_id;
      if (!jobId) throw new Error("ingest не вернул job_id");
      navigate(`/factory/job/${jobId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="container max-w-3xl py-10">
      <h1 className="mb-2 text-2xl font-semibold">Контент-завод beta</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Новый пайплайн на очереди задач. Прогресс в реальном времени.
      </p>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-card/40 p-6">
        <div className="space-y-2">
          <Label>Формат</Label>
          <Select value={contentType} onValueChange={setContentType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Бриф</Label>
          <Textarea rows={5} value={brief} onChange={(e) => setBrief(e.target.value)}
            placeholder="Что продаём, для кого, ключевые офферы, тон..." />
        </div>

        <div className="space-y-2">
          <Label>Свой текст клиента (опционально)</Label>
          <Textarea rows={6} value={customText} onChange={(e) => setCustomText(e.target.value)}
            placeholder="Хук: ...&#10;Стори: ...&#10;Оффер: ...&#10;CTA: ..." />
        </div>

        {contentType === "marketplace" && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-card/30 p-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-1">
              <Label>Название товара</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Кроссовки X100" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Описание</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Лёгкие, дышащие, для бега" />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label>Платформа</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {contentType === "ad-creative" && (
          <div className="space-y-2">
            <Label>Доп. пожелания</Label>
            <Textarea rows={3} value={extraInstructions}
              onChange={(e) => setExtraInstructions(e.target.value)}
              placeholder="Стиль, акценты, что точно нельзя..." />
          </div>
        )}

        <div className="space-y-2">
          <Label>Telegram chat_id (опционально)</Label>
          <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" />
        </div>

        <Button onClick={submit} disabled={submitting} className="w-full">
          {submitting ? "Отправляю..." : "Запустить"}
        </Button>
      </div>
    </main>
  );
};

export default FactoryBeta;
