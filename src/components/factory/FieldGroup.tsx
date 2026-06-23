import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldGroupProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: "panel" | "ghost";
  dense?: boolean;
}

const FieldGroup = ({
  icon: Icon,
  title,
  description,
  action,
  required,
  optional,
  children,
  className,
  variant = "panel",
  dense = false,
}: FieldGroupProps) => {
  return (
    <section
      className={cn(
        "animate-fade-in-up",
        variant === "panel" &&
          (dense
            ? "group/field relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-sm transition-colors hover:border-white/15 sm:p-4"
            : "group/field relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm transition-colors hover:border-white/15 sm:p-7"),
        className,
      )}
    >
      {variant === "panel" && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/10 blur-[80px]"
        />
      )}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className={cn("flex min-w-0 items-start", dense ? "gap-2" : "gap-3") }>
          {Icon && (
            <span className={cn(
              "grid shrink-0 place-items-center rounded-xl bg-primary/10 text-primary",
              dense ? "h-7 w-7" : "h-9 w-9",
            )}>
              <Icon className={dense ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2} />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={cn(
                "font-semibold tracking-tight text-foreground",
                dense ? "text-sm" : "text-[15px] sm:text-base",
              )}>
                {title}
              </h3>
              {required && (
                <span className="rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-destructive">
                  Обязательно
                </span>
              )}
              {optional && (
                <span className="rounded-full border border-border bg-secondary/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  По желанию
                </span>
              )}
            </div>
            {description && (
              <p className={cn(
                "mt-0.5 max-w-2xl leading-snug text-muted-foreground",
                dense ? "text-[11px]" : "text-[13px] leading-relaxed",
              )}>
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={dense ? "mt-2.5" : "mt-4"}>{children}</div>
    </section>
  );
};

export default FieldGroup;