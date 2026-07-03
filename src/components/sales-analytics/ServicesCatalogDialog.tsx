import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SalesService } from "@/types/salesAnalytics";

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
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error("Введите название услуги");
      return;
    }
    setSaving(true);
    try {
      await onAdd(name, Number(price) || 0);
      setName("");
      setPrice("");
      toast.success("Услуга добавлена");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s: SalesService) => {
    setEditId(s.id);
    setEditName(s.name);
    setEditPrice(String(s.defaultPrice));
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await onUpdate(editId, {
        name: editName.trim(),
        defaultPrice: Number(editPrice) || 0,
      });
      setEditId(null);
      toast.success("Сохранено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Справочник услуг</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-border/60 p-3 sm:grid-cols-[1fr_120px_auto]">
            <div>
              <Label className="text-xs">Название</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Настройка рекламы" />
            </div>
            <div>
              <Label className="text-xs">Стоимость ₸</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="120000" />
            </div>
            <div className="flex items-end">
              <Button className="gap-1" onClick={() => void handleAdd()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Добавить
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Услуга</th>
                    <th className="px-3 py-2">Стоимость</th>
                    <th className="px-3 py-2">Активна</th>
                    <th className="px-3 py-2 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id} className="border-b border-border/40">
                      <td className="px-3 py-2">
                        {editId === s.id ? (
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                        ) : (
                          s.name
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {editId === s.id ? (
                          <Input
                            type="number"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="h-8 w-28"
                          />
                        ) : (
                          `${Math.round(s.defaultPrice).toLocaleString("ru-RU")} ₸`
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Switch
                          checked={s.isActive}
                          onCheckedChange={(v) => void onUpdate(s.id, { isActive: v })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {editId === s.id ? (
                            <Button size="sm" variant="secondary" onClick={() => void saveEdit()}>
                              OK
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(s)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (confirm(`Удалить «${s.name}»?`)) void onRemove(s.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
