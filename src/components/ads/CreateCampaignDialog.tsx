import { useEffect, useRef, useState } from "react";
import { Rocket, Upload, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
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
import { saveCampaign } from "@/hooks/useCabinetsStore";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { useMetaPageAssets } from "@/hooks/useMetaPageAssets";
import GoalAssetsPicker from "./GoalAssetsPicker";
import MessageTemplatesPanel from "./MessageTemplatesPanel";
import { cropImageFile, computeSourceRect, type Fit } from "@/lib/cropMedia";
import { GEO_COUNTRIES, findCountry } from "@/data/geoTargets";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, X } from "lucide-react";
import {
  CTA_BY_GOAL,
  GOAL_LABEL,
  buildAdName,
  buildAdsetName,
  buildCampaignName,
  buildCreativeName,
  defaultCtaForGoal,
  isHttpsUrl,
  normalizeWhatsAppNumber,
  type AdsGoal,
  type NamingContext,
} from "@/lib/adsNaming";

/** Быстро узнаём натуральный размер видео из <video preload="metadata">. */
function readVideoNaturalSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const size = { w: v.videoWidth, h: v.videoHeight };
      URL.revokeObjectURL(url);
      resolve(size);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать видео"));
    };
    v.src = url;
  });
}

/** Возвращает чистый base64 (без data:) JPEG из файла-картинки или кадра видео.
 *  Картинку и кадр уменьшаем до maxSide, чтобы не раздуть payload. */
async function fileToAnalyzableJpegBase64(file: File, maxSide = 1280): Promise<string> {
  const isVideo = file.type.startsWith("video/");
  const url = URL.createObjectURL(file);
  try {
    if (isVideo) {
      return await new Promise<string>((resolve, reject) => {
        const v = document.createElement("video");
        v.preload = "auto";
        v.muted = true;
        v.playsInline = true;
        v.src = url;
        const fail = (msg: string) => reject(new Error(msg));
        v.onerror = () => fail("Не удалось прочитать видео");
        v.onloadedmetadata = () => {
          try { v.currentTime = Math.min(0.3, (v.duration || 1) * 0.05); }
          catch { fail("seek error"); }
        };
        v.onseeked = () => {
          try {
            const vw = v.videoWidth, vh = v.videoHeight;
            if (!vw || !vh) return fail("empty video frame");
            const scale = Math.min(1, maxSide / Math.max(vw, vh));
            const w = Math.round(vw * scale), h = Math.round(vh * scale);
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            const ctx = c.getContext("2d");
            if (!ctx) return fail("no canvas");
            ctx.drawImage(v, 0, 0, w, h);
            const dataUrl = c.toDataURL("image/jpeg", 0.8);
            resolve(dataUrl.split(",")[1] || "");
          } catch (e) { fail(String((e as Error).message || e)); }
        };
        setTimeout(() => fail("timeout"), 15000);
      });
    }
    // image
    const img = new Image();
    img.src = url;
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("image load failed")); });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    return dataUrl.split(",")[1] || "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Извлечь несколько кадров из видео (start / middle / end). */
async function extractVideoFrames(file: File, count = 3, maxSide = 1024): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.src = url;
      const frames: string[] = [];
      const fail = (msg: string) => reject(new Error(msg));
      v.onerror = () => fail("Не удалось прочитать видео");
      v.onloadedmetadata = async () => {
        try {
          const dur = Math.max(0.1, v.duration || 1);
          const points: number[] = [];
          for (let i = 0; i < count; i++) {
            const pct = count === 1 ? 0.5 : 0.1 + (0.8 * i) / (count - 1);
            points.push(Math.min(dur - 0.05, dur * pct));
          }
          for (const t of points) {
            await new Promise<void>((res, rej) => {
              const onSeeked = () => {
                try {
                  const vw = v.videoWidth, vh = v.videoHeight;
                  if (!vw || !vh) return rej(new Error("empty frame"));
                  const scale = Math.min(1, maxSide / Math.max(vw, vh));
                  const w = Math.round(vw * scale), h = Math.round(vh * scale);
                  const c = document.createElement("canvas");
                  c.width = w; c.height = h;
                  const ctx = c.getContext("2d");
                  if (!ctx) return rej(new Error("no canvas"));
                  ctx.drawImage(v, 0, 0, w, h);
                  const dataUrl = c.toDataURL("image/jpeg", 0.75);
                  frames.push(dataUrl.split(",")[1] || "");
                  v.removeEventListener("seeked", onSeeked);
                  res();
                } catch (e) { rej(e as Error); }
              };
              v.addEventListener("seeked", onSeeked);
              try { v.currentTime = t; } catch (e) { rej(e as Error); }
            });
          }
          resolve(frames);
        } catch (e) { fail(String((e as Error).message || e)); }
      };
      setTimeout(() => fail("timeout"), 30000);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Прочитать файл как base64 (без data: префикса). */
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

/**
 * View-state, который ребёнок-CreativeUpload отдаёт наверх при каждом изменении.
 * Нужен, чтобы при сабмите «запечь» точно то, что видит пользователь.
 */
export interface CreativeViewState {
  ratio: "4:5" | "9:16";
  fit: Fit;
  zoom: number;
  pos: { x: number; y: number };
  /** Размер фрейма превью в css-пикселях. */
  frame: { w: number; h: number };
}

/** Ожидаем финальный статус запуска в ad_campaigns после таймаута HTTP. */
async function pollLaunchStatus(
  launchId: string,
  maxMs = 45_000,
): Promise<{ status: "success" | "error" | "pending"; error?: string }> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from("ad_campaigns")
      .select("status, last_error")
      .eq("launch_id", launchId)
      .maybeSingle();
    const st = data?.status;
    if (st === "success") return { status: "success" };
    if (st === "error") {
      return {
        status: "error",
        error: (data?.last_error as string | null) || "Ошибка запуска в Meta",
      };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { status: "pending" };
}

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cabinets: AdCabinet[];
}

type Goal = "whatsapp" | "site-leads" | "meta-form" | "traffic";

const GOALS: { id: Goal; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "site-leads", label: "Лиды с сайта" },
  { id: "meta-form", label: "Лид-форма Meta" },
  { id: "traffic", label: "Трафик" },
];

const CreativeUpload = ({
  label,
  ratio,
  file,
  onFile,
  onView,
}: {
  label: string;
  ratio: "4:5" | "9:16";
  file: File | null;
  onFile: (f: File | null) => void;
  onView?: (s: CreativeViewState) => void;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  const storageKey = file
    ? `creative-view:${ratio}:${file.name}:${file.size}:${file.lastModified}`
    : null;

  // Load file-bound view state (fit/zoom/pos) when file changes
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    let restored = false;
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const s = JSON.parse(raw) as {
            fit?: "contain" | "cover";
            zoom?: number;
            pos?: { x: number; y: number };
          };
          if (s.fit === "contain" || s.fit === "cover") setFit(s.fit);
          if (typeof s.zoom === "number") setZoom(s.zoom);
          if (s.pos && typeof s.pos.x === "number") setPos(s.pos);
          restored = true;
        }
      } catch {
        /* ignore */
      }
    }
    if (!restored) {
      setFit("contain");
      setZoom(1);
      setPos({ x: 0, y: 0 });
    }
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Persist on change
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ fit, zoom, pos }));
    } catch {
      /* ignore quota */
    }
  }, [storageKey, fit, zoom, pos]);

  // Меряем фрейм превью — нужно, чтобы пересчитать pos/zoom в координаты исходника.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setFrameSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewUrl]);

  // Прокидываем view-state наверх на каждое изменение.
  useEffect(() => {
    if (!onView) return;
    onView({ ratio, fit, zoom, pos, frame: frameSize });
  }, [ratio, fit, zoom, pos, frameSize, onView]);

  const isVideo = file?.type.startsWith("video/");
  const isImage = file?.type.startsWith("image/");
  const aspectClass = ratio === "9:16" ? "aspect-[9/16]" : "aspect-[4/5]";
  const canDrag = !!previewUrl && (fit === "cover" || zoom > 1);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canDrag) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.px + (e.clientX - dragRef.current.sx),
      y: dragRef.current.py + (e.clientY - dragRef.current.sy),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const checker =
    "bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]";

  const mediaStyle: React.CSSProperties = {
    transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
    transformOrigin: "center center",
    transition: dragRef.current ? "none" : "transform 0.05s linear",
  };
  const mediaClass = `absolute inset-0 h-full w-full ${
    fit === "cover" ? "object-cover" : "object-contain"
  } select-none pointer-events-none`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {previewUrl && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFit(fit === "contain" ? "cover" : "contain")}
              className="rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {fit === "contain" ? "Fit" : "Fill"}
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPos({ x: 0, y: 0 });
              }}
              className="rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          </div>
        )}
      </div>
      <div
        ref={frameRef}
        className={`relative w-full overflow-hidden rounded-2xl border-2 border-dashed border-border/70 ${aspectClass} ${
          previewUrl ? checker : "bg-background/40"
        }`}
      >
        {previewUrl && isImage && (
          <div
            className={`absolute inset-0 ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              src={previewUrl}
              alt={file?.name ?? "preview"}
              className={mediaClass}
              style={mediaStyle}
              draggable={false}
            />
          </div>
        )}
        {previewUrl && isVideo && (
          <div
            className={`absolute inset-0 ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <video
              src={previewUrl}
              className={mediaClass}
              style={mediaStyle}
              muted
              playsInline
              loop
              autoPlay
            />
          </div>
        )}
        {!previewUrl && (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Upload className="h-5 w-5" />
            <span className="text-sm">Загрузить {ratio}</span>
          </button>
        )}
        {file && (
          <>
            <button
              type="button"
              onClick={() => ref.current?.click()}
              className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-1 text-xs text-foreground shadow hover:bg-background"
            >
              Заменить
            </button>
            <button
              type="button"
              onClick={() => onFile(null)}
              className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-1 text-xs text-foreground shadow hover:bg-background"
            >
              ✕
            </button>
          </>
        )}
      </div>
      {previewUrl && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Zoom
          </span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 flex-1 accent-success"
          />
          <span className="w-8 text-right text-[10px] text-muted-foreground">
            {zoom.toFixed(2)}x
          </span>
        </div>
      )}
      {file && (
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {file.name}
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
};

const CreateCampaignDialog = ({
  open,
  onOpenChange,
  cabinets,
}: CreateCampaignDialogProps) => {
  const { activeId: projectId, active: activeProject } = useProjectsStore();
  const [cabinetId, setCabinetId] = useState<string>(cabinets[0]?.id ?? "");
  const [messageTemplateId, setMessageTemplateId] = useState<string | null>(null);
  const [goal, setGoal] = useState<Goal>("whatsapp");
  // "create" — стандартный мастер с загрузкой креатива.
  // "boost" — продвигаем уже опубликованный IG-пост (выбираем из ленты страницы).
  const [adMode, setAdMode] = useState<"create" | "boost">("create");
  const [boostMediaId, setBoostMediaId] = useState<string | null>(null);

  const [budget, setBudget] = useState("50");
  const [feed, setFeed] = useState<File | null>(null);
  const [stories, setStories] = useState<File | null>(null);
  // View-state каждого превью — обновляется коллбеком onView.
  const feedViewRef = useRef<CreativeViewState | null>(null);
  const storiesViewRef = useRef<CreativeViewState | null>(null);
  const [bakeStatus, setBakeStatus] = useState<string | null>(null);
  const [bakePct, setBakePct] = useState<number>(0);
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [cta, setCta] = useState<string>(defaultCtaForGoal("whatsapp"));
  const [aiGenStatus, setAiGenStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [aiGenError, setAiGenError] = useState<string | null>(null);

  const handleAiGenerateCopy = async () => {
    const source = feed ?? stories;
    if (!source) {
      toast.error("Сначала загрузите креатив (фото или видео)");
      return;
    }
    if (!projectId) {
      toast.error("Нет активного проекта");
      return;
    }
    setAiGenStatus("running");
    setAiGenError(null);
    try {
      const isVideo = source.type.startsWith("video/");
      const image_base64 = await fileToAnalyzableJpegBase64(source);
      let extra_frames_base64: string[] | undefined;
      let video_base64: string | undefined;
      let video_mime: string | undefined;

      if (isVideo) {
        try {
          const frames = await extractVideoFrames(source, 3, 1024);
          // первый кадр уже ушёл как image_base64 (он из ~5% длительности),
          // добавим только middle + end - этого достаточно, чтобы ИИ уловил суть видео
          extra_frames_base64 = frames.slice(1);
        } catch (e) {
          console.warn("[ai] extractVideoFrames failed:", e);
        }
        // Звук намеренно не отправляем: для рекламного описания хватает кадров,
        // полная транскрипция замедляет и удорожает генерацию.
        void video_base64;
        void video_mime;
      }

      const ctaList = CTA_BY_GOAL[goal as AdsGoal]?.map((c) => c.value) ?? [];
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        message?: string;
        headline?: string;
        primary_text?: string;
        description?: string;
        suggested_cta?: string;
      }>("ads-generate-copy", {
        body: {
          project_id: projectId,
          image_base64,
          mime: "image/jpeg",
          extra_frames_base64,
          video_base64,
          video_mime,
          goal,
          cta_options: ctaList,
          current_cta: cta,
          language: "ru",
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) {
        const msg = data?.message || data?.error || "Не удалось сгенерировать";
        throw new Error(msg);
      }
      if (data.headline) setHeadline(data.headline.slice(0, 40));
      if (data.primary_text) setPrimaryText(data.primary_text.slice(0, 500));
      if (data.description) setDescription(data.description.slice(0, 30));
      if (data.suggested_cta && ctaList.includes(data.suggested_cta)) {
        setCta(data.suggested_cta);
      }
      setAiGenStatus("done");
      toast.success("Тексты сгенерированы. Проверьте и поправьте при необходимости.");
    } catch (e: any) {
      const msg = e?.message || "Ошибка генерации";
      setAiGenError(msg);
      setAiGenStatus("error");
      if (msg.includes("no_openai_key") || msg.includes("Подключите ключ OpenAI")) {
        toast.error("Подключите ключ OpenAI в Настройках -> OpenAI");
      } else {
        toast.error(msg);
      }
    }
  };

  // Стабильный launchId на весь жизненный цикл диалога — нужен для имён.
  const [launchId] = useState<string>(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  // Имена сегментов запуска. dirty-флаги — чтобы автообновление шаблона
  // не затирало ручные правки пользователя.
  const [campaignName, setCampaignName] = useState("");
  const [adsetName, setAdsetName] = useState("");
  const [adName, setAdName] = useState("");
  const [campaignNameDirty, setCampaignNameDirty] = useState(false);
  const [adsetNameDirty, setAdsetNameDirty] = useState(false);
  const [adNameDirty, setAdNameDirty] = useState(false);
  const [whatsappId, setWhatsappId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [pixelEvent, setPixelEvent] = useState("Lead");
  const [leadFormId, setLeadFormId] = useState("");
  const [pageId, setPageId] = useState<string>("");
  const [websiteUrl, setWebsiteUrl] = useState<string>("");
  const [trafficUrl, setTrafficUrl] = useState<string>("");
  const [countryCode, setCountryCode] = useState<string>("KZ");
  const [cityKeys, setCityKeys] = useState<string[]>([]);
  const [ageMin, setAgeMin] = useState<number>(18);
  const [ageMax, setAgeMax] = useState<number>(55);
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [scheduleMode, setScheduleMode] = useState<"now" | "tomorrow">("tomorrow");

  const selectedCabinet = cabinets.find((c) => c.id === cabinetId);
  const selectedCountry = findCountry(countryCode);
  const selectedCities =
    selectedCountry?.cities.filter((c) => cityKeys.includes(c.key)) ?? [];
  // Для обратной совместимости — «основной» (первый) город.
  const selectedCity = selectedCities[0] ?? null;

  // Подгружаем список FB-страниц для выбранного рекламного кабинета —
  // менеджер может запустить рекламу от любой доступной странице, а не
  // только от той, что прописана в настройках клиента.
  const pagesAssets = useMetaPageAssets({
    kind: "pages",
    actId: selectedCabinet?.adAccountId,
    enabled: !!selectedCabinet?.adAccountId,
  });

  // При смене кабинета сбрасываем выбранную страницу на дефолтную из настроек кабинета.
  useEffect(() => {
    setPageId(selectedCabinet?.pageId ?? "");
    setWebsiteUrl(selectedCabinet?.websiteUrl ?? "");
  }, [cabinetId, selectedCabinet?.pageId, selectedCabinet?.websiteUrl]);

  // Если в списке доступных страниц нет текущей — но дефолт из настроек уже задан,
  // оставляем; иначе автоматически выбираем первую из списка.
  useEffect(() => {
    if (pageId) return;
    if (pagesAssets.data.length > 0) setPageId(pagesAssets.data[0].id);
  }, [pagesAssets.data, pageId]);

  // «Эффективная» страница — то, что реально уйдёт в запуск.
  const effectivePageId = pageId || selectedCabinet?.pageId || "";
  const effectivePageName =
    pagesAssets.data.find((p) => p.id === effectivePageId)?.name ??
    selectedCabinet?.pageName ?? "";

  // IG-аккаунт привязанный к выбранной странице.
  const effectiveInstagramId =
    pagesAssets.data.find((p) => p.id === effectivePageId)?.instagram_id ??
    selectedCabinet?.instagramId ?? "";

  // Список существующих публикаций IG — нужен только для режима «продвигать».
  const igMediaAssets = useMetaPageAssets({
    kind: "ig_media",
    igId: effectiveInstagramId,
    enabled: adMode === "boost" && !!effectiveInstagramId,
  });

  // При смене кабинета сбрасываем выбранный пост.
  useEffect(() => {
    setBoostMediaId(null);
  }, [cabinetId, effectiveInstagramId, adMode]);


  const [submitting, setSubmitting] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    cabinet?: string;
    goal: string;
    budget: string;
    currencySymbol: string;
    rows: { label: string; value: string }[];
  } | null>(null);

  const LAUNCH_BASE = import.meta.env.VITE_SUPABASE_URL as string;
  const LAUNCH_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const WEBHOOK_URL = `${LAUNCH_BASE}/functions/v1/launch-campaign`;

  // ===== Авто-нейминг: пересобираем имена при смене параметров (если не переопределены) =====
  const namingCtx: NamingContext = {
    goal: goal as AdsGoal,
    projectName: activeProject?.name ?? null,
    cabinetName: selectedCabinet?.name ?? null,
    countryName: selectedCountry?.name ?? null,
    countryCode,
    cityName: selectedCities[0]?.name ?? null,
    ageMin,
    ageMax,
    gender,
    launchId,
    creativeLabel: (feed?.type || stories?.type || "").startsWith("video/") ? "video" : "photo",
  };
  const autoCampaignName = buildCampaignName(namingCtx);
  const autoAdsetName = buildAdsetName(namingCtx);
  const autoAdName = buildAdName(namingCtx);

  useEffect(() => {
    if (!campaignNameDirty) setCampaignName(autoCampaignName);
    if (!adsetNameDirty) setAdsetName(autoAdsetName);
    if (!adNameDirty) setAdName(autoAdName);
  }, [autoCampaignName, autoAdsetName, autoAdName, campaignNameDirty, adsetNameDirty, adNameDirty]);

  // При смене цели — сбрасываем CTA на дефолт для новой цели, если текущий невалиден.
  useEffect(() => {
    const allowed = CTA_BY_GOAL[goal as AdsGoal].map((c) => c.value);
    if (!allowed.includes(cta)) setCta(defaultCtaForGoal(goal as AdsGoal));
  }, [goal, cta]);

  const handleSubmit = async () => {
    if (!cabinetId) {
      toast.error("Выберите клиента");
      return;
    }
    if (goal === "whatsapp" && !whatsappId) {
      toast.error("Выберите WhatsApp номер");
      return;
    }
    if (goal === "whatsapp") {
      const digits = normalizeWhatsAppNumber(whatsappId);
      if (digits.length < 10) {
        toast.error("WhatsApp номер должен содержать минимум 10 цифр (например, 77001234567)");
        return;
      }
    }
    if (goal === "site-leads" && (!pixelId || !pixelEvent)) {
      toast.error("Выберите пиксель и событие");
      return;
    }
    if (goal === "site-leads") {
      const url = websiteUrl.trim() || selectedCabinet?.websiteUrl || "";
      if (!url || !isHttpsUrl(url)) {
        toast.error("Укажите ссылку на сайт в формате https://…");
        return;
      }
    }
    if (goal === "meta-form" && !leadFormId) {
      toast.error("Выберите лид-форму");
      return;
    }
    if (goal === "traffic") {
      const url = trafficUrl.trim() || selectedCabinet?.websiteUrl || "";
      if (!url || !isHttpsUrl(url)) {
        toast.error("Укажите ссылку для трафика в формате https://…");
        return;
      }
    }
    if (adMode === "create") {
      if (!headline.trim()) { toast.error("Введите заголовок объявления"); return; }
      if (!primaryText.trim()) { toast.error("Введите основной текст объявления"); return; }
    }
    if (!campaignName.trim() || !adsetName.trim() || !adName.trim()) {
      toast.error("Имена кампании / группы / объявления не могут быть пустыми");
      return;
    }
    if (adMode === "create") {
      if (!feed && !stories) {
        toast.error("Загрузите хотя бы один креатив (лента или сторис)");
        return;
      }
    } else {
      if (!boostMediaId) {
        toast.error("Выберите публикацию Instagram для продвижения");
        return;
      }
    }

    if (!countryCode) {
      toast.error("Выберите страну");
      return;
    }
    if (ageMin > ageMax) {
      toast.error("Возраст от не может быть больше возраста до");
      return;
    }

    const cab = selectedCabinet;

    // ===== Запекаем кроп/зум/позицию пользователя в готовые файлы =====
    // Картинки — мгновенно через canvas. Видео — через ffmpeg.wasm
    // (загрузка ядра при первом запуске, дальше — кешируется).
    setSubmitting(true);
    let bakedFeed: File | null = feed;
    let bakedStories: File | null = stories;
    // Метаданные кропа для видео (n8n обрежет ffmpeg-ом за пару секунд).
    let feedCropMeta: Record<string, unknown> | null = null;
    let storiesCropMeta: Record<string, unknown> | null = null;
    try {
      const bake = async (
        f: File | null,
        view: CreativeViewState | null,
        slotLabel: string,
      ): Promise<{ file: File | null; cropMeta: Record<string, unknown> | null }> => {
        if (!f || !view || !view.frame.w || !view.frame.h) {
          return { file: f, cropMeta: null };
        }
        const params = {
          ratio: view.ratio,
          fit: view.fit,
          zoom: view.zoom,
          pos: view.pos,
          frame: view.frame,
        };
        // Картинки: режем canvas-ом — миллисекунды, без блокировок.
        if (f.type.startsWith("image/")) {
          setBakeStatus(`Готовим ${slotLabel}...`);
          const baked = await cropImageFile(f, params);
          return { file: baked, cropMeta: null };
        }
        // Видео: НЕ кодируем в браузере (медленно). Шлём оригинал + crop,
        // n8n выполнит ffmpeg на сервере (≈2–5 сек на 30-сек видео).
        if (f.type.startsWith("video/")) {
          setBakeStatus(`Готовим видео ${slotLabel}...`);
          const natural = await readVideoNaturalSize(f);
          const rect = computeSourceRect({ ...params, natural });
          return {
            file: f,
            cropMeta: {
              ratio: view.ratio,
              fit: view.fit,
              zoom: view.zoom,
              pos: view.pos,
              frame: view.frame,
              natural,
              // Готовый прямоугольник в пикселях исходника + размер выхода —
              // чтобы n8n мог напрямую: ffmpeg -vf "crop=W:H:X:Y,scale=oW:oH"
              ffmpeg: {
                crop: { w: Math.round(rect.sw), h: Math.round(rect.sh), x: Math.round(rect.sx), y: Math.round(rect.sy) },
                scale: { w: rect.outW, h: rect.outH },
                filter: `crop=${Math.round(rect.sw)}:${Math.round(rect.sh)}:${Math.round(rect.sx)}:${Math.round(rect.sy)},scale=${rect.outW}:${rect.outH}`,
              },
            },
          };
        }
        return { file: f, cropMeta: null };
      };

      // Параллелим feed и stories — обычно это два независимых файла.
      setBakePct(50);
      const [feedRes, storiesRes] = await Promise.all([
        bake(feed, feedViewRef.current, "ленту 4:5"),
        bake(stories, storiesViewRef.current, "сторис 9:16"),
      ]);
      bakedFeed = feedRes.file;
      feedCropMeta = feedRes.cropMeta;
      bakedStories = storiesRes.file;
      storiesCropMeta = storiesRes.cropMeta;
      setBakeStatus(null);
      setBakePct(0);
    } catch (e) {
      setBakeStatus(null);
      setBakePct(0);
      setSubmitting(false);
      const msg =
        e instanceof Error && e.message
          ? e.message
          : typeof e === "string"
            ? e
            : "Не удалось обработать креатив (неизвестная ошибка)";
      // eslint-disable-next-line no-console
      console.error("[bake] error", e);
      toast.error(`Ошибка обработки креатива: ${msg}`);
      return;
    }

    const payload = {
      // Root-level fields for n8n Parse Webhook compatibility
      source: "lovable-webhook",
      cabinet_id: cabinetId,
      project_id: projectId || null,
      project_name: activeProject?.name ?? null,
      ad_account_id: cab?.adAccountId ?? "",
      clientConfig: cab ? {
        cabinet_id: cab.id,
        project_id: projectId || null,
        client_name: cab.name,
        ad_account_id: cab.adAccountId ?? "",
        page_id: effectivePageId || cab.pageId || "",
        page_name: effectivePageName || cab.pageName || "",
        instagram_actor_id: cab.instagramId ?? "",
        instagram_user_id: cab.instagramId ?? "",
        fb_token: cab.accessToken ?? "",
        fb_pixel_id: goal === "site-leads" ? pixelId : (cab.pixelId ?? ""),
        pixel_event: goal === "site-leads" ? pixelEvent : (cab.pixelEvent ?? "Lead"),
        // Если для цели «Лиды с сайта» пользователь ввёл свой URL — отправляем его,
        // иначе используем дефолтный сайт/лендинг из настроек кабинета.
        website_url: (goal === "site-leads" && websiteUrl.trim())
          ? websiteUrl.trim()
          : (cab.websiteUrl ?? ""),
        landing_url: (goal === "site-leads" && websiteUrl.trim())
          ? websiteUrl.trim()
          : (cab.landingUrl ?? ""),
        utm_template: cab.utmTemplate?.trim() || DEFAULT_META_UTM_TEMPLATE,
        whatsapp_number: goal === "whatsapp" ? whatsappId : (cab.whatsappNumber ?? ""),
        telegram_group_id: cab.telegramGroupId ?? "",
        business_id: cab.businessId ?? "",
        app_id: cab.appId ?? "",
        daily_budget: (Number(budget) || 0) * 100, // cents for Meta API
        currency: cab.currency ?? "USD",
        campaign_objective:
          goal === "traffic"
            ? "OUTCOME_TRAFFIC"
            : goal === "site-leads"
              ? "OUTCOME_LEADS"
              : goal === "meta-form"
                ? "OUTCOME_LEADS"
                : (cab.campaignObjective ?? ""),
        optimization_goal:
          goal === "traffic" ? "LINK_CLICKS" : (cab.optimizationGoal ?? ""),
        lead_form_id: goal === "meta-form" ? leadFormId : (cab.leadFormId ?? ""),
        traffic_url:
          goal === "traffic"
            ? (trafficUrl.trim() || cab.websiteUrl || "")
            : "",
        city: selectedCities.length
          ? selectedCities.map((c) => c.name).join(", ")
          : (cab.city ?? ""),
        brief: cab.brief ?? "",
        region_key: "2037",
        targeting: {
          geo: cab.targetGeo ?? [],
          countries: [countryCode],
          city: selectedCities[0]
            ? { key: selectedCities[0].key, name: selectedCities[0].name }
            : null,
          cities: selectedCities.map((c) => ({ key: c.key, name: c.name })),
          age_min: ageMin,
          age_max: ageMax,
          gender,
          languages: cab.targetLanguages ?? [],
          interests: cab.targetInterests ?? [],
          exclusions: cab.targetExclusions ?? [],
        },
        schedule: {
          timezone: cab.timezone ?? "Asia/Almaty",
          days_of_week: cab.daysOfWeek ?? [1,2,3,4,5,6,7],
          start_time: cab.startTime ?? null,
          end_time: cab.endTime ?? null,
          launch_hour: cab.launchHour ?? 9,
          auto_launch_enabled: cab.autoLaunchEnabled ?? false,
        },
        creative_defaults: {
          headline: cab.creativeHeadline ?? "",
          primary_text: cab.creativePrimaryText ?? "",
          description: cab.creativeDescription ?? "",
          cta: cab.creativeCta ?? "",
          media_urls: cab.creativeMediaUrls ?? [],
        },
      } : undefined,
      cabinet: cab ? {
        id: cab.id,
        name: cab.name,
        adAccountId: cab.adAccountId,
        pageId: effectivePageId || cab.pageId,
        pageName: effectivePageName || cab.pageName,
        instagramId: cab.instagramId,
      } : { id: cabinetId },
      goal,
      budget: Number(budget) || 0,
      currency: cab?.currency ?? "USD",
      text: primaryText,
      primaryText,
      headline,
      description,
      cta,
      campaignName,
      adsetName,
      adName,
      creativeName: buildCreativeName(adName),
      pageId: effectivePageId || cab?.pageId || undefined,
      pageName: effectivePageName || cab?.pageName || undefined,
      whatsappNumber: goal === "whatsapp" ? whatsappId : undefined,
      pixelId: goal === "site-leads" ? pixelId : undefined,
      pixelEvent: goal === "site-leads" ? pixelEvent : undefined,
      websiteUrl: goal === "site-leads" ? (websiteUrl.trim() || cab?.websiteUrl || undefined) : undefined,
      trafficUrl: goal === "traffic" ? (trafficUrl.trim() || cab?.websiteUrl || undefined) : undefined,
      leadFormId: goal === "meta-form" ? leadFormId : undefined,
      scheduleMode,
      targeting: {
        country: countryCode,
        country_name: selectedCountry?.name,
        city: selectedCities[0]
          ? { key: selectedCities[0].key, name: selectedCities[0].name }
          : null,
        cities: selectedCities.map((c) => ({ key: c.key, name: c.name })),
        age_min: ageMin,
        age_max: ageMax,
        gender,
      },
      creatives: {
        feed: bakedFeed
          ? {
              name: bakedFeed.name,
              type: bakedFeed.type,
              size: bakedFeed.size,
              ratio: "4:5",
              // baked=true для фото (готовый JPEG нужного аспекта),
              // baked=false для видео — нужно резать на стороне n8n по cropMeta.
              baked: !bakedFeed.type.startsWith("video/"),
              cropMeta: feedCropMeta,
            }
          : null,
        stories: bakedStories
          ? {
              name: bakedStories.name,
              type: bakedStories.type,
              size: bakedStories.size,
              ratio: "9:16",
              baked: !bakedStories.type.startsWith("video/"),
              cropMeta: storiesCropMeta,
            }
          : null,
      },
      // mediaType — чтобы n8n не угадывал по mime бинаря.
      // VIDEO если хоть один файл (feed или stories) видео, иначе PHOTO.
      mediaType: ((bakedFeed?.type || bakedStories?.type || "").startsWith("video/"))
        ? "VIDEO"
        : "PHOTO",
      submittedAt: new Date().toISOString(),
      // Каждая попытка запуска получает свой launchId — иначе при повторе
      // упираемся в unique constraint idx_ad_campaigns_launch_id.
      launchId:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };

    const fd = new FormData();
    fd.append("payload", JSON.stringify(payload));
    if (bakedFeed) fd.append("creative_feed", bakedFeed, bakedFeed.name);
    if (bakedStories) fd.append("creative_stories", bakedStories, bakedStories.name);

    try {
      await saveCampaign(
        {
          cabinetId,
          goal,
          budget,
          text: primaryText,
          campaignName,
          adsetName,
          adName,
          headline,
          description,
          cta,
          whatsappId: goal === "whatsapp" ? whatsappId : undefined,
          pixelId: goal === "site-leads" ? pixelId : undefined,
          pixelEvent: goal === "site-leads" ? pixelEvent : undefined,
          leadFormId: goal === "meta-form" ? leadFormId : undefined,
          launchId: payload.launchId,
          status: "queued",
        },
        projectId || null,
      );
      window.dispatchEvent(new CustomEvent("ads:campaign-launch-updated", { detail: { cabinetId } }));
    } catch (e) {
      setSubmitting(false);
      toast.error((e as Error).message || "Не удалось сохранить запуск кампании");
      return;
    }

    // Прямой запуск в Meta может занять до 60с (загрузка видео + 4 API-вызова).
    // Если не успели — статус всё равно дотечёт через ad_campaigns.
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 90_000);
    let accepted = false;
    let serverError: string | null = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const bearer = sessionData.session?.access_token || LAUNCH_KEY;
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        body: fd,
        signal: ctrl.signal,
        headers: LAUNCH_KEY
          ? { Authorization: `Bearer ${bearer}`, apikey: LAUNCH_KEY }
          : undefined,
      });
      const data = await res.json().catch(() => null) as
        | { ok?: boolean; accepted?: boolean; error?: string }
        | null;
      if (res.ok && (data?.ok || data?.accepted)) {
        accepted = true;
      } else {
        serverError =
          data?.error || `Не удалось отправить (HTTP ${res.status})`;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("aborted") || ctrl.signal.aborted) {
        const polled = await pollLaunchStatus(payload.launchId);
        if (polled.status === "success") {
          accepted = true;
        } else if (polled.status === "error") {
          serverError = polled.error ?? "Ошибка запуска в Meta";
        } else {
          // Edge-функция ещё работает — не помечаем как ошибку.
          accepted = true;
        }
      } else {
        serverError = `Сеть: ${msg}`;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!accepted) {
      setSubmitting(false);
      await supabase
        .from("ad_campaigns")
        .update({
          status: "error",
          last_error: serverError || "Не удалось отправить кампанию",
          status_updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq("launch_id", payload.launchId);
      window.dispatchEvent(new CustomEvent("ads:campaign-launch-updated", { detail: { cabinetId } }));
      toast.error(serverError || "Не удалось отправить кампанию");
      return;
    }

    // Финальный статус выставляет сама edge-функция launch-campaign
    // (success при создании кампании, error при сбое). Здесь только
    // оповещаем UI, чтобы он перечитал ad_campaigns.
    window.dispatchEvent(new CustomEvent("ads:campaign-launch-updated", { detail: { cabinetId } }));

    // ===== Красивая сводка пользователю =====
    const goalLabel =
      goal === "site-leads"
        ? "Лиды с сайта"
        : goal === "meta-form"
          ? "Лид-форма Meta"
          : goal === "traffic"
            ? "Трафик"
            : "WhatsApp";
    const currency = (cab?.currency ?? "USD").toUpperCase();
    const currencySymbol =
      currency === "USD"
        ? "$"
        : currency === "EUR"
          ? "€"
          : currency === "RUB"
            ? "₽"
            : currency === "KZT"
              ? "₸"
              : currency;
    const rows: { label: string; value: string }[] = [];
    rows.push({ label: "Цель", value: goalLabel });
    if (goal === "site-leads") {
      if (pixelId) rows.push({ label: "Пиксель", value: pixelId });
      if (pixelEvent) rows.push({ label: "Событие", value: pixelEvent });
      const site = websiteUrl.trim() || cab?.websiteUrl;
      if (site) rows.push({ label: "Сайт", value: site });
    } else if (goal === "whatsapp") {
      if (whatsappId) rows.push({ label: "WhatsApp", value: whatsappId });
    } else if (goal === "meta-form") {
      if (leadFormId) rows.push({ label: "Лид-форма", value: leadFormId });
    } else if (goal === "traffic") {
      const url = trafficUrl.trim() || cab?.websiteUrl;
      if (url) rows.push({ label: "Ссылка", value: url });
    }
    if (selectedCountry) {
      rows.push({
        label: "География",
        value:
          selectedCities.length === 0
            ? selectedCountry.name
            : `${selectedCountry.name} · ${selectedCities.map((c) => c.name).join(", ")}`,
      });
    }
    rows.push({ label: "Возраст", value: `${ageMin}–${ageMax}` });
    rows.push({
      label: "Пол",
      value: gender === "male" ? "Мужчины" : gender === "female" ? "Женщины" : "Все",
    });

    setSuccessInfo({
      cabinet: cab?.name,
      goal: goalLabel,
      budget,
      currencySymbol,
      rows,
    });
    setSuccessOpen(true);

    onOpenChange(false);
    setPrimaryText("");
    setHeadline("");
    setDescription("");
    setCampaignNameDirty(false);
    setAdsetNameDirty(false);
    setAdNameDirty(false);
    setFeed(null);
    setStories(null);
    setSubmitting(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-6xl overflow-hidden border-border/60 bg-card p-0">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Rocket className="h-5 w-5 text-success" />
              Создать кампанию
            </DialogTitle>
            <DialogDescription className="text-xs">
              Настройте параметры и отправьте на запуск через Webhook
            </DialogDescription>
          </DialogHeader>

          <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div className="space-y-4 overflow-y-auto border-border/60 px-6 py-5 lg:border-r">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Клиент / Кабинет
                </Label>
                <Select value={cabinetId} onValueChange={setCabinetId}>
                  <SelectTrigger className="h-11 rounded-xl bg-background/60">
                    <SelectValue placeholder="Выберите клиента" />
                  </SelectTrigger>
                  <SelectContent>
                    {cabinets.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCabinet && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Страница (от имени)
                    </Label>
                    {pagesAssets.isLoading && (
                      <span className="text-[10px] text-muted-foreground">Загрузка…</span>
                    )}
                  </div>
                  <Select value={effectivePageId} onValueChange={setPageId}>
                    <SelectTrigger className="h-11 rounded-xl bg-background/60">
                      <SelectValue placeholder={pagesAssets.isLoading ? "Загрузка…" : "Выберите страницу"} />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Если дефолтная страница кабинета не вернулась через API — всё равно покажем её. */}
                      {selectedCabinet.pageId &&
                        !pagesAssets.data.some((p) => p.id === selectedCabinet.pageId) && (
                          <SelectItem value={selectedCabinet.pageId}>
                            {selectedCabinet.pageName || selectedCabinet.pageId} · из настроек
                          </SelectItem>
                        )}
                      {pagesAssets.data.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.category ? ` · ${p.category}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pagesAssets.error && (
                    <div className="text-[11px] text-destructive">{pagesAssets.error}</div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Цель кампании
                </Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GOALS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGoal(g.id)}
                      className={cn(
                        "rounded-xl border bg-background/60 px-3 py-2.5 text-xs font-medium transition-colors",
                        goal === g.id
                          ? "border-success text-foreground shadow-[inset_0_0_0_1px_hsl(var(--success))]"
                          : "border-border/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <GoalAssetsPicker
                goal={goal}
                cabinet={
                  selectedCabinet
                    ? { ...selectedCabinet, pageId: effectivePageId || selectedCabinet.pageId }
                    : selectedCabinet
                }
                whatsappId={whatsappId}
                setWhatsappId={setWhatsappId}
                pixelId={pixelId}
                setPixelId={setPixelId}
                pixelEvent={pixelEvent}
                setPixelEvent={setPixelEvent}
                leadFormId={leadFormId}
                setLeadFormId={setLeadFormId}
              />

              {goal === "site-leads" && (
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Ссылка на сайт
                  </Label>
                  <Input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder={selectedCabinet?.websiteUrl || "https://example.com/landing"}
                    inputMode="url"
                    className="h-11 rounded-xl bg-background/60"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Реклама запустится на эту ссылку с выбранным пикселем.
                    Если оставить пустым — используется сайт из настроек кабинета.
                  </p>
                </div>
              )}

              {goal === "traffic" && (
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Ссылка для трафика
                  </Label>
                  <Input
                    value={trafficUrl}
                    onChange={(e) => setTrafficUrl(e.target.value)}
                    placeholder={selectedCabinet?.websiteUrl || "https://example.com"}
                    inputMode="url"
                    className="h-11 rounded-xl bg-background/60"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Цель Meta «OUTCOME_TRAFFIC» с оптимизацией на клики по ссылке.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Страна
                  </Label>
                  <Select
                    value={countryCode}
                    onValueChange={(v) => {
                      setCountryCode(v);
                      setCityKeys([]);
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-xl bg-background/60">
                      <SelectValue placeholder="Выберите страну" />
                    </SelectTrigger>
                    <SelectContent>
                      {GEO_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Города (от 200к)
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background/60 px-3 text-left text-sm"
                      >
                        <span className={cn("truncate", !selectedCities.length && "text-muted-foreground")}>
                          {selectedCities.length === 0
                            ? "Вся страна"
                            : selectedCities.length <= 2
                              ? selectedCities.map((c) => c.name).join(", ")
                              : `${selectedCities.length} городов`}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <div className="flex items-center justify-between border-b px-3 py-2 text-[11px]">
                        <span className="text-muted-foreground">
                          Выбрано: {selectedCities.length}
                        </span>
                        {selectedCities.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setCityKeys([])}
                            className="text-primary hover:underline"
                          >
                            Сбросить
                          </button>
                        )}
                      </div>
                      <div className="max-h-64 overflow-auto p-1">
                        {selectedCountry?.cities.map((c) => {
                          const checked = cityKeys.includes(c.key);
                          return (
                            <button
                              key={c.key}
                              type="button"
                              onClick={() =>
                                setCityKeys((prev) =>
                                  prev.includes(c.key)
                                    ? prev.filter((k) => k !== c.key)
                                    : [...prev, c.key],
                                )
                              }
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                            >
                              <Checkbox checked={checked} className="pointer-events-none" />
                              <span className="flex-1 truncate">{c.name}</span>
                              <span className="text-[10px] text-muted-foreground">{c.population}k</span>
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {selectedCities.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {selectedCities.map((c) => (
                        <span
                          key={c.key}
                          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px]"
                        >
                          {c.name}
                          <button
                            type="button"
                            onClick={() =>
                              setCityKeys((prev) => prev.filter((k) => k !== c.key))
                            }
                            className="opacity-60 hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Возраст: {ageMin}–{ageMax}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-[10px] text-muted-foreground">От</div>
                    <Input
                      type="number"
                      min={13}
                      max={65}
                      value={ageMin}
                      onChange={(e) => setAgeMin(Math.max(13, Math.min(65, Number(e.target.value) || 13)))}
                      className="h-11 rounded-xl bg-background/60"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-muted-foreground">До</div>
                    <Input
                      type="number"
                      min={13}
                      max={65}
                      value={ageMax}
                      onChange={(e) => setAgeMax(Math.max(13, Math.min(65, Number(e.target.value) || 65)))}
                      className="h-11 rounded-xl bg-background/60"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Пол
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "all", label: "Все" },
                    { id: "male", label: "Мужчины" },
                    { id: "female", label: "Женщины" },
                  ] as const).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGender(g.id)}
                      className={cn(
                        "rounded-xl border bg-background/60 px-3 py-2.5 text-xs font-medium transition-colors",
                        gender === g.id
                          ? "border-success text-foreground shadow-[inset_0_0_0_1px_hsl(var(--success))]"
                          : "border-border/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>


              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Бюджет в день
                </Label>
                <div className="relative">
                  <Input
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    inputMode="numeric"
                    className="h-11 rounded-xl bg-background/60 pr-10"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Когда запустить
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleMode("now")}
                    className={cn(
                      "h-11 rounded-xl border text-sm transition",
                      scheduleMode === "now"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Сейчас
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode("tomorrow")}
                    className={cn(
                      "h-11 rounded-xl border text-sm transition",
                      scheduleMode === "tomorrow"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    С 00:00 (Алматы)
                  </button>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/60 bg-background/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Тексты и нейминг
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAiGenerateCopy}
                  disabled={aiGenStatus === "running" || (!feed && !stories)}
                  className={cn(
                    "group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition",
                    aiGenStatus === "running"
                      ? "border-primary/40 bg-primary/5"
                      : "border-primary/40 bg-gradient-to-br from-primary/10 to-primary/5 hover:border-primary hover:from-primary/15",
                    (!feed && !stories) && "cursor-not-allowed opacity-60",
                  )}
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary">
                    <Sparkles className={cn("h-4 w-4", aiGenStatus === "running" && "animate-pulse")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {aiGenStatus === "running"
                        ? "Анализирую креатив..."
                        : aiGenStatus === "done"
                          ? "Сгенерировать заново"
                          : "Сгенерировать тексты по креативу"}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {!feed && !stories
                        ? "Сначала загрузите фото или видео"
                        : aiGenStatus === "error" && aiGenError
                          ? aiGenError
                          : "GPT-4o Vision разберет, что на креативе, и напишет заголовок, текст и описание. Ключ OpenAI берется из Настроек."}
                    </div>
                  </div>
                </button>


                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Заголовок · до 40 символов
                  </Label>
                  <Input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value.slice(0, 40))}
                    placeholder={`Например: ${GOAL_LABEL[goal as AdsGoal]} за 1 день`}
                    className="h-10 rounded-xl bg-background/60"
                  />
                  <div className="text-right text-[10px] text-muted-foreground">
                    {headline.length}/40
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Основной текст · до 500 символов
                  </Label>
                  <Textarea
                    value={primaryText}
                    onChange={(e) => setPrimaryText(e.target.value.slice(0, 500))}
                    rows={4}
                    placeholder="Краткий цепляющий текст с CTA…"
                    className="rounded-xl bg-background/60"
                  />
                  <div className="text-right text-[10px] text-muted-foreground">
                    {primaryText.length}/500
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Описание ссылки · до 30 символов (необязательно)
                  </Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 30))}
                    placeholder="Например: Бесплатная консультация"
                    className="h-10 rounded-xl bg-background/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Кнопка (CTA)
                  </Label>
                  <Select value={cta} onValueChange={setCta}>
                    <SelectTrigger className="h-10 rounded-xl bg-background/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CTA_BY_GOAL[goal as AdsGoal].map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 border-t border-border/60 pt-3">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Название кампании
                  </Label>
                  <Input
                    value={campaignName}
                    onChange={(e) => { setCampaignName(e.target.value); setCampaignNameDirty(true); }}
                    className="h-10 rounded-xl bg-background/60 font-mono text-[12px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Название группы (adset)
                  </Label>
                  <Input
                    value={adsetName}
                    onChange={(e) => { setAdsetName(e.target.value); setAdsetNameDirty(true); }}
                    className="h-10 rounded-xl bg-background/60 font-mono text-[12px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Название объявления
                  </Label>
                  <Input
                    value={adName}
                    onChange={(e) => { setAdName(e.target.value); setAdNameDirty(true); }}
                    className="h-10 rounded-xl bg-background/60 font-mono text-[12px]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Имена обновляются автоматически от цели/гео/возраста. Можно перезаписать вручную.
                  </p>
                </div>
              </div>

              {cabinetId && projectId && (
                <MessageTemplatesPanel
                  cabinetId={cabinetId}
                  projectId={projectId}
                  pageId={effectivePageId}
                  selectedTemplateId={messageTemplateId}
                  onSelectedTemplateChange={setMessageTemplateId}
                />
              )}
            </div>

            <div className="overflow-y-auto px-6 py-5">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Креативы
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CreativeUpload
                  label="Лента (4:5)"
                  ratio="4:5"
                  file={feed}
                  onFile={setFeed}
                  onView={(s) => { feedViewRef.current = s; }}
                />
                <CreativeUpload
                  label="Stories (9:16)"
                  ratio="9:16"
                  file={stories}
                  onFile={setStories}
                  onView={(s) => { storiesViewRef.current = s; }}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 bg-background/40 px-6 py-4">
            {bakeStatus && (
              <div className="mb-3 rounded-xl border border-border/60 bg-background/60 px-4 py-2.5 text-xs">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{bakeStatus}</span>
                  <span className="font-mono tabular-nums text-foreground">{bakePct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-success transition-[width]"
                    style={{ width: `${bakePct}%` }}
                  />
                </div>
              </div>
            )}
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="h-12 w-full rounded-xl bg-success text-success-foreground hover:bg-success/90"
            >
              {submitting
                ? bakeStatus
                  ? "Готовим креатив…"
                  : "Отправляем на проверку…"
                : "🚀 Отправить на запуск AI"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    {successInfo && (
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-md overflow-hidden border-border/60 bg-card p-0">
          <div className="relative bg-gradient-to-br from-success/20 via-success/5 to-transparent px-6 pt-6 pb-5">
            <div className="absolute right-4 top-4">
              <Sparkles className="h-5 w-5 text-success/70" />
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success/15 ring-1 ring-success/30">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <div>
                <DialogTitle className="text-lg leading-tight">
                  Реклама отправлена на проверку
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs">
                  AI-модерация займёт пару минут. Статус появится в карточке кабинета.
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="space-y-3 px-6 pb-6">
            {successInfo.cabinet && (
              <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Кабинет
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
                  {successInfo.cabinet}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-success/80">
                Бюджет в день
              </div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">
                {successInfo.currencySymbol}
                {successInfo.budget}
                <span className="ml-1 text-xs font-medium text-muted-foreground">
                  / день
                </span>
              </div>
            </div>

            {successInfo.rows.length > 0 && (
              <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-background/60">
                {successInfo.rows.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="text-xs text-muted-foreground">{r.label}</span>
                    <span className="truncate text-sm font-medium text-foreground">
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={() => setSuccessOpen(false)}
              className="mt-2 h-11 w-full rounded-xl bg-success text-success-foreground hover:bg-success/90"
            >
              Отлично
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}
  </>
  );
};

export default CreateCampaignDialog;