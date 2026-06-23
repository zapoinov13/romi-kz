import { useEffect, useState } from "react";
import { Facebook, CheckCircle2, Loader2, Plug, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type MetaAccount = { id: string; name: string };

export function MetaConnectSettings() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [account, setAccount] = useState<MetaAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    setChecking(true);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke("meta-connect-token", {
      method: "GET",
    });
    if (err) {
      setError(err.message);
    } else if (data?.connected) {
      setAccount(data.account);
    } else {
      setAccount(null);
      if (data?.error) setError(data.error);
    }
    setChecking(false);
  };

  useEffect(() => { loadStatus(); }, []);

  const handleConnect = async () => {
    if (!token.trim()) {
      toast.error("Введите Meta access token");
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke("meta-connect-token", {
      method: "POST",
      body: { token: token.trim() },
    });
    setLoading(false);
    if (err || data?.error) {
      const msg = data?.error ?? err?.message ?? "Не удалось подключить";
      setError(msg);
      toast.error(msg);
      return;
    }
    setAccount(data.account);
    setToken("");
    toast.success(`Подключено: ${data.account?.name ?? ""}`);
  };

  const handleDisconnect = async () => {
    setLoading(true);
    const { error: err } = await supabase.functions.invoke("meta-connect-token", {
      method: "DELETE",
    });
    setLoading(false);
    if (err) { toast.error(err.message); return; }
    setAccount(null);
    toast.success("Meta отключён");
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
              Подключите Meta access token для рекламных кабинетов и CAPI
            </p>
          </div>
        </div>
        {checking ? (
          <Badge variant="outline" className="gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Проверка…
          </Badge>
        ) : account ? (
          <Badge variant="outline" className="gap-1.5 border-success/40 bg-success/10 text-success">
            <CheckCircle2 className="h-3 w-3" /> Подключено
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 border-border/60 text-muted-foreground">
            <XCircle className="h-3 w-3" /> Не подключено
          </Badge>
        )}
      </div>

      {account ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-success/30 bg-success/5 p-4">
            <div className="text-xs text-muted-foreground">Подключённый аккаунт</div>
            <div className="mt-1 text-sm font-semibold">{account.name}</div>
            <div className="text-xs text-muted-foreground">ID: {account.id}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadStatus} disabled={loading || checking}>
              Проверить
            </Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={loading}>
              Отключить
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
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
          <Button onClick={handleConnect} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Подключить
          </Button>
        </div>
      )}
    </section>
  );
}