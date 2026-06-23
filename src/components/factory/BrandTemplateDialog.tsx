import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, Sparkles, Star, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { BrandTemplateInput } from "@/hooks/useBrandTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: BrandTemplateInput) => Promise<void>;
}

interface DropZoneProps {
  title: string;
  hint: string;
  icon: React.ReactNode;
  accept: string;
  multiple?: boolean;
  files: File[];
  onChange: (files: File[]) => void;
}

function DropZone({ title, hint, icon, accept, multiple, files, onChange }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const list = Array.from(incoming);
    onChange(multiple ? [...files, ...list] : [list[0]]);
  };

  const removeAt = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setHover(true);
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "group flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-4 text-left transition",
          "hover:border-primary/50 hover:bg-muted/50",
          hover && "border-primary bg-primary/5",
        )}
      >
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-background text-primary shadow-sm">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground truncate">{hint}</div>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Upload className="h-3.5 w-3.5" />
          {multiple ? "Выбрать" : files[0] ? "Заменить" : "Выбрать"}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </button>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => {
            const isImg = f.type.startsWith("image/");
            const url = isImg ? URL.createObjectURL(f) : null;
            return (
              <div
                key={`${f.name}-${i}`}
                className="group relative flex items-center gap-2 rounded-lg border border-border bg-background pl-1 pr-2 py-1 text-xs"
              >
                {url ? (
                  <img src={url} alt={f.name} className="h-8 w-8 rounded object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <span className="max-w-[140px] truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(i);
                  }}
                  className="rounded p-0.5 hover:bg-muted"
                  aria-label="Удалить"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BrandTemplateDialog({ open, onOpenChange, onSave }: Props) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [brandbookFiles, setBrandbookFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setNotes("");
    setIsDefault(false);
    setLogoFile(null);
    setReferenceFiles([]);
    setBrandbookFiles([]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Укажите название бренда");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: notes.trim() || undefined,
        prompt_addon: notes.trim() || undefined,
        is_default: isDefault,
        logoFile,
        referenceFiles,
        brandbookFiles,
      });
      reset();
      onOpenChange(false);
      toast.success("Шаблон сохранён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Новый шаблон бренда
          </DialogTitle>
          <DialogDescription>
            Загрузите логотип, брендбук и референсы — AI будет создавать контент строго в вашем стиле.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Название бренда *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Mir Bez Granits"
              autoFocus
            />
          </div>

          <DropZone
            title="Логотип"
            hint="PNG или SVG с прозрачным фоном"
            icon={<Star className="h-5 w-5" />}
            accept="image/*"
            files={logoFile ? [logoFile] : []}
            onChange={(f) => setLogoFile(f[0] ?? null)}
          />

          <DropZone
            title="Брендбук"
            hint="PDF или изображения — гайдлайн бренда"
            icon={<FileText className="h-5 w-5" />}
            accept="image/*,.pdf"
            multiple
            files={brandbookFiles}
            onChange={setBrandbookFiles}
          />

          <DropZone
            title="Референсы стиля"
            hint="Фото и креативы, на которые ориентироваться"
            icon={<ImageIcon className="h-5 w-5" />}
            accept="image/*"
            multiple
            files={referenceFiles}
            onChange={setReferenceFiles}
          />

          <div className="space-y-2">
            <Label>Комментарий для AI (необязательно)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Тон, что нравится, что нельзя использовать…"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Использовать по умолчанию</div>
              <div className="text-xs text-muted-foreground">Будет выбираться автоматически при создании контента</div>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Сохранить шаблон
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
