import { useEffect, useState } from "react";
import { Facebook, CheckCircle2, Loader2, Plug, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type MetaToken = {
  id: string;
  label: string;
  fb_user_id: string | null;
  fb_user_name: string | null;
  created_at: string;
};

export function MetaConnectSettings() {
  const [tokens, setTokens] = useState<MetaToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [adding, setAdding] = useState(false);
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<MetaToken | null>(null);

  const load = async () => {
    setChecking(true);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke("meta-connect-token", {
      method: "GET",
    });
    if (err) setError(err.message);
    else setTokens(data?.tokens ?? []);
    setChecking(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!token.trim()) {
      toast.error("Введите Meta access token");
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke("meta-connect-token", {
      method: "POST",
      body: { token: token.trim(), label: label.trim() || "Meta аккаунт" },
    });
    setLoading(false);
    if (err || data?.error) {
      const msg = data?.error ?? err?.message ?? "Не удалось подключить";
      setError(msg);
      toast.error(msg);
      return;
    }
    toast.success(`Подключено: ${data.token?.fb_user_name ?? data.token?.label ?? ""}`);
    setToken("");
    setLabel("");
    setAdding(false);
    load();
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    const { data, error: err } = await supabase.functions.invoke("meta-connect-token", {
      method: "DELETE",
      body: {},
      headers: {},
    } as never);
    // supabase-js не пробрасывает query параметры — вызовем напрямую:
    if (err || data?.error) {
      // fallback через fetch
    }
    setLoading(false);
    setConfirmDel(null);
    load();
  };

  // прямой DELETE с query параметром
  const handleDeleteDirect = async (id: string) => {
    setLoading(true);
    try {
      const sess = await supabase.auth.getSession();
      const accessToken = sess.data.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-connect-token?id=${encodeURIComponent(id)}`;
      const r = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        toast.error(j?.error ?? "Не удалось удалить токен");
      } else {
        toast.success("Токен удалён");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setConfirmDel(null);
      load();
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
            <Facebook className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Facebook / Meta</h2>
            <p className="text-xs text-muted-foreground">
              Подключите один или несколько Meta access токенов - по одному на каждый Business Manager
            </p>
          </div>
        </div>
        {checking ? (
          <Badge variant="outline" className="gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Проверка…
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 border-success/40 bg-success/10 text-success">
            <CheckCircle2 className="h-3 w-3" /> {tokens.length} {tokens.length === 1 ? "токен" : "токена"}
          </Badge>
        )}
      </div>

      {tokens.length > 0 && (
        <div className="mb-4 space-y-2">
          {tokens.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <Facebook className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{t.label}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {t.fb_user_name ?? "—"}
                  {t.fb_user_id && <span className="ml-2 opacity-60">ID: {t.fb_user_id}</span>}
                </div>
              </div>
              <button
                onClick={() => setConfirmDel(t)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Удалить токен"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!adding ? (
        <Button onClick={() => setAdding(true)} variant="outline" className="gap-2">
          <Plus className="h-4 w-4" /> Добавить Meta токен
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Название (для удобства)
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Например: Основной BM"
              disabled={loading}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Meta Access Token (с правом <code>ads_read</code>)
            </label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAAB..."
              disabled={loading}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Получить токен:{" "}
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Graph API Explorer
              </a>
            </p>
          </div>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Подключить
            </Button>
            <Button
              variant="outline"
              onClick={() => { setAdding(false); setToken(""); setLabel(""); setError(null); }}
              disabled={loading}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить Meta токен?</AlertDialogTitle>
            <AlertDialogDescription>
              Токен «{confirmDel?.label}» будет удалён. Кабинеты, доступные только через него, перестанут отображаться.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDel && handleDeleteDirect(confirmDel.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
