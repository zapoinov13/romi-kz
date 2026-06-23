import { useState } from "react";
import { BookOpen, Loader2, Palette, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBrandTemplates } from "@/hooks/useBrandTemplates";
import { BrandTemplateDialog } from "@/components/factory/BrandTemplateDialog";
import { Button } from "@/components/ui/button";

export function BrandTemplatePanel() {
  const { templates, loading, createTemplate, deleteTemplate, projectId } = useBrandTemplates();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreateClick = () => {
    if (!projectId) {
      toast.error("Сначала выберите проект в переключателе вверху сайдбара");
      return;
    }
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Шаблоны бренда</h2>
          <p className="text-xs text-muted-foreground">
            Загрузите логотип, шрифты, брендбук и референсы — AI будет создавать дизайн в вашем стиле.
          </p>
        </div>
        <Button onClick={handleCreateClick} className="gap-2">
          <Plus className="h-4 w-4" />
          Создать свой шаблон
        </Button>
      </div>

      {!projectId && (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[80px]" />
          <div className="relative mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Palette className="h-6 w-6" />
          </div>
          <h3 className="relative text-base font-semibold">Выберите проект</h3>
          <p className="relative mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Шаблоны бренда привязаны к проекту. Выберите проект в переключателе вверху сайдбара — и сможете создать шаблон с логотипом, шрифтами, брендбуком и референсами.
          </p>
        </div>
      )}

      {projectId && (loading ? (
        <div className="grid h-32 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
          <p className="text-sm font-medium">Нет шаблонов</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Загрузите брендбук, логотип, референсы и шрифты — AI будет генерировать в вашем стиле.
          </p>
          <Button className="mt-4 gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Добавить брендбук
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <article key={t.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                {t.logo_url ? (
                  <img src={t.logo_url} alt="" className="h-12 w-12 rounded-lg border object-contain bg-white p-1" />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Palette className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold">{t.name}</h3>
                    {t.is_default && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        По умолчанию
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[t.colors?.primary, t.colors?.secondary, t.colors?.accent]
                      .filter(Boolean)
                      .map((c, i) => (
                        <span
                          key={i}
                          className="h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    <span className="text-[10px] text-muted-foreground">
                      · реф. {t.reference_urls.length} · брендбук {t.brandbook_urls.length}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    try {
                      await deleteTemplate(t.id);
                      toast.success("Шаблон удалён");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Ошибка");
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      ))}

      <BrandTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={async (input) => {
          const created = await createTemplate(input);
          if (!created) throw new Error("Не удалось создать шаблон");
        }}
      />
    </div>
  );
}
