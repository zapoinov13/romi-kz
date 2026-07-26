import { useState } from "react";
import {
  Star, Tag, Link2, Globe, Phone, MessageCircle, Copy, Check, Clock, Sparkles, UserRound,
} from "lucide-react";
import { resolveLeadSource } from "@/lib/leadSource";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Lead, LeadStage } from "@/types/crm";
import type { TeamMember } from "@/hooks/useTeamStore";
import { InlineEdit } from "./InlineEdit";
import { LeadAttribution } from "./LeadAttribution";
import { toast } from "sonner";

interface Props {
  lead: Lead;
  stages: LeadStage[];
  members: TeamMember[];
  onUpdate: (patch: Partial<Lead>) => void;
  onTogglePin: () => void;
  onAssign: (assigneeId?: string) => void;
  onChangeStage: (stageId: string) => void;
  onOpenChat?: () => void;
}

function digitsPhone(phone?: string | null) {
  return (phone ?? "").replace(/\D/g, "");
}

function formatRelative(iso?: string) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

export function LeadHeader({
  lead, stages, members, onUpdate, onTogglePin, onAssign, onChangeStage, onOpenChat,
}: Props) {
  const stage = stages.find((s) => s.id === lead.stageId);
  const assignee = members.find((m) => m.id === lead.assigneeId);
  const sourceMeta = resolveLeadSource(lead);
  const SourceIcon = sourceMeta.Icon;
  const phoneDigits = digitsPhone(lead.phone);
  const isWa = (lead.channel ?? "").toLowerCase() === "whatsapp" || sourceMeta.label.toLowerCase().includes("whatsapp");
  const activity = formatRelative(lead.lastActivityAt || lead.createdAt);
  const [copied, setCopied] = useState(false);

  const copyPhone = async () => {
    if (!lead.phone) return;
    try {
      await navigator.clipboard.writeText(lead.phone);
      setCopied(true);
      toast.success("Номер скопирован");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <div className="border-b border-border/60 bg-gradient-to-b from-primary/[0.04] to-transparent pb-4">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-sm shadow-primary/25">
            {lead.name.slice(0, 1).toUpperCase()}
          </span>
          {isWa && (
            <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[#25D366] text-white ring-2 ring-background">
              <MessageCircle className="h-3 w-3" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1 text-lg font-bold leading-tight tracking-tight sm:text-xl">
              <InlineEdit
                value={lead.name}
                onSave={(v) => v && onUpdate({ name: v })}
                placeholder="Имя"
                ariaLabel="Имя клиента"
                wrap
              />
            </div>
            <button
              type="button"
              onClick={onTogglePin}
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-secondary",
                lead.pinned && "text-amber-500",
              )}
              title={lead.pinned ? "Открепить" : "Закрепить"}
            >
              <Star className={cn("h-4 w-4", lead.pinned && "fill-amber-500")} />
            </button>
          </div>

          {/* Phone row */}
          {lead.phone && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <a
                href={`tel:${phoneDigits || lead.phone}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/70 px-2 py-1 text-sm font-semibold tabular-nums text-foreground hover:bg-secondary"
              >
                <Phone className="h-3.5 w-3.5 text-primary" />
                {lead.phone}
              </a>
              <button
                type="button"
                onClick={() => void copyPhone()}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border/60 bg-card hover:bg-secondary"
                title="Скопировать номер"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              {phoneDigits && (
                <a
                  href={`https://wa.me/${phoneDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#25D366]/15 px-2 text-xs font-semibold text-[#128C7E] hover:bg-[#25D366]/25"
                  title="Открыть в WhatsApp"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WA
                </a>
              )}
              {onOpenChat && (
                <button
                  type="button"
                  onClick={onOpenChat}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 text-xs font-semibold text-primary hover:bg-primary/15"
                >
                  Чат в CRM
                </button>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
                isWa ? "bg-[#25D366]/15 text-[#128C7E]" : "bg-secondary/70",
                !isWa && sourceMeta.cls,
              )}
              title={`Источник: ${sourceMeta.label}${lead.channel ? ` · канал: ${lead.channel}` : ""}`}
            >
              <SourceIcon className="h-3 w-3 shrink-0" />
              {sourceMeta.label}
            </span>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 font-semibold text-primary hover:bg-primary/20"
                >
                  {stage?.title ?? lead.stageId}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1" align="start">
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Сменить этап</div>
                {stages.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onChangeStage(s.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-secondary/60",
                      s.id === lead.stageId && "bg-primary/10 font-semibold text-primary",
                    )}
                  >
                    <span>{s.title}</span>
                    {s.id === lead.stageId && <span className="text-[10px]">✓</span>}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 hover:bg-secondary"
                >
                  <UserRound className="h-3 w-3" />
                  {assignee?.name ?? "не назначен"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="start">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ответственный</div>
                <Select
                  value={lead.assigneeId ?? "none"}
                  onValueChange={(v) => onAssign(v === "none" ? undefined : v)}
                >
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не назначен</SelectItem>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </PopoverContent>
            </Popover>

            {typeof lead.aiScore === "number" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 font-medium text-violet-700 dark:text-violet-300">
                <Sparkles className="h-3 w-3" />
                AI {lead.aiScore}
              </span>
            )}

            {activity && (
              <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {activity}
              </span>
            )}
          </div>
        </div>
      </div>

      <LeadAttribution lead={lead} />
      <UtmStrip lead={lead} />
    </div>
  );
}

const UTM_LABELS: Record<string, string> = {
  source: "source",
  medium: "medium",
  campaign: "campaign",
  content: "content",
  term: "term",
  ad_name: "ad_name",
  headline: "headline",
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_content: "content",
  utm_term: "term",
};

function UtmStrip({ lead }: { lead: Lead }) {
  const entries = lead.utm
    ? (Object.entries(lead.utm).filter(([, v]) => !!v) as Array<[string, string]>)
    : [];
  const hasAny = entries.length > 0 || !!lead.referrer || !!lead.landingUrl;

  return (
    <div className="mt-3 rounded-xl border border-dashed border-border/70 bg-card/50 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Tag className="h-3 w-3 text-primary" />
        Источник и UTM
      </div>

      {entries.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {entries.map(([k, v]) => (
            <span
              key={k}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary/70 px-1.5 py-0.5 text-[10px]"
              title={`utm_${k}: ${v}`}
            >
              <span className="font-mono text-muted-foreground">utm_{UTM_LABELS[k] ?? k}</span>
              <span className="truncate font-semibold">{v}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          UTM-метки не зафиксированы
          <span
            className="ml-1 text-muted-foreground/70"
            title="Лид пришёл без utm_source/medium/campaign. Проверьте, что форма на сайте передаёт UTM-параметры из URL."
          >
            ⓘ
          </span>
        </div>
      )}

      {hasAny && (lead.referrer || lead.landingUrl) && (
        <div className="mt-1.5 grid gap-0.5 border-t border-border/50 pt-1.5 text-[10px] text-muted-foreground">
          {lead.landingUrl && (
            <div className="flex items-start gap-1">
              <Globe className="mt-0.5 h-3 w-3 shrink-0" />
              <a
                href={lead.landingUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate text-foreground/80 hover:underline"
                title={lead.landingUrl}
              >
                {lead.landingUrl}
              </a>
            </div>
          )}
          {lead.referrer && (
            <div className="flex items-start gap-1">
              <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="truncate text-foreground/80" title={lead.referrer}>
                {lead.referrer}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
