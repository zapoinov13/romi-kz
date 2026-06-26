import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  STATUS_TONE_CLASS,
  type MetaAccountStatusInfo,
} from "@/lib/metaAccountStatus";
import { useMetaAccountPay, useMetaAccountStatus } from "@/hooks/useMetaAccountStatus";

interface Props {
  status: MetaAccountStatusInfo;
  compact?: boolean;
  onStatusChange?: (status: MetaAccountStatusInfo) => void;
  className?: string;
}

export function MetaAccountStatusBlock({
  status,
  compact = false,
  onStatusChange,
  className,
}: Props) {
  const { pay, paying } = useMetaAccountPay();

  const handlePay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const result = await pay(status.id);
      if (result.status && onStatusChange) onStatusChange(result.status);
      if (result.paid) {
        toast.success(result.message || "Оплата прошла");
        return;
      }
      if (result.billing_url) {
        window.open(result.billing_url, "_blank", "noopener,noreferrer");
      }
      toast.message("Оплата через Meta", {
        description:
          result.message ||
          "Откройте биллинг Meta и нажмите «Оплатить сейчас» на привязанной карте.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось оплатить");
      if (status.billing_url) {
        window.open(status.billing_url, "_blank", "noopener,noreferrer");
      }
    }
  };

  const tone = STATUS_TONE_CLASS[status.status_tone] ?? STATUS_TONE_CLASS.muted;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[10px] font-semibold",
            tone,
          )}
          title={status.status_detail ?? undefined}
        >
          {status.status_title}
        </span>
        {status.balance_due_formatted && (
          <span className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-[10px] font-medium text-destructive">
            {status.balance_due_formatted}
          </span>
        )}
        {status.needs_payment && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              "h-7 gap-1 border-warning/50 bg-warning/5 px-2 text-[10px] text-warning hover:bg-warning/15",
              compact && "h-6 px-1.5",
            )}
            disabled={paying}
            onClick={handlePay}
          >
            {paying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CreditCard className="h-3 w-3" />
            )}
            Оплатить
          </Button>
        )}
        {status.needs_payment && status.billing_url && (
          <a
            href={status.billing_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Биллинг Meta
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      {!compact && status.status_detail && (
        <p className="text-[10px] leading-snug text-muted-foreground">{status.status_detail}</p>
      )}
    </div>
  );
}

interface InlineProps {
  actId: string;
  compact?: boolean;
  className?: string;
}

export function MetaAccountStatusInline({ actId, compact, className }: InlineProps) {
  const { status, loading } = useMetaAccountStatus(actId, Boolean(actId));
  if (loading) {
    return <Loader2 className={cn("h-3 w-3 animate-spin text-muted-foreground", className)} />;
  }
  if (!status) return null;
  if (status.account_status === 1) {
    return (
      <span
        className={cn(
          "rounded-md border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9px] font-semibold text-success",
          className,
        )}
      >
        Активен
      </span>
    );
  }
  return (
    <MetaAccountStatusBlock status={status} compact={compact} className={className} />
  );
}
