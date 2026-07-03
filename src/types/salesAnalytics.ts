export type PaymentStatus = "paid" | "unpaid";

export type SalesService = {
  id: string;
  projectId: string;
  name: string;
  defaultPrice: number;
  isActive: boolean;
  sortOrder: number;
};

export type SalesAnalyticsLead = {
  id: string;
  projectId: string;
  leadId: string | null;
  name: string;
  phone: string;
  sourceLabel: string | null;
  metaAdId: string | null;
  utmContent: string | null;
  channel: string | null;
  isQualified: boolean | null;
  paymentStatus: PaymentStatus | null;
  serviceId: string | null;
  amount: number | null;
  createdAt: string;
};

export type SalesLeadFilters = {
  dateFrom: string | null;
  dateTo: string | null;
  qualified: "all" | "yes" | "no" | "unset";
  payment: "all" | "paid" | "unpaid" | "unset";
  serviceId: string | null;
  sourceQuery: string;
  nameQuery: string;
  phoneQuery: string;
};

export const EMPTY_SALES_FILTERS: SalesLeadFilters = {
  dateFrom: null,
  dateTo: null,
  qualified: "all",
  payment: "all",
  serviceId: null,
  sourceQuery: "",
  nameQuery: "",
  phoneQuery: "",
};

export type SalesKpi = {
  totalLeads: number;
  spend: number;
  cpl: number;
  cac: number;
  qualifiedRate: number;
  paidClients: number;
  revenue: number;
  roas: number;
  avgCheck: number;
};

export type TopCreativeRow = {
  key: string;
  label: string;
  leads: number;
  sales: number;
  revenue: number;
  conversion: number;
};

export type TopServiceRow = {
  serviceId: string;
  name: string;
  sales: number;
  revenue: number;
  avgCheck: number;
};
