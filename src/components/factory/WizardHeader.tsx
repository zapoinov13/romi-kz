import { cn } from "@/lib/utils";

interface WizardHeaderProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  eyebrow?: React.ReactNode;
  stepLabels?: string[];
}

const DEFAULT_LABELS = ["Источник", "Параметры", "Стиль и запуск"];

const WizardHeader = ({
  step,
  totalSteps,
  title,
  subtitle,
  eyebrow,
  stepLabels,
}: WizardHeaderProps) => {
  const labels = stepLabels ?? DEFAULT_LABELS;
  const items = Array.from({ length: totalSteps }, (_, i) => ({
    n: i + 1,
    label: labels[i] ?? `Шаг ${i + 1}`,
  }));
  const progress = Math.max(0, Math.min(100, ((step - 0.5) / totalSteps) * 100));

  return (
    <div className="animate-fade-in-up relative space-y-2 pb-1">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="min-w-0 flex-1 space-y-1">
          {eyebrow && (
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              {eyebrow}
            </div>
          )}
          <h1 className="text-xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-[24px]">
            {title}
          </h1>
          {subtitle && (
            <p className="max-w-xl text-xs leading-snug text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-6 text-[10px] font-semibold uppercase tracking-[0.18em] md:flex">
          {items.map((it) => {
            const isDone = it.n < step;
            const isActive = it.n === step;
            return (
              <span
                key={it.n}
                className={cn(
                  "transition-colors",
                  isActive && "border-b-2 border-primary pb-1 text-primary",
                  isDone && !isActive && "text-primary/60",
                  !isActive && !isDone && "text-muted-foreground/40",
                )}
              >
                {it.label}
              </span>
            );
          })}
        </div>
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/80 to-primary shadow-[0_0_15px_hsl(var(--primary)/0.45)] transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Mobile step labels */}
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest md:hidden">
        {items.map((it) => {
          const isActive = it.n === step;
          const isDone = it.n < step;
          return (
            <span
              key={it.n}
              className={cn(
                isActive && "text-primary",
                isDone && !isActive && "text-primary/50",
                !isActive && !isDone && "text-muted-foreground/40",
              )}
            >
              {it.label}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default WizardHeader;