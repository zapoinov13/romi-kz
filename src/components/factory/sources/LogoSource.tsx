import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { BadgeCheck, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoSourceProps {
  file: File | null;
  onChange: (file: File | null) => void;
  compact?: boolean;
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

const LogoSource = ({ file, onChange, compact = false }: LogoSourceProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = (incoming: File | null) => {
    if (!incoming) {
      onChange(null);
      return;
    }
    if (!incoming.type.startsWith("image/")) return;
    onChange(incoming);
  };

  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    pickFile(f);
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  };

  const previewUrl = file ? URL.createObjectURL(file) : null;

  return (
    <div className="animate-fade-in-up">
      {file && previewUrl ? (
        <div className={cn("flex items-center gap-3 rounded-2xl border border-border bg-secondary/30", compact ? "p-2" : "p-4")}>
          <div className={cn("relative shrink-0 overflow-hidden rounded-xl border border-border bg-background", compact ? "h-12 w-12" : "h-20 w-20")}>
            <img
              src={previewUrl}
              alt="Логотип"
              className="h-full w-full object-contain p-1"
              onLoad={() => URL.revokeObjectURL(previewUrl)}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-background text-foreground hover:bg-secondary"
            aria-label="Удалить логотип"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border/70 bg-background/40 text-center transition-all",
            compact ? "min-h-[100px] px-3 py-4" : "min-h-[140px] px-6 py-8 gap-2",
            "hover:border-primary/60 hover:bg-secondary/50",
            dragOver && "border-primary bg-primary/5 shadow-glow",
          )}
        >
          <span className={cn("grid place-items-center rounded-xl bg-primary/15 text-primary", compact ? "h-8 w-8" : "h-10 w-10")}>
            <UploadCloud className={compact ? "h-4 w-4" : "h-5 w-5"} />
          </span>
          <p className={compact ? "text-xs" : "text-sm"}>
            Перетащите логотип или <span className="font-semibold text-primary">выберите файл</span>
          </p>
          {!compact && <p className="text-xs text-muted-foreground">PNG, JPG, WEBP, SVG до 10MB</p>}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleSelect}
          />
        </div>
      )}
    </div>
  );
};

export default LogoSource;
