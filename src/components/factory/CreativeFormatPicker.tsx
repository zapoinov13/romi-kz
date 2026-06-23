import { Check, Sparkles, Star, Quote, Heart, MessageCircle, Send, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AUTO_FORMAT_ID,
  CREATIVE_FORMAT_CATEGORIES,
  CREATIVE_FORMATS,
  type CreativeFormat,
  type CreativeFormatId,
} from "@/data/creativeFormats";

const MAX_STYLES = 4;

function FormatPreviewArt({ format }: { format: CreativeFormat }) {
  if (format.id === "testimonial") {
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-100 p-4 text-zinc-900">
        <Quote className="absolute left-3 top-3 h-5 w-5 text-amber-500/70" strokeWidth={2.5} />
        <div className="flex h-full flex-col justify-center gap-2 pl-7 pr-3">
          <p className="text-[11px] font-semibold leading-snug">
            «За 2 недели результат лучше, чем за полгода до этого»
          </p>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-500 text-[10px] font-bold text-white shadow">
              МК
            </div>
            <div className="leading-tight">
              <div className="text-[10px] font-semibold">Мария К.</div>
              <div className="text-[8px] text-zinc-500">клиент · 2025</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (format.id === "ugc") {
    return (
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-rose-200 via-amber-100 to-orange-200">
        {/* selfie face */}
        <div className="absolute left-1/2 top-[38%] h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-amber-200 via-rose-200 to-amber-300 shadow-lg ring-2 ring-white/40">
          <div className="absolute left-3 top-5 h-1.5 w-1.5 rounded-full bg-zinc-800" />
          <div className="absolute right-3 top-5 h-1.5 w-1.5 rounded-full bg-zinc-800" />
          <div className="absolute bottom-3 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full bg-rose-500/70" />
        </div>
        {/* IG-style overlay */}
        <div className="absolute right-2 top-2 flex flex-col items-center gap-1.5 text-white drop-shadow">
          <Heart className="h-3 w-3 fill-white" />
          <MessageCircle className="h-3 w-3" strokeWidth={2.5} />
          <Send className="h-3 w-3" strokeWidth={2.5} />
          <Bookmark className="h-3 w-3" strokeWidth={2.5} />
        </div>
        {/* caption bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-gradient-to-br from-fuchsia-500 to-amber-400 ring-1 ring-white/50" />
            <span className="text-[9px] font-semibold text-white">@anna.real</span>
          </div>
          <p className="mt-1 text-[9px] font-medium leading-tight text-white">
            честный обзор после месяца ✨
          </p>
        </div>
      </div>
    );
  }

  if (format.id === "before_after") {
    return (
      <div className="absolute inset-0 flex bg-zinc-900">
        {/* before */}
        <div className="relative flex-1 bg-gradient-to-br from-zinc-600 via-zinc-700 to-zinc-800">
          <div className="absolute left-1/2 top-[45%] h-7 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-500/60" />
          <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white/80">
            До
          </span>
          <span className="absolute bottom-1.5 left-1.5 text-[8px] font-medium text-white/50">
            день 1
          </span>
        </div>
        {/* divider */}
        <div className="relative w-px bg-white/90">
          <div className="absolute left-1/2 top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-zinc-900 text-[10px] font-bold text-white">
            →
          </div>
        </div>
        {/* after */}
        <div className="relative flex-1 bg-gradient-to-br from-emerald-300 via-emerald-400 to-cyan-300">
          <div className="absolute left-1/2 top-[45%] h-8 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-lg" />
          <span className="absolute right-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-700">
            После
          </span>
          <span className="absolute bottom-1.5 right-1.5 text-[8px] font-bold text-emerald-900">
            день 30 ✨
          </span>
        </div>
      </div>
    );
  }

  if (format.id === "product_focus") {
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-stone-100 via-amber-50 to-orange-100">
        {/* surface */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-amber-200/50" />
        {/* spotlight */}
        <div className="absolute left-1/2 top-[45%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 blur-2xl" />
        {/* leaves */}
        <div className="absolute right-3 top-3 h-3 w-6 rotate-45 rounded-full bg-emerald-500/70" />
        <div className="absolute right-5 top-5 h-2 w-5 rotate-12 rounded-full bg-emerald-600/60" />
        {/* product bottle */}
        <div className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2">
          <div className="mx-auto h-2 w-3.5 rounded-t-sm bg-zinc-800" />
          <div className="relative h-16 w-10 rounded-lg bg-gradient-to-b from-zinc-700 via-zinc-800 to-black shadow-2xl">
            <div className="mx-auto mt-3 flex h-7 w-8 flex-col items-center justify-center rounded-sm bg-gradient-to-b from-amber-300 to-amber-500 text-[7px] font-black uppercase tracking-wider text-zinc-900">
              Brand
              <div className="mt-0.5 h-px w-4 bg-zinc-900/60" />
              <span className="text-[5px] font-bold">50 мл</span>
            </div>
          </div>
          <div className="mx-auto -mt-1 h-1.5 w-14 rounded-full bg-black/25 blur-md" />
        </div>
      </div>
    );
  }

  if (format.id === "bold_offer") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-600 p-3 text-white">
        <div className="rounded-full bg-white/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] backdrop-blur">
          Чёрная пятница
        </div>
        <div className="text-[44px] font-black leading-none tracking-tighter drop-shadow">
          −50%
        </div>
        <div className="text-[9px] font-bold uppercase tracking-widest opacity-95">
          на всё · до 23:59
        </div>
        <div className="mt-1 rounded-md bg-white px-2 py-1 text-[8px] font-black uppercase text-rose-600 shadow">
          Купить сейчас →
        </div>
      </div>
    );
  }

  if (format.id === "expert") {
    return (
      <div className="absolute inset-0 bg-gradient-to-b from-slate-600 via-slate-800 to-slate-950">
        {/* studio backdrop blur */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-radial from-amber-200/20 via-transparent to-transparent" />
        {/* portrait — head + shoulders */}
        <div className="absolute left-1/2 top-2 -translate-x-1/2">
          <div className="relative mx-auto h-9 w-9 overflow-hidden rounded-full bg-gradient-to-b from-amber-200 to-rose-200 ring-2 ring-white/30">
            <div className="absolute left-1/2 top-3 h-1 w-1 -translate-x-1/2 rounded-full bg-zinc-800" />
            <div className="absolute left-2 top-4 h-0.5 w-0.5 rounded-full bg-zinc-800" />
            <div className="absolute right-2 top-4 h-0.5 w-0.5 rounded-full bg-zinc-800" />
          </div>
          <div className="mx-auto -mt-1 h-6 w-14 rounded-t-3xl bg-gradient-to-b from-slate-700 to-slate-800" />
        </div>
        {/* REC */}
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[8px] font-bold text-white backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> REC
        </div>
        {/* lower-third */}
        <div className="absolute bottom-2 left-2 right-2 rounded-md border-l-2 border-emerald-400 bg-black/70 p-1.5 backdrop-blur-sm">
          <div className="text-[9px] font-bold leading-tight text-white">
            Алексей Орлов
          </div>
          <div className="text-[7px] font-medium text-emerald-300">
            маркетолог · 12 лет
          </div>
        </div>
      </div>
    );
  }

  // auto: mini collage of style chips
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-violet-700 via-fuchsia-600 to-cyan-500 p-2">
      <div className="grid h-full grid-cols-2 grid-rows-2 gap-1.5">
        {/* testimonial mini */}
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-amber-100 to-rose-100 p-1.5">
          <Quote className="h-2.5 w-2.5 text-amber-600" strokeWidth={3} />
          <div className="mt-0.5 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-1.5 w-1.5 fill-amber-500 text-amber-500" />
            ))}
          </div>
        </div>
        {/* offer mini */}
        <div className="flex items-center justify-center rounded-md bg-gradient-to-br from-rose-500 to-pink-600 text-base font-black tracking-tighter text-white">
          −50%
        </div>
        {/* product mini */}
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-stone-200 to-amber-100">
          <div className="absolute left-1/2 top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded bg-zinc-800 shadow" />
        </div>
        {/* before/after mini */}
        <div className="flex overflow-hidden rounded-md">
          <div className="flex-1 bg-zinc-700" />
          <div className="w-px bg-white" />
          <div className="flex-1 bg-gradient-to-br from-emerald-300 to-cyan-300" />
        </div>
      </div>
      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-white/95 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-violet-700 shadow">
        <Sparkles className="h-2 w-2" /> AI
      </div>
    </div>
  );
}

interface CreativeFormatPickerProps {
  selected: CreativeFormatId[];
  onToggle: (id: CreativeFormatId) => void;
}

export function CreativeFormatPicker({ selected, onToggle }: CreativeFormatPickerProps) {
  const selectedFormats = selected
    .map((id) => CREATIVE_FORMATS.find((f) => f.id === id))
    .filter((f): f is CreativeFormat => Boolean(f));

  return (
    <div className="space-y-6">
      {CREATIVE_FORMAT_CATEGORIES.map((cat) => {
        const formats = CREATIVE_FORMATS.filter((f) => f.category === cat.id);
        if (!formats.length) return null;

        return (
          <div key={cat.id}>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {cat.label}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-border via-border/40 to-transparent" />
            </div>

            <div
              className={cn(
                "grid gap-3",
                cat.id === "recommended"
                  ? "grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
              )}
            >
              {formats.map((format) => {
                const Icon = format.icon;
                const isSelected = selected.includes(format.id);
                const order = isSelected ? selected.indexOf(format.id) + 1 : null;
                const isAuto = format.id === AUTO_FORMAT_ID;

                return (
                  <button
                    key={format.id}
                    type="button"
                    onClick={() => onToggle(format.id)}
                    aria-pressed={isSelected}
                    aria-label={`${format.label}: ${format.subtitle}`}
                    className={cn(
                      "group relative flex w-full flex-col overflow-hidden rounded-2xl border text-left transition-all duration-200",
                      isSelected
                        ? "border-primary/50 bg-white/[0.05] shadow-[0_0_25px_hsl(var(--primary)/0.15)] ring-1 ring-primary/30"
                        : "border-white/8 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                      isAuto && !isSelected && "border-dashed border-primary/30 bg-primary/[0.04]",
                    )}
                  >
                    <div
                      className={cn(
                        "relative overflow-hidden bg-black/40",
                        cat.id === "recommended" ? "aspect-[16/10]" : "aspect-square",
                      )}
                    >
                      <FormatPreviewArt format={format} />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />

                      <span
                        className={cn(
                          "absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] backdrop-blur-sm",
                          isSelected ? "bg-primary text-primary-foreground" : "bg-black/40 text-white/90",
                        )}
                      >
                        {format.tag}
                      </span>

                      {isSelected && order !== null && (
                        <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {order}
                        </span>
                      )}

                      {!isSelected && (
                        <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border border-white/40 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                          <Check className="h-3 w-3 text-white/80" />
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors",
                            isSelected ? "bg-primary text-primary-foreground" : "bg-secondary/70 text-muted-foreground group-hover:text-foreground",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold leading-tight text-foreground">
                            {format.label}
                          </div>
                          <div className="text-[11px] leading-snug text-muted-foreground line-clamp-1">
                            {format.subtitle}
                          </div>
                        </div>
                      </div>
                      {cat.id === "recommended" && (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/90">
                          {format.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {selectedFormats.length > 0 && (
        <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="grid h-1.5 w-1.5 place-items-center rounded-full bg-primary" />
            Что сгенерируем
          </div>
          <ul className="space-y-2">
            {selectedFormats.map((f, i) => (
              <li key={f.id} className="flex gap-2 text-sm">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {i + 1}
                </span>
                <div>
                  <span className="font-medium text-foreground">{f.label}</span>
                  <span className="text-muted-foreground"> — {f.outputHint}</span>
                </div>
              </li>
            ))}
          </ul>
          {selected.includes(AUTO_FORMAT_ID) && selected.length === 1 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Режим «Авто» эксклюзивный — для сравнения форматов выберите до {MAX_STYLES} конкретных
              вариантов без Авто.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
