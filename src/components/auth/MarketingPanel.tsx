import { CheckCircle2, Clock, Target, Megaphone, BarChart3, Sparkles } from "lucide-react";
import romiLogo from "@/assets/romi-logo.png.asset.json";

const features = [
  {
    icon: Target,
    title: "Кабинеты Meta в одном окне",
    desc: "Все подключённые рекламные кабинеты команды на одном экране",
  },
  {
    icon: Megaphone,
    title: "Запуск кампаний",
    desc: "Создавайте и управляйте кампаниями без перехода в Ads Manager",
  },
  {
    icon: BarChart3,
    title: "Метрики команды",
    desc: "Расход, лиды и продажи по каждому кабинету в реальном времени",
  },
];

const stats = [
  { value: "1", label: "клик до кабинета" },
  { value: "24/7", label: "контроль кампаний" },
  { value: "100%", label: "под romi.kz" },
];

export function MarketingPanel() {
  return (
    <div className="relative hidden h-full overflow-hidden bg-gradient-to-br from-[hsl(0_0%_10%)] via-[hsl(0_0%_8%)] to-[hsl(0_0%_6%)] lg:flex lg:flex-col">
      {/* ambient glows */}
      <div className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
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
      <header className="relative z-10 flex items-center gap-3 px-10 pt-8 text-sm">
        <img
          src={romiLogo.url}
          alt="ROMI"
          className="h-10 w-10 rounded-full object-cover ring-1 ring-primary/40"
        />
        <div className="leading-tight">
          <div className="text-base font-extrabold tracking-tight text-primary">ROMI</div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            marketing agency
          </div>
        </div>
      </header>

      {/* content */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-10 xl:px-16">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Внутренняя платформа агентства
        </div>

        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground xl:text-[46px]">
          Управляйте рекламой клиентов{" "}
          <span className="text-gradient">в одном окне</span>
        </h1>

        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground xl:text-base">
          ROMI - платформа маркетингового агентства romi.kz. Все рекламные кабинеты Meta,
          кампании и метрики команды собраны в одном удобном интерфейсе.
        </p>

        {/* features */}
        <div className="mt-8 space-y-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group flex items-start gap-3 rounded-xl border border-border/40 bg-card/30 p-3.5 backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-card/50"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30 transition-transform group-hover:scale-105">
                <f.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
              <CheckCircle2 className="ml-auto mt-1 h-4 w-4 text-primary/70" />
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
        romi.kz <span className="opacity-50">|</span> Внутренний доступ команды
      </div>
    </div>
  );
}

