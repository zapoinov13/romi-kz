import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SalesService } from "@/types/salesAnalytics";
import { ServicesCatalogPanel } from "./ServicesCatalogPanel";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: SalesService[];
  loading?: boolean;
  onAdd: (name: string, price: number) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Pick<SalesService, "name" | "defaultPrice" | "isActive">>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

export function ServicesCatalogDialog({
  open,
  onOpenChange,
  items,
  loading,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Справочник услуг</DialogTitle>
        </DialogHeader>
        <ServicesCatalogPanel
          items={items}
          loading={loading}
          onAdd={onAdd}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      </DialogContent>
    </Dialog>
  );
}
