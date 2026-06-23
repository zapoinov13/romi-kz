import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ContentAccent, ContentType } from "@/data/contentTypes";

interface ContentTypeCardProps {
  type: ContentType;
  selected: boolean;
  onSelect: (id: string) => void;
}

const ACCENT: Record<
  ContentAccent,
  { iconBg: string; iconBorder: string; iconText: string; ring: string }
> = {
  blue: {
    iconBg: "bg-[hsl(212_90%_60%/0.10)]",
    iconBorder: "border-[hsl(212_90%_60%/0.25)]",
    iconText: "text-[hsl(212_90%_70%)]",
    ring: "hsl(212 90% 60% / 0.45)",
  },
  purple: {
    iconBg: "bg-[hsl(270_80%_65%/0.10)]",
    iconBorder: "border-[hsl(270_80%_65%/0.25)]",
    iconText: "text-[hsl(270_85%_75%)]",
    ring: "hsl(270 80% 65% / 0.45)",
  },
  pink: {
    iconBg: "bg-[hsl(330_85%_65%/0.10)]",
    iconBorder: "border-[hsl(330_85%_65%/0.25)]",
    iconText: "text-[hsl(330_90%_75%)]",
    ring: "hsl(330 85% 65% / 0.45)",
  },
  orange: {
    iconBg: "bg-[hsl(24_95%_58%/0.10)]",
    iconBorder: "border-[hsl(24_95%_58%/0.25)]",
    iconText: "text-[hsl(24_95%_65%)]",
    ring: "hsl(24 95% 58% / 0.45)",
  },
  emerald: {
    iconBg: "bg-[hsl(152_75%_48%/0.10)]",
    iconBorder: "border-[hsl(152_75%_48%/0.25)]",
    iconText: "text-[hsl(152_75%_60%)]",
    ring: "hsl(152 75% 48% / 0.45)",
  },
};

const BADGE_TONE = {
  hot: "border-warning/30 bg-warning/10 text-warning",
  new: "border-primary/30 bg-primary/10 text-primary",
  soon: "border-muted/50 bg-muted/30 text-muted-foreground",
} as const;

const ContentTypeCard = ({ type, selected, onSelect }: ContentTypeCardProps) => {
  const Icon = type.icon;
  const accent = ACCENT[type.accent] ?? ACCENT.blue;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(type.id)}
          aria-pressed={selected}
          aria-label={`${type.title} — ${type.subtitle}`}
          style={
            selected
              ? { boxShadow: `0 0 0 1px ${accent.ring}, 0 24px 60px -25px ${accent.ring}` }
              : undefined
          }
          className={cn(
            "group relative flex h-full min-h-[230px] flex-col overflow-hidden rounded-2xl p-6 text-left isolate cursor-pointer",
            "border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent backdrop-blur-sm",
            "transition-all duration-300 ease-out",
            "hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_0_30px_-10px_hsl(var(--primary)/0.25)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected && "border-transparent",
          )}
        >
          {/* Hover arrow corner */}
          <div className="pointer-events-none absolute right-3 top-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
            </span>
          </div>

          {/* Top: icon + badge */}
          <div className="relative z-10 mb-7 flex items-start justify-between">
            <div
              className={cn(
                "grid h-12 w-12 place-items-center rounded-xl border transition-transform duration-500 group-hover:scale-110",
                accent.iconBg,
                accent.iconBorder,
              )}
            >
              <Icon className={cn("h-6 w-6", accent.iconText)} strokeWidth={1.75} />
            </div>
            {type.badge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  BADGE_TONE[type.badge.tone],
                )}
              >
                {type.badge.tone === "hot" && (
                  <span className="h-1 w-1 rounded-full bg-warning animate-pulse" />
                )}
                {type.badge.label}
              </span>
            )}
          </div>

          {/* Text */}
          <div className="relative z-10">
            <h3
              className={cn(
                "text-lg font-semibold tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary",
                selected && "text-primary",
              )}
            >
              {type.title}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {type.subtitle}
            </p>
          </div>

          {/* Footer: metric */}
          <div className="relative z-10 mt-auto flex items-center justify-between border-t border-white/[0.06] pt-4">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/80">
              {type.metric.label}
            </span>
            <span
              className={cn(
                "text-xs font-semibold",
                type.metric.positive ? "text-primary" : "text-foreground/80",
              )}
            >
              {type.metric.value}
            </span>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] text-xs">
        {type.tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

export default ContentTypeCard;
