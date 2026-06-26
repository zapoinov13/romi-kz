import { CheckCircle2, Clock, Target, Megaphone, BarChart3, Sparkles } from "lucide-react";
import { RomiLogo } from "@/components/brand/RomiLogo";

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
    <div className="relative hidden h-full overflow-hidden bg-gradient-to-br from-[#1877F2] via-[#166FE5] to-[#0D65D9] lg:flex lg:flex-col">
      <div className="pointer-events-none absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-white/5 blur-3xl" />

      <header className="relative z-10 px-10 pt-8">
        <RomiLogo size="lg" />
      </header>

      <div className="relative z-10 flex flex-1 flex-col justify-center px-10 xl:px-16">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white">
          <Sparkles className="h-3.5 w-3.5" />
          Внутренняя платформа агентства
        </div>

        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white xl:text-[46px]">
          Управляйте рекламой клиентов{" "}
          <span className="text-white/90">в одном окне</span>
        </h1>

        <p className="mt-5 max-w-md text-sm leading-relaxed text-white/85 xl:text-base">
          ROMI — платформа маркетингового агентства romi.kz. Все рекламные кабинеты Meta,
          кампании и метрики команды собраны в одном удобном интерфейсе.
        </p>

        <div className="mt-8 space-y-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group flex items-start gap-3 rounded-lg border border-white/20 bg-white/10 p-3.5 backdrop-blur-sm transition-colors hover:border-white/35 hover:bg-white/15"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/20 text-white ring-1 ring-white/25 transition-transform group-hover:scale-105">
                <f.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{f.title}</div>
                <div className="text-xs text-white/75">{f.desc}</div>
              </div>
              <CheckCircle2 className="ml-auto mt-1 h-4 w-4 text-white/70" />
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-white/20 bg-white/10 p-4 text-center backdrop-blur-sm"
            >
              <div className="text-2xl font-extrabold text-white">{s.value}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wider text-white/70">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-2 px-10 pb-7 text-xs text-white/70 xl:px-16">
        <Clock className="h-3.5 w-3.5" />
        romi.kz <span className="opacity-50">|</span> Внутренний доступ команды
      </div>
    </div>
  );
}
