import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
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
    <div className="mb-4 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Фильтры таблицы
        </span>
        {active && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => (onReset ? onReset() : onChange({ ...EMPTY_SALES_FILTERS }))}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Период с">
          <Input
            type="date"
            className="h-9 w-[140px] rounded-lg border-border/70 bg-background"
            min={monthSince}
            max={monthUntil}
            value={filters.dateFrom ?? ""}
            onChange={(e) => onChange({ dateFrom: e.target.value || null })}
          />
        </Field>
        <Field label="по">
          <Input
            type="date"
            className="h-9 w-[140px] rounded-lg border-border/70 bg-background"
            min={monthSince}
            max={monthUntil}
            value={filters.dateTo ?? ""}
            onChange={(e) => onChange({ dateTo: e.target.value || null })}
          />
        </Field>
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
        <Field label="Услуга">
          <Select
            value={filters.serviceId ?? "all"}
            onValueChange={(v) => onChange({ serviceId: v === "all" ? null : v })}
          >
            <SelectTrigger className="h-9 w-[160px] rounded-lg border-border/70 bg-background">
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
        </Field>
        <Field label="Источник">
          <Input
            className="h-9 w-[140px] rounded-lg border-border/70 bg-background"
            placeholder="UTM / креатив"
            value={filters.sourceQuery}
            onChange={(e) => onChange({ sourceQuery: e.target.value })}
          />
        </Field>
        <Field label="Имя">
          <Input
            className="h-9 w-[120px] rounded-lg border-border/70 bg-background"
            placeholder="Поиск…"
            value={filters.nameQuery}
            onChange={(e) => onChange({ nameQuery: e.target.value })}
          />
        </Field>
        <Field label="Телефон">
          <Input
            className="h-9 w-[130px] rounded-lg border-border/70 bg-background"
            placeholder="Поиск…"
            value={filters.phoneQuery}
            onChange={(e) => onChange({ phoneQuery: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
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
    <Field label={label}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 w-[130px] rounded-lg border-border/70 bg-background">
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
    </Field>
  );
}
