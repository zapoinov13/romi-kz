import { memo, useSyncExternalStore, type DragEvent, type MouseEvent } from "react";
import { Bot, Clock, Phone, Star, Tag, User } from "lucide-react";
import { subscribeAutoMoved, isRecentlyAutoMoved, getAutoMovedSnapshot } from "@/lib/autoMoveTracker";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type { Lead } from "@/types/crm";
import { leadSlaMinutes, slaTone } from "@/hooks/useCrmAnalytics";
import { resolveLeadSource } from "@/lib/leadSource";

interface LeadCardProps {
  lead: Lead;
  assigneeName?: string;
  highlightSla?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onSelectToggle?: (leadId: string) => void;
  onClick?: () => void;
  onTogglePin?: (leadId: string) => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.floor(h / 24);
  return `${d} д`;
}

function LeadCardImpl({
  lead,
  assigneeName,
  highlightSla,
  selectMode,
  selected,
  onSelectToggle,
  onClick,
  onTogglePin,
}: LeadCardProps) {
  const handleDragStart = (e: DragEvent) => {
    if (selectMode) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/lead-id", lead.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleClick = () => {
    if (selectMode) {
      onSelectToggle?.(lead.id);
      return;
    }
    onClick?.();
  };

  const handleCheckboxClick = (e: MouseEvent) => {
    e.stopPropagation();
    onSelectToggle?.(lead.id);
  };

  const sla = leadSlaMinutes(lead);
  const tone = slaTone(sla);
  const showSlaTimer = highlightSla || (!lead.firstResponseAt && (lead.stageId === "new" || lead.stageId === "no_answer"));
  const sourceMeta = resolveLeadSource(lead);

  useSyncExternalStore(subscribeAutoMoved, getAutoMovedSnapshot, getAutoMovedSnapshot);
  const autoMoved = isRecentlyAutoMoved(lead.id);

  return (
    <button
      type="button"
      draggable={!selectMode}
      onDragStart={handleDragStart}
      onClick={handleClick}
      className={cn(
        "group relative w-full shrink-0 glass-surface rounded-xl p-3 pb-8 text-left transition-all duration-200",
        selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        selected
          ? "border-primary ring-1 ring-primary/25"
          : lead.pinned
            ? "border-primary/30"
            : "border-border/70 hover:border-border hover:bg-muted/20",
        showSlaTimer && tone === "bad" && "border-destructive/40",
      )}
    >
      {selectMode && (
        <div className="absolute left-2 top-2 z-10" onClick={handleCheckboxClick}>
          <Checkbox checked={selected} aria-label={`Выбрать ${lead.name}`} />
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {lead.pinned && <Star className="h-3 w-3 shrink-0 fill-primary text-primary" />}
            {autoMoved && (
              <span
                className="inline-flex items-center gap-0.5 rounded border border-border/60 bg-muted/40 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                title="Лид автоматически перенесён по WA-анализу"
              >
                <Bot className="h-2.5 w-2.5" />
                авто
              </span>
            )}
            <div className="truncate text-sm font-medium text-foreground">{lead.name}</div>
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate tabular-nums">{lead.phone}</span>
          </div>
        </div>

        {showSlaTimer && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
              tone === "good" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              tone === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
              tone === "bad" && "border-destructive/40 bg-destructive/10 text-destructive",
            )}
            title="Время без ответа"
          >
            <Clock className="h-3 w-3" />
            {sla} мин
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/50 pt-2">
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1 text-[11px] font-medium",
            sourceMeta.cls,
          )}
          title={`Источник: ${sourceMeta.label}${lead.channel ? ` · ${lead.channel}` : ""}`}
        >
          <sourceMeta.Icon className="h-3 w-3 shrink-0 opacity-70" />
          <span className="truncate">{sourceMeta.label}</span>
        </span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
          {lead.amount > 0 ? `${lead.amount.toLocaleString("ru-RU")} $` : "—"}
        </span>
      </div>

      {(lead.utm?.campaign || lead.utm?.source) && (
        <div
          className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground"
          title={`utm_source: ${lead.utm?.source ?? "—"} · utm_campaign: ${lead.utm?.campaign ?? "—"}`}
        >
          <Tag className="h-3 w-3 shrink-0 opacity-60" />
          <span className="truncate">{lead.utm?.campaign ?? lead.utm?.source}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>Активность · {timeAgo(lead.lastActivityAt)}</span>
        {assigneeName ? (
          <span className="inline-flex max-w-[45%] items-center gap-1 truncate">
            <User className="h-3 w-3 shrink-0 opacity-60" />
            <span className="truncate">{assigneeName}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/60">не назначен</span>
        )}
      </div>

      {onTogglePin && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(lead.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onTogglePin(lead.id);
            }
          }}
          className={cn(
            "absolute bottom-2 right-2 grid h-6 w-6 cursor-pointer place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100",
            lead.pinned && "text-primary opacity-100",
          )}
          title={lead.pinned ? "Открепить" : "Закрепить"}
        >
          <Star className={cn("h-3.5 w-3.5", lead.pinned && "fill-primary")} />
        </span>
      )}
    </button>
  );
}

export const LeadCard = memo(LeadCardImpl);
