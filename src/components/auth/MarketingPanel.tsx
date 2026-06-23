import { CheckCircle2, Clock, Zap, Target, Wand2, BarChart3, Sparkles } from "lucide-react";

const features = [
  {
    icon: Target,
    title: "Управление рекламой",
    desc: "Кампании Meta и каналы в едином окне",
  },
  {
    icon: Wand2,
    title: "Контент-завод",
    desc: "Креативы, тексты и видео на AI за минуты",
  },
  {
    icon: BarChart3,
    title: "Сквозная аналитика",
    desc: "Показатели и отчёты без ручной сборки",
  },
];

const stats = [
  { value: "3×", label: "быстрее запуск" },
  { value: "–40%", label: "стоимость лида" },
  { value: "24/7", label: "AI-ассистент" },
];

export function MarketingPanel() {
  return (
    <div className="relative hidden h-full overflow-hidden bg-gradient-to-br from-[hsl(220_60%_12%)] via-[hsl(220_55%_10%)] to-[hsl(220_65%_8%)] lg:flex lg:flex-col">
      {/* ambient glows */}
      <div className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-success/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
      {/* grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* nav */}
      <header className="relative z-10 flex items-center gap-8 px-10 pt-8 text-sm">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-success/20 text-success ring-1 ring-success/40">
            <Zap className="h-4 w-4" />
          </span>
          MarkVision
        </div>
        <nav className="flex gap-6 text-muted-foreground">
          <a className="hover:text-foreground" href="#about">О проекте</a>
          <a className="hover:text-foreground" href="#features">Возможности</a>
        </nav>
      </header>

      {/* content */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-10 xl:px-16">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-success/40 bg-success/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-success">
          <Sparkles className="h-3.5 w-3.5" />
          Всё в одном месте
        </div>

        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground xl:text-[46px]">
          Управляйте рекламой и создавайте{" "}
          <span className="text-gradient">контент в одном месте</span>
        </h1>

        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground xl:text-base">
          MarkVision объединяет рекламу, генерацию креативов и аналитику —
          чтобы маркетинг работал быстрее, а решения принимались на основе данных.
        </p>

        {/* features */}
        <div className="mt-8 space-y-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group flex items-start gap-3 rounded-xl border border-border/40 bg-card/30 p-3.5 backdrop-blur-sm transition-colors hover:border-success/40 hover:bg-card/50"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success/15 text-success ring-1 ring-success/30 transition-transform group-hover:scale-105">
                <f.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
              <CheckCircle2 className="ml-auto mt-1 h-4 w-4 text-success/70" />
            </div>
          ))}
        </div>

        {/* stats */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border/40 bg-card/30 p-4 text-center backdrop-blur-sm"
            >
              <div className="text-2xl font-extrabold text-foreground">{s.value}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-2 px-10 pb-7 text-xs text-muted-foreground xl:px-16">
        <Clock className="h-3.5 w-3.5" />
        Обычно занимает 20 минут <span className="opacity-50">|</span> Без обязательств
      </div>
    </div>
  );
}
