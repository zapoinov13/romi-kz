import {
  Eye, MousePointerClick, Target, UserPlus, Users, Wallet,
} from "lucide-react";
import type { ReportData } from "@/hooks/useReportData";
import { deltaPct } from "@/hooks/useReportData";
import { KpiCard } from "./KpiCard";
import { SectionTitle } from "./SectionTitle";
import { ReportPageWrapper } from "./ReportPageWrapper";
import { fmtNum, fmtTenge } from "./reportFormat";

interface Props {
  data: ReportData;
  rangeLabel: string;
  comparing: boolean;
}

export function MarketingPage({ data, rangeLabel, comparing }: Props) {
  const { totals, prev } = data;

  return (
    <ReportPageWrapper
      title="Показатели Meta"
      rangeLabel={rangeLabel}
      pageNumber={1}
      pageTotal={1}
      rightLabel="Meta · Instagram"
    >
      <SectionTitle>Данные из таблицы показателей</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard icon={Wallet} label="Расходы Meta" hint="сумма spend за период" value={fmtTenge(totals.spend)} delta={deltaPct(totals.spend, prev?.spend)} comparing={comparing} invertDelta />
        <KpiCard icon={Eye} label="Показы Meta" hint="impressions" value={fmtNum(totals.impressions)} delta={deltaPct(totals.impressions, prev?.impressions)} comparing={comparing} />
        <KpiCard icon={MousePointerClick} label="Клики Meta" hint="clicks" value={fmtNum(totals.clicks)} delta={deltaPct(totals.clicks, prev?.clicks)} comparing={comparing} />
        <KpiCard icon={Users} label="Лиды Meta" hint="leads из Meta" value={fmtNum(totals.adsLeads)} delta={deltaPct(totals.adsLeads, prev?.adsLeads)} comparing={comparing} />
        <KpiCard icon={Target} label="CPL Meta" hint="расход ÷ лиды Meta" value={totals.adsLeads > 0 ? fmtTenge(totals.spend / totals.adsLeads) : "—"} delta={deltaPct(totals.adsLeads > 0 ? totals.spend / totals.adsLeads : 0, prev && prev.adsLeads > 0 ? prev.spend / prev.adsLeads : undefined)} comparing={comparing} invertDelta />
        <KpiCard icon={UserPlus} label="Подписчики" hint="прирост подписчиков Instagram" value={fmtNum(totals.newFollowers)} delta={deltaPct(totals.newFollowers, prev?.newFollowers)} comparing={comparing} />
      </div>
    </ReportPageWrapper>
  );
}

export { reportFmt } from "./reportFormat";