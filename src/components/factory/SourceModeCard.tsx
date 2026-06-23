import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceModeCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}

const SourceModeCard = ({
  icon: Icon,
  title,
  subtitle,
  selected,
  onClick,
}: SourceModeCardProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-primary/40 bg-gradient-to-br from-primary/20 via-primary/8 to-transparent shadow-[0_0_20px_hsl(var(--primary)/0.15)] ring-1 ring-primary/20"
          : "border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]",
      )}
    >
      <span
        className={cn(
          "relative grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-all",
          selected
            ? "bg-primary text-primary-foreground shadow-[0_4px_12px_hsl(var(--primary)/0.35)]"
            : "bg-white/[0.06] text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <h3
          className={cn(
            "text-sm font-bold leading-tight tracking-tight",
            selected ? "text-foreground" : "text-foreground/90",
          )}
        >
          {title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/70">
          {subtitle}
        </p>
      </div>
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all",
          selected
            ? "border-primary bg-primary text-primary-foreground shadow-[0_0_8px_hsl(var(--primary))]"
            : "border-white/15 bg-transparent text-transparent",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={4} />
      </span>
    </button>
  );
};

export default SourceModeCard;