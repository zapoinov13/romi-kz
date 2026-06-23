import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (n: number) => void;
  counts: number[];
  unitLabel?: string;
  bestCount?: number;
}

export function VariantCountPicker({
  value,
  onChange,
  counts,
  unitLabel = "вариантов",
  bestCount,
}: Props) {
  const best = bestCount ?? counts[Math.min(1, counts.length - 1)];
  return (
    <div className="grid grid-cols-4 gap-3">
      {counts.map((n) => {
        const selected = value === n;
        const isBest = n === best;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={selected}
            className={cn(
              "relative flex h-16 items-center justify-center rounded-2xl border transition-all",
              selected
                ? "border-primary/50 bg-primary/10 shadow-[0_0_15px_hsl(var(--primary)/0.12)]"
                : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]",
            )}
          >
            <span
              className={cn(
                "text-xl font-bold",
                selected ? "text-primary text-2xl font-extrabold" : "text-muted-foreground",
              )}
            >
              {n}
            </span>
            {isBest && (
              <span className="absolute -right-1.5 -top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tighter text-primary-foreground">
                Best
              </span>
            )}
            <span className="sr-only">
              {n === 1 ? `1 ${unitLabel.replace(/ов$/, "")}` : `${n} ${unitLabel}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
