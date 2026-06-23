import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AspectId } from "@/data/contentTypeFlows";

const ASPECT_META: Record<
  AspectId,
  { label: string; sub: string; aspectClass: string }
> = {
  "1:1":  { label: "1:1 Square",   sub: "Квадрат",         aspectClass: "aspect-square" },
  "4:5":  { label: "4:5 Post",     sub: "Портрет",         aspectClass: "aspect-[4/5]" },
  "9:16": { label: "9:16 Story",   sub: "Stories / Reels", aspectClass: "aspect-[9/16]" },
  "16:9": { label: "16:9 Wide",    sub: "YouTube",         aspectClass: "aspect-[16/9]" },
  "3:4":  { label: "3:4 Portrait", sub: "Портрет",         aspectClass: "aspect-[3/4]" },
  "21:9": { label: "21:9 Ultra",   sub: "Ultrawide",       aspectClass: "aspect-[21/9]" },
};

interface Props {
  value: AspectId;
  onChange: (id: AspectId) => void;
  allowed: AspectId[];
}

export function AspectRatioPicker({ value, onChange, allowed }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {allowed.map((id) => {
        const a = ASPECT_META[id];
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={selected}
            className={cn(
              "group relative flex flex-col items-center gap-3 rounded-2xl border p-3 text-center transition-all",
              selected
                ? "border-primary/40 bg-gradient-to-b from-primary/20 to-primary/[0.04] shadow-[0_0_20px_hsl(var(--primary)/0.15)] ring-1 ring-primary/20"
                : "border-white/5 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
            )}
          >
            <div className="flex h-16 w-full items-center justify-center">
              <div
                className={cn(
                  "relative flex items-center justify-center rounded-md border transition-colors",
                  a.aspectClass,
                  // size constraint: limit by height
                  "h-full max-h-full max-w-full",
                  selected
                    ? "border-white/25 bg-white/10"
                    : "border-white/10 bg-black/30",
                )}
                style={{ aspectRatio: id.replace(":", " / ") }}
              >
                {selected && (
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_8px_hsl(var(--primary))]">
                    <Check className="h-2.5 w-2.5" strokeWidth={4} />
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-0.5">
              <div
                className={cn(
                  "text-[10px] font-bold uppercase tracking-tighter",
                  selected ? "text-foreground" : "text-muted-foreground/60 group-hover:text-foreground/80",
                )}
              >
                {a.label}
              </div>
              <div className="text-[9px] text-muted-foreground/50">{a.sub}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
