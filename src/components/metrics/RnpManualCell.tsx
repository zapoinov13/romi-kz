import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  crmValue?: number;
  manualRaw: number | null;
  format: (n: number) => string;
  title: string;
  allowDecimal?: boolean;
  disabled?: boolean;
  onSave: (value: number | null) => Promise<void>;
}

export function RnpManualCell({
  value,
  crmValue = 0,
  manualRaw,
  format,
  title,
  allowDecimal,
  disabled,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  if (disabled) {
    return (
      <span className={cn(!value && "text-muted-foreground/50")}>
        {value > 0 ? format(value) : "—"}
      </span>
    );
  }

  const openPopover = () => {
    setVal(manualRaw != null ? String(manualRaw) : value > 0 ? String(value) : "");
    setOpen(true);
  };

  const handleSave = async () => {
    const trimmed = val.trim();
    const parsed =
      trimmed === ""
        ? null
        : allowDecimal
        ? Math.max(0, Number(trimmed) || 0)
        : Math.max(0, Math.floor(Number(trimmed) || 0));
    setSaving(true);
    try {
      await onSave(parsed);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={openPopover}
          className={cn(
            "group/cell inline-flex min-w-[3rem] items-center justify-end gap-1 rounded-md px-1 py-0.5 tabular-nums hover:bg-secondary/80",
            !value && "text-muted-foreground/50",
          )}
          title={title}
        >
          {value > 0 ? format(value) : "—"}
          <Pencil className="h-3 w-3 shrink-0 opacity-0 transition group-hover/cell:opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 rounded-xl" align="end">
        <div className="space-y-2">
          <div className="text-xs font-semibold">{title}</div>
          {crmValue > 0 && (
            <div className="text-[11px] text-muted-foreground">Из CRM: {crmValue}</div>
          )}
          <Input
            type="number"
            min={0}
            step={allowDecimal ? "0.01" : "1"}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Пусто = авто из CRM"
          />
          <p className="text-[10px] text-muted-foreground">
            Очистите поле и сохраните, чтобы вернуть авто из CRM.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "…" : "Сохранить"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
