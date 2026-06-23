import { FileText, Sparkles, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CopyMode } from "@/lib/contentFactoryCopy";

interface Props {
  mode: CopyMode;
  onModeChange: (mode: CopyMode) => void;
  overlayText: string;
  onOverlayTextChange: (text: string) => void;
  extraHints: string;
  onExtraHintsChange: (text: string) => void;
}

const OPTIONS: {
  id: CopyMode;
  title: string;
  subtitle: string;
  icon: typeof Sparkles;
}[] = [
  {
    id: "auto",
    title: "Быстро",
    subtitle: "AI сам напишет сценарий",
    icon: Sparkles,
  },
  {
    id: "custom",
    title: "Вставить свой текст",
    subtitle: "Точный текст на фото",
    icon: Type,
  },
];

export function CopyModePanel({
  mode,
  onModeChange,
  overlayText,
  onOverlayTextChange,
  extraHints,
  onExtraHintsChange,
}: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur-sm sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-3 left-0 w-[2px] rounded-full bg-gradient-to-b from-primary/0 via-primary/40 to-primary/0 opacity-60"
      />
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/[0.08] text-primary">
          <FileText className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
            Текст на креативе
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Кто пишет надпись на картинке — AI или вы
          </p>
        </div>
      </div>

      {/* Сегментированный переключатель — без «двух зелёных кнопок-баннеров». */}
      <div className="mt-4 inline-flex w-full rounded-xl border border-border/70 bg-secondary/40 p-1">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onModeChange(opt.id)}
              aria-pressed={selected}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                selected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              <span>{opt.title}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {mode === "auto"
          ? "AI сам подберёт заголовок, оверлей и CTA под ТЗ."
          : "Текст ниже будет нанесён на креатив дословно, без переписывания."}
      </p>

      {mode === "custom" ? (
        <div className="mt-4">
          <label htmlFor="overlay-text" className="text-[13px] font-medium text-foreground">
            Ваш текст для наложения на фото *
          </label>
          <textarea
            id="overlay-text"
            value={overlayText}
            onChange={(e) => onOverlayTextChange(e.target.value)}
            placeholder="Например: Скидка 30% только до пятницы! Запишитесь на бесплатную консультацию"
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/60 focus:bg-background/80"
          />
        </div>
      ) : (
        <div className="mt-4">
          <label htmlFor="copy-hints" className="text-[13px] font-medium text-foreground">
            Пожелания для AI (необязательно)
          </label>
          <textarea
            id="copy-hints"
            value={extraHints}
            onChange={(e) => onExtraHintsChange(e.target.value)}
            placeholder="Акцент на преимуществах, яркие цвета, строгий стиль..."
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/60 focus:bg-background/80"
          />
        </div>
      )}
    </div>
  );
}
