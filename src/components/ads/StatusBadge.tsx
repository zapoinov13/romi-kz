import { cn } from "@/lib/utils";

export type CampaignHealth = {
  status: "green" | "yellow" | "red" | "cold_start" | "no_data";
  reasons: string[];
  metrics?: { cpl?: number | null; ctr?: number; roas?: number; spend?: number; leads?: number; days?: number };
  evaluated_at?: string;
};

const META: Record<CampaignHealth["status"], { dot: string; bg: string; label: string }> = {
  green: { dot: "bg-success", bg: "border-success/30 bg-success/10 text-success", label: "В норме" },
  yellow: { dot: "bg-warning", bg: "border-warning/30 bg-warning/10 text-warning", label: "Внимание" },
  red: { dot: "bg-destructive", bg: "border-destructive/30 bg-destructive/10 text-destructive", label: "Критично" },
  cold_start: { dot: "bg-muted-foreground", bg: "border-muted-foreground/30 bg-muted/30 text-muted-foreground", label: "Обучение" },
  no_data: { dot: "bg-muted-foreground", bg: "border-border bg-muted/20 text-muted-foreground", label: "Нет данных" },
};

export const StatusBadge = ({ health, compact = false }: { health: CampaignHealth | null; compact?: boolean }) => {
  if (!health) return null;
  const m = META[health.status];
  const title = (health.reasons || []).join(" • ");
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold", m.bg)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {compact ? null : <span>{m.label}</span>}
      {health.metrics?.cpl && health.status !== "cold_start" && (
        <span className="font-normal opacity-80">CPL ${Math.round(health.metrics.cpl)}</span>
      )}
    </span>
  );
};

export default StatusBadge;