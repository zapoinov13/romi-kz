import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Crosshair,
  Facebook,
  Link2,
  Loader2,
  MessageSquare,
  Shield,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEFAULT_META_UTM_TEMPLATE } from "@/lib/utmDefaults";
import type { AdCabinet } from "@/types/ads";
import type { AvailableMetaAdAccount } from "@/hooks/useMetaAdAccounts";
import { useMetaPageAssets } from "@/hooks/useMetaPageAssets";
import { AddCabinetPickStep } from "@/components/ads/AddCabinetPickStep";

interface AddCabinetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (cabinet: AdCabinet) => void;
  existingActIds?: string[];
  initialStep?: Step;
}

type CheckItem = { ok: boolean; label: string; detail?: string };
type Step = "pick" | "configure";

const FieldLabel = ({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <Label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
    {Icon && <Icon className="h-3.5 w-3.5" />}
    {children}
  </Label>
);

const AddCabinetDialog = ({
  open,
  onOpenChange,
  onCreate,
  existingActIds = [],
  initialStep = "pick",
}: AddCabinetDialogProps) => {
  const [step, setStep] = useState<Step>(initialStep);
  const [selectedMeta, setSelectedMeta] = useState<AvailableMetaAdAccount | null>(null);
  const [currency, setCurrency] = useState("USD");

  const [name, setName] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [instagramId, setInstagramId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [validating, setValidating] = useState(false);
  const [checks, setChecks] = useState<CheckItem[] | null>(null);

  const pagesAssets = useMetaPageAssets({
    kind: "pages",
    actId: adAccountId,
    enabled: step === "configure" && !!adAccountId,
  });
  const pixelsAssets = useMetaPageAssets({
    kind: "pixels",
    actId: adAccountId,
    enabled: step === "configure" && !!adAccountId,
  });
  const igAssets = useMetaPageAssets({
    kind: "instagram",
    pageId: pageId || undefined,
    enabled: step === "configure" && !!pageId,
  });

  const reset = useCallback(() => {
    setSelectedMeta(null);
    setCurrency("USD");
    setName("");
    setAdAccountId("");
    setPageId("");
    setPageName("");
    setInstagramId("");
    setAccessToken("");
    setPixelId("");
    setWebsiteUrl("");
    setChecks(null);
    setValidating(false);
  }, []);

  const applyMetaAccount = (acc: AvailableMetaAdAccount) => {
    setSelectedMeta(acc);
    setAdAccountId(acc.id);
    setName(acc.name);
    setCurrency(acc.currency || "USD");
    setPageId("");
    setPageName("");
    setInstagramId("");
    setStep("configure");
  };

  useEffect(() => {
    if (!open) return;
    reset();
    setStep(initialStep);
  }, [open, initialStep, reset]);

  useEffect(() => {
    if (step !== "configure") return;
    if (!pageId && pagesAssets.data.length > 0) {
      const p = pagesAssets.data[0];
      setPageId(p.id);
      setPageName(p.name);
      if (p.website) setWebsiteUrl((prev) => prev || p.website!);
      if (p.instagram_id) setInstagramId((prev) => prev || p.instagram_id!);
    }
  }, [step, pagesAssets.data, pageId]);

  useEffect(() => {
    if (!pageId) return;
    const p = pagesAssets.data.find((x) => x.id === pageId);
    if (!p) return;
    setPageName(p.name);
    if (p.website) setWebsiteUrl((prev) => prev || p.website!);
    if (p.instagram_id) setInstagramId((prev) => prev || p.instagram_id!);
  }, [pageId, pagesAssets.data]);

  useEffect(() => {
    if (step !== "configure" || instagramId) return;
    if (igAssets.data.length > 0) {
      setInstagramId((igAssets.data[0] as { id: string }).id);
    }
  }, [step, igAssets.data, instagramId]);

  useEffect(() => {
    if (step !== "configure" || pixelId) return;
    if (pixelsAssets.data.length > 0) {
      setPixelId(pixelsAssets.data[0].id);
    }
  }, [step, pixelsAssets.data, pixelId]);

  const runValidation = async () => {
    if (!adAccountId.trim()) {
      toast.error("Укажите ID кабинета");
      return;
    }
    setValidating(true);
    setChecks(null);
    try {
      const { data, error } = await supabase.functions.invoke("meta-validate-cabinet", {
        body: {
          adAccountId: adAccountId.trim(),
          pageId: pageId.trim() || undefined,
          pixelId: pixelId.trim() || undefined,
          instagramId: instagramId.trim() || undefined,
          accessToken: accessToken.trim() || undefined,
        },
      });
      if (error) throw error;
      setChecks(data?.checks ?? []);
      if (data?.ok) toast.success("Все данные кабинета проверены");
      else toast.error("Есть ошибки в данных кабинета");
    } catch (e) {
      toast.error((e as Error).message || "Ошибка проверки");
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Укажите название кабинета");
      return;
    }
    if (!adAccountId.trim()) {
      toast.error("Выберите кабинет Meta");
      return;
    }
    onCreate({
      id: crypto.randomUUID(),
      name: name.toUpperCase(),
      externalId: adAccountId,
      online: true,
      type: "Личный",
      spend: 0,
      leads: 0,
      leadCost: 0,
      sales: 0,
      revenue: 0,
      dailyBudget: 0,
      currency: currency || "USD",
      adAccountId,
      pageId: pageId || undefined,
      pageName: pageName || undefined,
      instagramId: instagramId || undefined,
      pixelId: pixelId || undefined,
      pixelEvent: "Lead",
      websiteUrl: websiteUrl || undefined,
      utmTemplate: DEFAULT_META_UTM_TEMPLATE,
      accessToken: accessToken || undefined,
    });
    onOpenChange(false);
    reset();
  };

  const inputCls = "h-11 rounded-xl bg-background/60";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-xl overflow-hidden border-border/60 bg-card p-0">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Crosshair className="h-5 w-5 text-success" />
              {step === "pick" ? "Быстрое подключение Meta" : "Кабинет Meta"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {step === "pick"
                ? "Выберите рекламный кабинет - остальное подтянется автоматически"
                : "Бюджет, гео и креативы задаются при запуске кампании"}
            </DialogDescription>
          </DialogHeader>

          {step === "pick" ? (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <AddCabinetPickStep
                  active={open}
                  existingActIds={existingActIds}
                  accessToken={accessToken}
                  onAccessTokenChange={setAccessToken}
                  onSelect={applyMetaAccount}
                  onManual={() => setStep("configure")}
                />
              </div>
              <div className="border-t border-border/60 px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => setStep("configure")}
                >
                  Ввести ID вручную
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 gap-1"
                  onClick={() => setStep("pick")}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Выбрать другой кабинет
                </Button>

                <div className="space-y-1.5">
                  <FieldLabel>Название</FieldLabel>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например: TAREDA BM2"
                    className={inputCls}
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel icon={Shield}>
                    <span className="flex items-center gap-1.5">
                      <Facebook className="h-3.5 w-3.5" /> Ad Account
                    </span>
                  </FieldLabel>
                  <Input
                    value={adAccountId}
                    onChange={(e) => setAdAccountId(e.target.value)}
                    placeholder="act_..."
                    className={cn(inputCls, "font-mono text-sm")}
                    readOnly={!!selectedMeta}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel icon={Link2}>Страница</FieldLabel>
                    <Select
                      value={pageId || "__none__"}
                      onValueChange={(v) => {
                        if (v === "__none__") {
                          setPageId("");
                          setPageName("");
                          setInstagramId("");
                          return;
                        }
                        setPageId(v);
                        setInstagramId("");
                      }}
                    >
                      <SelectTrigger className={inputCls}>
                        <SelectValue placeholder={pagesAssets.isLoading ? "Загрузка…" : "Позже"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Позже</SelectItem>
                        {pagesAssets.data.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel icon={MessageSquare}>Instagram</FieldLabel>
                    {igAssets.data.length > 0 ? (
                      <Select
                        value={instagramId || "__none__"}
                        onValueChange={(v) => setInstagramId(v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className={inputCls}>
                          <SelectValue placeholder="Позже" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Позже</SelectItem>
                          {igAssets.data.map((ig) => (
                            <SelectItem key={(ig as { id: string }).id} value={(ig as { id: string }).id}>
                              @{(ig as { username?: string; id: string }).username ?? (ig as { id: string }).id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={instagramId}
                        onChange={(e) => setInstagramId(e.target.value)}
                        placeholder={pageId ? "ID вручную" : "Сначала страница"}
                        className={inputCls}
                        disabled={!pageId}
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <FieldLabel icon={Crosshair}>Pixel</FieldLabel>
                  <Select
                    value={pixelId || "__none__"}
                    onValueChange={(v) => setPixelId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className={inputCls}>
                      <SelectValue placeholder="Позже" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Позже</SelectItem>
                      {pixelsAssets.data.map((px) => (
                        <SelectItem key={px.id} value={px.id}>{px.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={runValidation}
                  disabled={validating || !adAccountId}
                >
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Проверить доступ
                </Button>
                {checks && checks.length > 0 && (
                  <div className="space-y-1 rounded-xl border border-border/50 bg-muted/30 p-3">
                    {checks.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        {c.ok ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        )}
                        <span>{c.label}{c.detail ? ` - ${c.detail}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-border/60 px-6 py-4">
                <Button onClick={handleSubmit} className="h-12 w-full rounded-xl bg-success text-success-foreground hover:bg-success/90">
                  <Crosshair className="h-4 w-4" />
                  Подключить кабинет
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddCabinetDialog;
