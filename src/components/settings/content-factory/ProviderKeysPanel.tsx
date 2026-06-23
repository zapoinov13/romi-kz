import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, CheckCircle2, AlertCircle, Loader2, KeyRound, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useContentFactoryProviders } from "@/hooks/useContentFactoryProviders";
import { PROVIDER_LABELS, PROVIDER_HELP, type ContentFactoryProvider } from "@/lib/contentFactoryDefaults";

const ALL_PROVIDERS: ContentFactoryProvider[] = ["kie_ai", "gemini", "openai"];

function formatBalance(provider: ContentFactoryProvider, info: unknown): string | null {
  if (!info || typeof info !== "object") return null;
  const b: any = info;
  const amount = typeof b.amount === "number" && Number.isFinite(b.amount) ? b.amount : null;
  if (amount === null) return b.note ?? null;
  const unit = b.unit || (provider === "openai" ? "USD" : "credits");
  const pretty = amount.toLocaleString("ru-RU", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (unit === "USD") return `$${pretty}`;
  return `${pretty} ${unit === "credits" ? "кредитов" : unit}`;
}

function formatChecked(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return null; }
}

export function ProviderKeysPanel({ projectId }: { projectId: string | null }) {
  const { rows, loading, save, test, remove, setPriority, toggleEnabled } = useContentFactoryProviders(projectId);
  const [adding, setAdding] = useState<ContentFactoryProvider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<ContentFactoryProvider | null>(null);

  const rowsByProvider = new Map(rows.map((r) => [r.provider, r]));

  const handleSave = async () => {
    if (!adding || !apiKey.trim()) return;
    setBusy(true);
    try {
      const nextPriority = (rows[rows.length - 1]?.priority ?? 90) + 10;
      await save(adding, apiKey.trim(), nextPriority);
      toast.success(`${PROVIDER_LABELS[adding]} подключён`);
      setAdding(null); setApiKey("");
    } catch (e: any) {
      toast.error(e?.message || "Ключ не прошёл проверку");
    } finally { setBusy(false); }
  };

  const handleTest = async (p: ContentFactoryProvider) => {
    setTesting(p);
    try {
      const r: any = await test(p);
      if (r?.ok) toast.success(`${PROVIDER_LABELS[p]}: ключ работает`);
      else toast.error(`${PROVIDER_LABELS[p]}: ${r?.error || "ошибка"}`);
    } catch (e: any) { toast.error(e?.message || "Ошибка"); }
    finally { setTesting(null); }
  };

  const handleMove = async (p: ContentFactoryProvider, dir: -1 | 1) => {
    const sorted = [...rows].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((r) => r.provider === p);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    const me = sorted[idx];
    await setPriority(me.provider, swapWith.priority);
    await setPriority(swapWith.provider, me.priority);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> AI-провайдеры
        </CardTitle>
        <CardDescription>
          Контент-завод использует ключи в порядке приоритета. Если у первого закончились токены или произошла ошибка — автоматически переходит к следующему.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!projectId && (
          <div className="text-sm text-muted-foreground">Выберите активный проект.</div>
        )}
        {projectId && ALL_PROVIDERS.map((p) => {
          const row = rowsByProvider.get(p);
          const sortedIdx = row ? [...rows].sort((a, b) => a.priority - b.priority).findIndex(r => r.provider === p) : -1;
          return (
            <div key={p} className="flex flex-col gap-2 rounded-lg border bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="font-medium">{PROVIDER_LABELS[p]}</div>
                {row ? (
                  <>
                    <Badge variant="outline" className="font-mono text-xs">{row.key_hint}</Badge>
                    {row.status === "ok" && <Badge className="gap-1 bg-success/15 text-success border-success/40"><CheckCircle2 className="h-3 w-3"/>Работает</Badge>}
                    {row.status === "error" && <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3"/>Ошибка</Badge>}
                    {row.status === "quota" && <Badge className="gap-1 bg-warning/15 text-warning border-warning/40"><AlertCircle className="h-3 w-3"/>Нет токенов</Badge>}
                    {row.status === "unknown" && <Badge variant="outline">Не проверен</Badge>}
                    {(() => {
                      const bal = formatBalance(p, row.balance_info);
                      if (!bal) return null;
                      const checked = formatChecked(row.last_checked_at);
                      return (
                        <Badge variant="outline" className="gap-1 border-primary/40 text-primary" title={checked ? `Проверено ${checked}` : undefined}>
                          Баланс: {bal}
                        </Badge>
                      );
                    })()}
                  </>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Не подключён</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row ? (
                  <>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" disabled={sortedIdx <= 0} onClick={() => handleMove(p, -1)} title="Выше"><ArrowUp className="h-4 w-4"/></Button>
                      <Button size="icon" variant="ghost" disabled={sortedIdx === rows.length - 1} onClick={() => handleMove(p, 1)} title="Ниже"><ArrowDown className="h-4 w-4"/></Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch checked={row.is_enabled} onCheckedChange={(v) => toggleEnabled(p, v)} />
                      <span className="text-xs text-muted-foreground">вкл</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleTest(p)} disabled={testing === p}>
                      {testing === p ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>}
                      <span className="ml-1">Тест</span>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(p)}>Заменить</Button>
                    <Button size="icon" variant="ghost" onClick={async () => {
                      if (!confirm(`Удалить ключ ${PROVIDER_LABELS[p]}?`)) return;
                      try { await remove(p); toast.success("Удалено"); }
                      catch (e: any) { toast.error(e?.message || "Ошибка"); }
                    }}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => setAdding(p)}>Подключить</Button>
                )}
              </div>
            </div>
          );
        })}
        {loading && <div className="text-xs text-muted-foreground">Загрузка…</div>}
      </CardContent>

      <Dialog open={!!adding} onOpenChange={(o) => !o && (setAdding(null), setApiKey(""))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{adding ? `Подключить ${PROVIDER_LABELS[adding]}` : ""}</DialogTitle>
            <DialogDescription>{adding ? PROVIDER_HELP[adding] : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>API-ключ</Label>
            <Input
              type="password"
              autoComplete="off"
              placeholder="sk-... / AIza... / ваш ключ"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Ключ шифруется перед сохранением и не отображается в открытом виде.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAdding(null); setApiKey(""); }}>Отмена</Button>
            <Button onClick={handleSave} disabled={busy || !apiKey.trim()}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>}
              Сохранить и проверить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}