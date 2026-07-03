import { ListChecks } from "lucide-react";
import { ServicesCatalogPanel } from "@/components/sales-analytics/ServicesCatalogPanel";
import { useSalesServices } from "@/hooks/useSalesServices";

export function ServicesSettings() {
  const { items, loading, add, update, remove } = useSalesServices();

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
          <ListChecks className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Справочник услуг</h2>
          <p className="text-xs text-muted-foreground">
            Единый источник для CRM, аналитики продаж и отчётов. Изменения применяются везде автоматически.
          </p>
        </div>
      </div>
      <ServicesCatalogPanel items={items} loading={loading} onAdd={add} onUpdate={update} onRemove={remove} />
    </section>
  );
}
