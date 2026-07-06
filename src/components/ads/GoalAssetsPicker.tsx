import { useEffect, useMemo } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useMetaPageAssets } from "@/hooks/useMetaPageAssets";
import { normalizeWhatsAppNumber } from "@/lib/adsNaming";
import { resolveCabinetActId } from "@/lib/cabinetResolve";
import type { AdCabinet } from "@/types/ads";

type Goal = "whatsapp" | "site-leads" | "meta-form" | "traffic";

interface Props {
  goal: Goal;
  cabinet: AdCabinet | undefined;
  pageId?: string;
  whatsappId: string;
  setWhatsappId: (v: string) => void;
  pixelId: string;
  setPixelId: (v: string) => void;
  pixelEvent: string;
  setPixelEvent: (v: string) => void;
  leadFormId: string;
  setLeadFormId: (v: string) => void;
}

const FieldShell = ({
  label,
  isLoading,
  error,
  onRefresh,
  children,
}: {
  label: string;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  children: React.ReactNode;
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
        Обновить
      </Button>
    </div>
    {error ? (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    ) : (
      children
    )}
  </div>
);

const GoalAssetsPicker = ({
  goal,
  cabinet,
  pageId: pageIdProp,
  whatsappId,
  setWhatsappId,
  pixelId,
  setPixelId,
  pixelEvent,
  setPixelEvent,
  leadFormId,
  setLeadFormId,
}: Props) => {
  const actId = resolveCabinetActId(cabinet);
  const pageId = pageIdProp || cabinet?.pageId;
  const cabinetId = cabinet?.id;

  const wa = useMetaPageAssets({
    kind: "whatsapp",
    pageId,
    actId,
    cabinetId,
    enabled: goal === "whatsapp" && (!!pageId || !!actId || !!cabinetId),
  });

  const pixels = useMetaPageAssets({
    kind: "pixels",
    actId,
    cabinetId,
    enabled: goal === "site-leads" && (!!actId || !!cabinetId),
  });

  const events = useMetaPageAssets({
    kind: "pixel_events",
    pixelId,
    enabled: goal === "site-leads" && !!pixelId,
  });

  const forms = useMetaPageAssets({
    kind: "lead_forms",
    pageId,
    cabinetId,
    enabled: goal === "meta-form" && !!pageId,
  });

  const waOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; display_phone_number: string; verified_name?: string }> = [];
    const push = (raw: string, label?: string) => {
      const phoneValue = normalizeWhatsAppNumber(raw);
      if (!phoneValue || phoneValue.length < 10 || seen.has(phoneValue)) return;
      seen.add(phoneValue);
      out.push({
        id: phoneValue,
        display_phone_number: raw.trim() || phoneValue,
        verified_name: label,
      });
    };
    for (const p of wa.data) push(p.display_phone_number, p.verified_name);
    if (cabinet?.whatsappNumber) push(cabinet.whatsappNumber, "из карточки кабинета");
    return out;
  }, [wa.data, cabinet?.whatsappNumber]);

  const pixelOptions = useMemo(() => {
    const seen = new Set(pixels.data.map((p) => p.id));
    const out = [...pixels.data];
    const saved = cabinet?.pixelId?.trim();
    if (saved && !seen.has(saved)) {
      out.unshift({ id: saved, name: `${saved} (из кабинета)`, last_fired_time: null });
    }
    return out;
  }, [pixels.data, cabinet?.pixelId]);

  const formOptions = useMemo(() => {
    const seen = new Set(forms.data.map((f) => f.id));
    const out = [...forms.data];
    const saved = cabinet?.leadFormId?.trim();
    if (saved && !seen.has(saved)) {
      out.unshift({ id: saved, name: `${saved} (из кабинета)`, status: "ACTIVE", leads_count: 0 });
    }
    return out;
  }, [forms.data, cabinet?.leadFormId]);

  useEffect(() => {
    if (goal !== "whatsapp" || whatsappId) return;
    const saved = cabinet?.whatsappNumber?.trim();
    if (saved) {
      setWhatsappId(normalizeWhatsAppNumber(saved));
      return;
    }
    if (waOptions.length === 1) setWhatsappId(waOptions[0].id);
  }, [goal, whatsappId, cabinet?.whatsappNumber, waOptions, setWhatsappId]);

  useEffect(() => {
    if (goal !== "site-leads" || pixelId) return;
    const saved = cabinet?.pixelId?.trim();
    if (saved) {
      setPixelId(saved);
      return;
    }
    if (pixelOptions.length === 1) setPixelId(pixelOptions[0].id);
  }, [goal, pixelId, cabinet?.pixelId, pixelOptions, setPixelId]);

  useEffect(() => {
    if (goal === "site-leads" && cabinet?.pixelEvent && !pixelEvent) {
      setPixelEvent(cabinet.pixelEvent);
    }
  }, [goal, cabinet?.pixelEvent, pixelEvent, setPixelEvent]);

  useEffect(() => {
    if (goal !== "meta-form" || leadFormId) return;
    const saved = cabinet?.leadFormId?.trim();
    if (saved) {
      setLeadFormId(saved);
      return;
    }
    if (formOptions.length === 1) setLeadFormId(formOptions[0].id);
  }, [goal, leadFormId, cabinet?.leadFormId, formOptions, setLeadFormId]);

  if (!cabinet) return null;
  if (goal === "traffic") return null;

  if (goal === "whatsapp") {
    if (!pageId && !actId && !cabinetId) {
      return (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
          Заполните Page ID или Ad Account ID в настройках кабинета — без них нельзя получить WhatsApp-номера.
        </div>
      );
    }
    return (
      <FieldShell
        label="WhatsApp номер"
        isLoading={wa.isLoading}
        error={wa.error}
        onRefresh={wa.refetch}
      >
        <Select value={whatsappId} onValueChange={setWhatsappId}>
          <SelectTrigger className="h-12 rounded-xl bg-background/60">
            <SelectValue
              placeholder={
                wa.isLoading
                  ? "Загрузка..."
                  : waOptions.length === 0
                    ? "Нет привязанных номеров"
                    : `Выберите номер (${waOptions.length})`
              }
            />
          </SelectTrigger>
          <SelectContent>
            {waOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.display_phone_number}
                {p.verified_name ? ` — ${p.verified_name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {waOptions.length === 0 && !wa.isLoading && (
          <p className="text-[11px] text-muted-foreground">
            Если реклама уже идёт на WhatsApp — сохраните номер в карточке кабинета или подключите WABA в Meta.
          </p>
        )}
      </FieldShell>
    );
  }

  if (goal === "site-leads") {
    if (!actId && !cabinetId) {
      return (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
          Заполните Ad Account ID в настройках кабинета.
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <FieldShell
          label="Pixel"
          isLoading={pixels.isLoading}
          error={pixels.error}
          onRefresh={pixels.refetch}
        >
          <Select value={pixelId} onValueChange={setPixelId}>
            <SelectTrigger className="h-12 rounded-xl bg-background/60">
              <SelectValue
                placeholder={
                  pixels.isLoading
                    ? "Загрузка..."
                    : pixelOptions.length === 0
                      ? "У кабинета нет пикселей"
                      : "Выберите пиксель"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {pixelOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.last_fired_time ? " 🟢" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>

        {pixelId && (
          <FieldShell
            label="Событие пикселя"
            isLoading={events.isLoading}
            error={events.error}
            onRefresh={events.refetch}
          >
            <Select value={pixelEvent} onValueChange={setPixelEvent}>
              <SelectTrigger className="h-12 rounded-xl bg-background/60">
                <SelectValue
                  placeholder={
                    events.isLoading ? "Загрузка..." : "Выберите событие"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {events.data.map((e) => (
                  <SelectItem key={e.name} value={e.name}>
                    {e.name}
                    {e.count > 0 ? ` · ${e.count}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
        )}
      </div>
    );
  }

  if (!pageId) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
        Сначала выберите Facebook-страницу — лид-формы привязаны к странице.
      </div>
    );
  }
  return (
    <FieldShell
      label="Лид-форма"
      isLoading={forms.isLoading}
      error={forms.error}
      onRefresh={forms.refetch}
    >
      <Select value={leadFormId} onValueChange={setLeadFormId}>
        <SelectTrigger className="h-12 rounded-xl bg-background/60">
          <SelectValue
            placeholder={
              forms.isLoading
                ? "Загрузка..."
                : formOptions.length === 0
                  ? "У страницы нет лид-форм"
                  : "Выберите форму"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {formOptions.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
              {f.status === "ACTIVE" ? "" : ` (${f.status})`}
              {f.leads_count > 0 ? ` · ${f.leads_count}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
};

export default GoalAssetsPicker;
