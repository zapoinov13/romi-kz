import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMPTY_SALES_FILTERS,
  type SalesLeadFilters,
  type SalesService,
} from "@/types/salesAnalytics";

type Props = {
  filters: SalesLeadFilters;
  onChange: (patch: Partial<SalesLeadFilters>) => void;
  onReset?: () => void;
  services: SalesService[];
  monthSince: string;
  monthUntil: string;
};

function filtersActive(f: SalesLeadFilters): boolean {
  return (
    f.dateFrom != null ||
    f.dateTo != null ||
    f.qualified !== "all" ||
    f.payment !== "all" ||
    f.serviceId != null ||
    f.sourceQuery.trim() !== "" ||
    f.nameQuery.trim() !== "" ||
    f.phoneQuery.trim() !== ""
  );
}

export function SalesFiltersBar({
  filters,
  onChange,
  onReset,
  services,
  monthSince,
  monthUntil,
}: Props) {
  const active = filtersActive(filters);
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card/50 p-3">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Период с</span>
        <Input
          type="date"
          className="h-9 w-[140px]"
          min={monthSince}
          max={monthUntil}
          value={filters.dateFrom ?? ""}
          onChange={(e) => onChange({ dateFrom: e.target.value || null })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">по</span>
        <Input
          type="date"
          className="h-9 w-[140px]"
          min={monthSince}
          max={monthUntil}
          value={filters.dateTo ?? ""}
          onChange={(e) => onChange({ dateTo: e.target.value || null })}
        />
      </div>
      <FilterSelect
        label="Квал"
        value={filters.qualified}
        onValueChange={(v) => onChange({ qualified: v as SalesLeadFilters["qualified"] })}
        options={[
          { value: "all", label: "Все" },
          { value: "yes", label: "Да" },
          { value: "no", label: "Нет" },
          { value: "unset", label: "Не заполнено" },
        ]}
      />
      <FilterSelect
        label="Оплата"
        value={filters.payment}
        onValueChange={(v) => onChange({ payment: v as SalesLeadFilters["payment"] })}
        options={[
          { value: "all", label: "Все" },
          { value: "paid", label: "Оплатил" },
          { value: "unpaid", label: "Не оплатил" },
          { value: "unset", label: "Не заполнено" },
        ]}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Услуга</span>
        <Select
          value={filters.serviceId ?? "all"}
          onValueChange={(v) => onChange({ serviceId: v === "all" ? null : v })}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Все" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Источник (UTM)</span>
        <Input
          className="h-9 w-[140px]"
          placeholder="Поиск…"
          value={filters.sourceQuery}
          onChange={(e) => onChange({ sourceQuery: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Имя</span>
        <Input
          className="h-9 w-[120px]"
          placeholder="Поиск…"
          value={filters.nameQuery}
          onChange={(e) => onChange({ nameQuery: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Телефон</span>
        <Input
          className="h-9 w-[130px]"
          placeholder="Поиск…"
          value={filters.phoneQuery}
          onChange={(e) => onChange({ phoneQuery: e.target.value })}
        />
      </div>
      {active && (
        <Button
          type="button"
          variant="ghost"
          className="h-9 text-xs text-muted-foreground"
          onClick={() => (onReset ? onReset() : onChange({ ...EMPTY_SALES_FILTERS }))}
        >
          Сбросить
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
