import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  STATUS_TONE_CLASS,
  type MetaAccountStatusInfo,
} from "@/lib/metaAccountStatus";
import { useMetaAccountStatus } from "@/hooks/useMetaAccountStatus";

interface Props {
  status: MetaAccountStatusInfo;
  compact?: boolean;
  onStatusChange?: (status: MetaAccountStatusInfo) => void;
  className?: string;
}

function buildBillingUrl(status: MetaAccountStatusInfo): string {
  if (status.billing_url) return status.billing_url;
  const assetId = status.id.replace(/^act_/, "");
  return `https://business.facebook.com/billing_hub/accounts/details?asset_id=${assetId}`;
}

export function MetaAccountStatusBlock({
  status,
  compact = false,
  className,
}: Props) {
  const tone = STATUS_TONE_CLASS[status.status_tone] ?? STATUS_TONE_CLASS.muted;
  const billingUrl = buildBillingUrl(status);

  const openBilling = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(billingUrl, "_blank", "noopener,noreferrer");
  };

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
            onClick={openBilling}
            title="Открыть биллинг Meta для оплаты"
          >
            <CreditCard className="h-3 w-3" />
            Оплатить в Meta
            <ExternalLink className="h-2.5 w-2.5" />
          </Button>
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
