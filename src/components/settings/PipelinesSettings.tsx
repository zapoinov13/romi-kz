import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GitBranch, Plus, Stethoscope, Trash2, ChevronUp, ChevronDown } from "lucide-react";

type Pipeline = { id: string; name: string; is_default: boolean };
type Stage = {
  id: string;
  pipeline_id: string;
  key: string;
  title: string;
  order_index: number;
  is_terminal: boolean;
  is_diagnostic: boolean;
  is_hidden: boolean;
  color: string;
};

const STAGE_COLORS: { id: string; label: string; dot: string }[] = [
  { id: "primary", label: "Синий", dot: "bg-primary" },
  { id: "warning", label: "Оранжевый", dot: "bg-warning" },
  { id: "success", label: "Зелёный", dot: "bg-success" },
  { id: "destructive", label: "Красный", dot: "bg-destructive" },
  { id: "muted", label: "Серый", dot: "bg-muted-foreground" },
];

function StageColorSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const current = STAGE_COLORS.find((c) => c.id === value) ?? STAGE_COLORS[0];
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-[130px] text-xs" title="Цвет колонки на Kanban-доске">
        <span className="flex items-center gap-2">
          <span className={cn("h-3 w-3 shrink-0 rounded-full", current.dot)} />
          <SelectValue>{current.label}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent>
        {STAGE_COLORS.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex items-center gap-2">
              <span className={cn("h-3 w-3 shrink-0 rounded-full", c.dot)} />
              {c.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PipelinesSettings() {
  const { isAdmin } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [activePipeline, setActivePipeline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStage, setNewStage] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: ps, error: pe }, { data: ss, error: se }] = await Promise.all([
      supabase.from("pipelines").select("id, name, is_default").order("created_at"),
      supabase
        .from("pipeline_stages")
        .select("id, pipeline_id, key, title, order_index, is_terminal, is_diagnostic, is_hidden, color")
        .order("order_index"),
    ]);
    if (pe) toast.error(pe.message);
    if (se) toast.error(se.message);
    const piped = (ps ?? []) as Pipeline[];
    setPipelines(piped);
    setStages((ss ?? []) as Stage[]);
    if (!activePipeline && piped.length) {
      setActivePipeline(piped.find((p) => p.is_default)?.id ?? piped[0].id);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);
  useRealtimeTable("pipelines", () => void load());
  useRealtimeTable("pipeline_stages", () => void load());

  const currentStages = stages
    .filter((s) => s.pipeline_id === activePipeline)
    .sort((a, b) => a.order_index - b.order_index);

  const addStage = async () => {
    if (!activePipeline) return;
    const title = newStage.trim();
    if (!title) { toast.error("Введите название стадии"); return; }
    const key = title.toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "").slice(0, 40) || `s_${Date.now()}`;
    const order_index = currentStages.length ? Math.max(...currentStages.map((s) => s.order_index)) + 1 : 0;
    const { error } = await supabase.from("pipeline_stages").insert({
      pipeline_id: activePipeline, key, title, order_index, color: "primary", icon: "zap", is_terminal: false,
    });
    if (error) { toast.error(error.message); return; }
    setNewStage("");
    await load();
  };

  const removeStage = async (id: string) => {
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { setStages((prev) => prev.filter((s) => s.id !== id)); toast.success("Стадия удалена"); }
  };

  const updateStage = async (id: string, patch: Partial<Stage>) => {
    const { error } = await supabase.from("pipeline_stages").update(patch as never).eq("id", id);
    if (error) toast.error(error.message);
    else {
      setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      if (patch.title) toast.success("Название сохранено");
    }
  };

  const toggleDiagnostic = async (id: string, value: boolean) => {
    await updateStage(id, { is_diagnostic: value });
    toast.success(value ? "Этап помечен как диагностика" : "Снят флаг диагностики");
  };

  const moveStage = async (id: string, dir: -1 | 1) => {
    const idx = currentStages.findIndex((s) => s.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= currentStages.length) return;
    const a = currentStages[idx];
    const b = currentStages[swapIdx];
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("pipeline_stages").update({ order_index: b.order_index } as never).eq("id", a.id),
      supabase.from("pipeline_stages").update({ order_index: a.order_index } as never).eq("id", b.id),
    ]);
    if (e1 || e2) toast.error(e1?.message ?? e2?.message ?? "Не удалось изменить порядок");
    else await load();
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
          <GitBranch className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Воронки и стадии</h2>
          <p className="text-xs text-muted-foreground">
            Цвет колонки на доске CRM, порядок этапов и скрытие с Kanban
          </p>
        </div>
      </div>

      {!isAdmin && (
        <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Только администратор может изменять воронки.
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Загрузка…</div>
      ) : pipelines.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-border/60 py-10 text-center text-xs text-muted-foreground">
          Воронки ещё не созданы.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {pipelines.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePipeline(p.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  activePipeline === p.id ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:bg-secondary/40"
                }`}
              >
                {p.name}
                {p.is_default && <Badge variant="outline" className="ml-2 text-[9px]">по умолчанию</Badge>}
              </button>
            ))}
          </div>

          <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              placeholder="Новая стадия"
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStage()}
              disabled={!isAdmin}
            />
            <Button onClick={addStage} className="gap-2" disabled={!isAdmin}>
              <Plus className="h-4 w-4" /> Добавить стадию
            </Button>
          </div>

          <div className="space-y-1.5">
            {currentStages.map((s, idx) => (
              <div key={s.id} className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 sm:grid-cols-[auto_1fr_auto_auto_auto_auto] sm:items-center">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-secondary text-xs font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 space-y-1.5">
                  <Input
                    defaultValue={s.title}
                    key={`${s.id}-${s.title}`}
                    onBlur={(e) => {
                      const title = e.target.value.trim();
                      if (title && title !== s.title) void updateStage(s.id, { title });
                    }}
                    disabled={!isAdmin}
                    className="h-8 text-sm"
                  />
                  <div className="truncate text-[10px] text-muted-foreground">{s.key}</div>
                </div>
                <StageColorSelect
                  value={s.color}
                  onChange={(v) => void updateStage(s.id, { color: v })}
                  disabled={!isAdmin}
                />
                <div className="flex flex-col items-center gap-0.5" title="Скрыть колонку на Kanban (этап останется в CRM)">
                  <span className="text-[9px] text-muted-foreground">Скрыть</span>
                  <Switch
                    checked={s.is_hidden}
                    onCheckedChange={(v) => void updateStage(s.id, { is_hidden: v })}
                    disabled={!isAdmin}
                  />
                </div>
                <button
                  onClick={() => toggleDiagnostic(s.id, !s.is_diagnostic)}
                  disabled={!isAdmin}
                  className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] uppercase tracking-wider transition-colors disabled:opacity-40 ${
                    s.is_diagnostic
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                      : "border-border/60 text-muted-foreground hover:bg-secondary"
                  }`}
                  title="Переход в этот этап считается записью на диагностику"
                >
                  <Stethoscope className="h-3 w-3" />
                  Диагн.
                </button>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => void moveStage(s.id, -1)}
                    disabled={!isAdmin || idx === 0}
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-40"
                    aria-label="Выше"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveStage(s.id, 1)}
                    disabled={!isAdmin || idx === currentStages.length - 1}
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-40"
                    aria-label="Ниже"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeStage(s.id)}
                    disabled={!isAdmin || s.is_terminal}
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
