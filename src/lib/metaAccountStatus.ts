export type MetaAccountStatusTone = "success" | "warning" | "danger" | "muted";

export interface MetaAccountStatusInfo {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  account_status: number;
  status_label: string;
  status_title: string;
  status_detail: string | null;
  status_tone: MetaAccountStatusTone;
  needs_payment: boolean;
  balance_due: number | null;
  balance_due_formatted: string | null;
  disable_reason: number;
  disable_reason_label: string | null;
  payment_method: string | null;
  billing_url: string;
  timezone_name: string | null;
  business_name: string | null;
}

export const STATUS_TONE_CLASS: Record<MetaAccountStatusTone, string> = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted/30 text-muted-foreground",
};
