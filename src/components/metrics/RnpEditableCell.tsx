import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type RnpCellSource = "meta" | "manual" | "crm";

interface Props {
  value: number;
  format: (n: number) => string;
  title: string;
  allowDecimal?: boolean;
  disabled?: boolean;
  source?: RnpCellSource;
  sourceValue?: number;
  isManualOverride?: boolean;
  onSave: (value: number | null) => Promise<void>;
  /** Meta fields: null reset not supported — use 0 */
  allowReset?: boolean;
}

export function RnpEditableCell({
  value,
  format,
  title,
  allowDecimal,
  disabled,
  source = "manual",
  sourceValue,
  isManualOverride,
  onSave,
  allowReset = true,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    if (disabled || saving) return;
    setVal(value > 0 ? String(value) : "");
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setVal("");
  };

  const commit = async () => {
    const trimmed = val.trim();
    const parsed =
      trimmed === ""
        ? allowReset
          ? null
          : 0
        : allowDecimal
        ? Math.max(0, Number(trimmed) || 0)
        : Math.max(0, Math.floor(Number(trimmed) || 0));

    if (!allowReset && parsed === null) {
      cancel();
      return;
    }

    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    }
    if (e.key === "Escape") cancel();
  };

  if (disabled) {
    return (
      <span className={cn("tabular-nums", !value && "text-muted-foreground/40")}>
        {value > 0 ? format(value) : "—"}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-0.5">
        <input
          ref={inputRef}
          type="number"
          min={0}
          step={allowDecimal ? "0.01" : "1"}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            window.setTimeout(() => {
              if (!saving) void commit();
            }, 120);
          }}
          className={cn(
            "h-7 w-full min-w-[4.5rem] max-w-[7rem] rounded-md border border-primary/50 bg-background px-1.5",
            "text-right text-xs tabular-nums outline-none ring-2 ring-primary/20",
          )}
          placeholder="0"
        />
        <button
          type="button"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-success hover:bg-success/10"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void commit()}
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted"
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const sourceLabel =
    source === "meta"
      ? "из Meta"
      : isManualOverride
      ? "вручную"
      : sourceValue && sourceValue > 0
      ? `CRM: ${sourceValue}`
      : null;

  return (
    <button
      type="button"
      onClick={startEdit}
      title={`${title}${sourceLabel ? ` · ${sourceLabel}` : ""} · клик для ввода`}
      className={cn(
        "group/cell relative w-full min-h-[1.75rem] rounded-md px-1.5 py-0.5 text-right tabular-nums transition",
        "hover:bg-primary/10 hover:ring-1 hover:ring-primary/25",
        value > 0 ? "text-foreground" : "text-muted-foreground/40",
        isManualOverride && "bg-warning/5 ring-1 ring-warning/20",
      )}
    >
      <span className="inline-flex items-center justify-end gap-1">
        {value > 0 ? format(value) : "—"}
        <Pencil className="h-2.5 w-2.5 shrink-0 text-primary/50 opacity-60 group-hover/cell:opacity-100" />
      </span>
    </button>
  );
}
