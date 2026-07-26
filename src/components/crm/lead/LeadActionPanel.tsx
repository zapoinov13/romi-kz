import { forwardRef } from "react";
import { Phone, Calendar, Wallet, XCircle, AlertTriangle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead, PaymentMethod } from "@/types/crm";
import { leadSlaMinutes } from "@/hooks/useCrmAnalytics";
import { PaymentPopover } from "./PaymentPopover";
import { VisitSlotPopover } from "./VisitSlotPopover";
import { CallDialPopover, type CallResult } from "./CallDialPopover";

interface Props {
  lead: Lead;
  onCall: (opts?: { direction?: "outgoing" | "incoming"; status?: "answered" | "missed"; durationSec?: number; note?: string }) => void;
  onCallAttempt?: (info: { provider: string; ok: boolean; phone?: string; warning?: string; error?: string }) => void;
  onScheduleVisit: (iso: string) => void;
  onMarkPaid: (method: PaymentMethod, amount: number, opts?: { note?: string }) => void;
  onClose: () => void;
  onOpenChat?: () => void;
  /** Other leads' booked visits (ISO timestamps) — used to mark slots as busy. */
  busySlots?: { iso: string; leadName?: string }[];
}

interface ActionButtonProps {
  icon: typeof Phone;
  label: string;
  tone?: "neutral" | "danger" | "wa" | "success" | "warning";
  hint?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

const TONE_ICON: Record<NonNullable<ActionButtonProps["tone"]>, string> = {
  neutral: "bg-secondary text-foreground",
  danger: "bg-destructive/15 text-destructive",
  wa: "bg-[#25D366]/20 text-[#128C7E]",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
};

/**
 * Action-кнопка. Всегда нативный <button>, чтобы Radix PopoverTrigger asChild
 * клонировал её корректно.
 */
const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps & React.ComponentPropsWithoutRef<"button">>(
  function ActionButton({ icon: Icon, label, tone = "neutral", hint, className, onClick, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        {...rest}
        className={cn(
          "group flex h-full w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-[11px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md",
          tone === "danger"
            ? "border-destructive/25 bg-destructive/[0.06] text-destructive hover:bg-destructive/10"
            : "border-border/60 bg-card/80 text-foreground hover:border-primary/30 hover:bg-card",
          className,
        )}
      >
        <span className={cn("grid h-8 w-8 place-items-center rounded-xl transition-transform group-hover:scale-105", TONE_ICON[tone])}>
          <Icon className="h-4 w-4 shrink-0" />
        </span>
        <span className="truncate">{label}</span>
        {hint && <span className="max-w-full truncate text-[9px] font-normal text-muted-foreground">{hint}</span>}
      </button>
    );
  },
);

export function LeadActionPanel({
  lead, onCall, onCallAttempt, onScheduleVisit, onMarkPaid, onClose, onOpenChat, busySlots,
}: Props) {
  const sla = leadSlaMinutes(lead);
  const slaHint = sla > 5 && !lead.firstResponseAt ? `Связаться немедленно — ждёт ${sla} мин` : null;
  const visitHint = lead.nextVisitAt
    ? new Date(lead.nextVisitAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : undefined;

  return (
    <div className="border-b border-border/60 bg-background py-3">
      <div className={cn("grid gap-1.5", onOpenChat ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4")}>
        {onOpenChat && (
          <ActionButton icon={MessageSquare} label="Написать" tone="wa" onClick={onOpenChat} />
        )}
        <CallDialPopover
          phone={lead.phone}
          leadId={lead.id}
          onConfirm={(r: CallResult) => onCall(r)}
          onAttempt={onCallAttempt}
          trigger={<ActionButton icon={Phone} label="Позвонить" tone="neutral" />}
        />
        <VisitSlotPopover
          current={lead.nextVisitAt}
          busy={busySlots}
          onConfirm={onScheduleVisit}
          trigger={<ActionButton icon={Calendar} label="Визит" tone="warning" hint={visitHint} />}
        />
        <PaymentPopover
          amount={lead.amount}
          defaultNote={lead.service}
          onConfirm={(method, amount, opts) => onMarkPaid(method, amount, opts)}
          trigger={<ActionButton icon={Wallet} label="Оплата" tone="success" hint={lead.paid ? "оплачено" : undefined} />}
        />
        <ActionButton icon={XCircle} label="Отказ" tone="danger" onClick={onClose} />
      </div>

      {slaHint && (
        <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold">{slaHint}</span>
        </div>
      )}
    </div>
  );
}
