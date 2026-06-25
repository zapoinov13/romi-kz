import { useState } from "react";
import { MessageSquare, Plus, Copy, Pencil, Trash2, Check, AlertCircle, Loader2, Cloud, X, Download } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  useCabinetMessageTemplates,
  type CabinetMessageTemplate,
  type IceBreaker,
  type TemplateInput,
} from "@/hooks/useCabinetMessageTemplates";

interface Props {
  cabinetId: string;
  projectId: string;
  pageId?: string;
  selectedTemplateId?: string | null;
  onSelectedTemplateChange?: (id: string | null) => void;
}

export default function MessageTemplatesPanel({
  cabinetId,
  projectId,
  pageId,
  selectedTemplateId,
  onSelectedTemplateChange,
}: Props) {
  const { rows, loading, create, update, duplicate, remove, syncToMeta, importFromMeta } =
    useCabinetMessageTemplates(cabinetId, projectId);

  const [editing, setEditing] = useState<CabinetMessageTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleImport() {
    if (!pageId) {
      toast.error("У кабинета не указана Facebook-страница");
      return;
    }
    setImporting(true);
    try {
      const res = await importFromMeta();
      if (res?.imported && res.imported > 0) {
        toast.success("Шаблоны из Meta загружены");
      } else {
        toast.info(res?.message || "В Meta пока нет шаблонов на этой странице");
      }
    } catch (e) {
      toast.error((e as Error).message || "Не удалось импортировать");
    } finally {
      setImporting(false);
    }
  }

  async function handleSync(id: string) {
    if (!pageId) {
      toast.error("У кабинета не указана Facebook-страница");
      return;
    }
    setSyncingId(id);
    try {
      await syncToMeta(id);
      toast.success("Шаблон применён в Meta (Messenger Ice Breakers)");
    } catch (e) {
      toast.error((e as Error).message || "Не удалось применить");
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Переписки (шаблоны)
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setCreating(true)}
          className="h-7 gap-1 rounded-lg px-2 text-[11px]"
        >
          <Plus className="h-3.5 w-3.5" />
          Новый
        </Button>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Шаблон приветствия и быстрых ответов, который видит клиент после клика по объявлению.
        В Meta активен только один шаблон на страницу за раз.
      </p>

      {loading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground">
          Загрузка...
        </div>
      )}

      {!loading && rows.length === 0 && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 p-4 text-[12px] text-muted-foreground hover:border-primary/60 hover:bg-primary/5 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Создать первый шаблон переписки
        </button>
      )}

      <div className="space-y-2">
        {rows.map((t) => {
          const active = selectedTemplateId === t.id;
          const syncing = syncingId === t.id;
          return (
            <div
              key={t.id}
              className={cn(
                "rounded-xl border bg-background/60 p-3 transition",
                active ? "border-primary/60 ring-1 ring-primary/30" : "border-border/60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectedTemplateChange?.(active ? null : t.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <div
                    className={cn(
                      "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold">{t.name}</span>
                      {t.is_default && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                          по умолчанию
                        </span>
                      )}
                      {t.meta_sync_status === "synced" && (
                        <span className="flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-success">
                          <Cloud className="h-2.5 w-2.5" /> в Meta
                        </span>
                      )}
                      {t.meta_sync_status === "error" && (
                        <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-destructive">
                          <AlertCircle className="h-2.5 w-2.5" /> ошибка
                        </span>
                      )}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {t.greeting || <span className="italic">Без приветствия</span>}
                    </div>
                    {t.ice_breakers.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {t.ice_breakers.slice(0, 4).map((ib, i) => (
                          <span
                            key={i}
                            className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {ib.question || "—"}
                          </span>
                        ))}
                        {t.ice_breakers.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{t.ice_breakers.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    {t.cta_label && (
                      <div className="mt-1.5 text-[10px] text-primary">
                        Кнопка: {t.cta_label}
                      </div>
                    )}
                    {t.meta_sync_status === "error" && t.meta_last_error && (
                      <div className="mt-1 truncate text-[10px] text-destructive" title={t.meta_last_error}>
                        {t.meta_last_error}
                      </div>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(t)}
                    className="h-7 w-7 p-0"
                    title="Редактировать"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await duplicate(t.id);
                        toast.success("Шаблон продублирован");
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                    className="h-7 w-7 p-0"
                    title="Дублировать"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`Удалить шаблон "${t.name}"?`)) return;
                      try {
                        await remove(t.id);
                        toast.success("Удалено");
                        if (selectedTemplateId === t.id) onSelectedTemplateChange?.(null);
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    title="Удалить"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={syncing || !pageId}
                  onClick={() => handleSync(t.id)}
                  className="h-7 gap-1.5 rounded-lg px-2 text-[11px]"
                  title={pageId ? "Применить как Ice Breakers на странице" : "Не указана FB-страница в кабинете"}
                >
                  {syncing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Cloud className="h-3 w-3" />
                  )}
                  Активировать в Meta
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {(creating || editing) && (
        <TemplateEditDialog
          open
          template={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSubmit={async (input) => {
            try {
              if (editing) {
                await update(editing.id, input);
                toast.success("Шаблон обновлён");
              } else {
                await create(input);
                toast.success("Шаблон создан");
              }
              setCreating(false);
              setEditing(null);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

function TemplateEditDialog({
  open,
  template,
  onClose,
  onSubmit,
}: {
  open: boolean;
  template: CabinetMessageTemplate | null;
  onClose: () => void;
  onSubmit: (input: TemplateInput) => Promise<void>;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [greeting, setGreeting] = useState(template?.greeting ?? "");
  const [ctaLabel, setCtaLabel] = useState(template?.cta_label ?? "");
  const [ctaPayload, setCtaPayload] = useState(template?.cta_payload ?? "");
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false);
  const [iceBreakers, setIceBreakers] = useState<IceBreaker[]>(
    template?.ice_breakers?.length
      ? template.ice_breakers
      : [{ question: "", answer: "" }],
  );
  const [saving, setSaving] = useState(false);

  function updateIB(i: number, patch: Partial<IceBreaker>) {
    setIceBreakers((arr) => arr.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function addIB() {
    if (iceBreakers.length >= 6) return;
    setIceBreakers((arr) => [...arr, { question: "", answer: "" }]);
  }
  function removeIB(i: number) {
    setIceBreakers((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Укажите название шаблона"); return; }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim().slice(0, 80),
        greeting: greeting.trim().slice(0, 600),
        ice_breakers: iceBreakers
          .map((ib) => ({
            question: ib.question.trim().slice(0, 80),
            answer: ib.answer.trim().slice(0, 600),
          }))
          .filter((ib) => ib.question || ib.answer),
        cta_label: ctaLabel.trim().slice(0, 30) || null,
        cta_payload: ctaPayload.trim().slice(0, 200) || null,
        is_default: isDefault,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? "Редактировать шаблон" : "Новый шаблон переписки"}
          </DialogTitle>
          <DialogDescription>
            Что увидит клиент после клика по рекламе и нажатия "Написать".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Название (видно только вам)
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Запись на консультацию"
              maxLength={80}
              className="h-10 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Приветственное сообщение
            </Label>
            <Textarea
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Здравствуйте! Чем мы можем вам помочь?"
              maxLength={600}
              rows={3}
              className="resize-none rounded-xl"
            />
            <div className="text-right text-[10px] text-muted-foreground">
              {greeting.length}/600
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Заранее подготовленные вопросы
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={addIB}
                disabled={iceBreakers.length >= 6}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <Plus className="h-3.5 w-3.5" /> Добавить
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Видит клиент как быстрые кнопки. До 6 штук. На каждый вопрос - заготовленный автоответ.
            </p>
            <div className="space-y-2">
              {iceBreakers.map((ib, i) => (
                <div key={i} className="space-y-1.5 rounded-xl border border-border/60 bg-background/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground">№{i + 1}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeIB(i)}
                      className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={ib.question}
                    onChange={(e) => updateIB(i, { question: e.target.value })}
                    placeholder="Вопрос (кнопка)"
                    maxLength={80}
                    className="h-9 rounded-lg text-[12px]"
                  />
                  <Textarea
                    value={ib.answer}
                    onChange={(e) => updateIB(i, { answer: e.target.value })}
                    placeholder="Автоответ"
                    maxLength={600}
                    rows={2}
                    className="resize-none rounded-lg text-[12px]"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 bg-background/40 p-3">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Призыв к действию (необязательно)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Текст кнопки"
                maxLength={30}
                className="h-9 rounded-lg text-[12px]"
              />
              <Input
                value={ctaPayload}
                onChange={(e) => setCtaPayload(e.target.value)}
                placeholder="URL или payload"
                maxLength={200}
                className="h-9 rounded-lg text-[12px]"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[12px]">
            <Checkbox
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v === true)}
            />
            <span>Использовать этот шаблон по умолчанию для нового запуска</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение..." : template ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
