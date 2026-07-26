import { useState } from "react";
import { Download, FileText, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  content?: string | null;
  mediaUrl?: string | null;
  mediaKind?: string | null;
  mediaMime?: string | null;
  mediaFilename?: string | null;
  className?: string;
};

const PLACEHOLDER_CAPTIONS = new Set([
  "[Фото]",
  "[Видео]",
  "[Аудио]",
  "[Документ]",
  "[Стикер]",
  "[Сообщение]",
]);

/** Превью медиа в чате CRM: аудио/видео плеер, фото и файлы с просмотром. */
export function ChatMediaBubble({
  content,
  mediaUrl,
  mediaKind,
  mediaMime,
  mediaFilename,
  className,
}: Props) {
  const [lightbox, setLightbox] = useState<"image" | "video" | null>(null);

  if (!mediaUrl) {
    return <span className={className}>{content || ""}</span>;
  }

  const kind = (mediaKind || "").toLowerCase();
  const mime = (mediaMime || "").toLowerCase();
  const isImage = kind === "image" || kind === "sticker" || mime.startsWith("image/");
  const isAudio = kind === "audio" || mime.startsWith("audio/");
  const isVideo = kind === "video" || mime.startsWith("video/");
  const isDoc = !isImage && !isAudio && !isVideo;
  const showCaption = !!content && !PLACEHOLDER_CAPTIONS.has(content);

  return (
    <div className={cn("space-y-2", className)}>
      {isImage && (
        <button
          type="button"
          onClick={() => setLightbox("image")}
          className="group relative block overflow-hidden rounded-lg text-left"
        >
          <img
            src={mediaUrl}
            alt={mediaFilename || "image"}
            className="max-h-64 max-w-full rounded-lg object-contain"
          />
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100">
            <Maximize2 className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      {isAudio && (
        <div className="min-w-[220px] rounded-xl bg-background/40 p-2">
          <p className="mb-1 text-[11px] font-medium opacity-70">Голосовое</p>
          <audio controls preload="metadata" className="w-full max-w-[280px]">
            <source src={mediaUrl} type={mediaMime || "audio/mp4"} />
            <a href={mediaUrl} target="_blank" rel="noreferrer" className="underline">
              Скачать аудио
            </a>
          </audio>
        </div>
      )}

      {isVideo && (
        <div className="space-y-1.5">
          <video
            controls
            playsInline
            preload="metadata"
            className="max-h-64 max-w-full rounded-lg bg-black"
            onDoubleClick={() => setLightbox("video")}
          >
            <source src={mediaUrl} type={mediaMime || "video/mp4"} />
          </video>
          <button
            type="button"
            onClick={() => setLightbox("video")}
            className="inline-flex items-center gap-1 text-[11px] underline underline-offset-2 opacity-80"
          >
            <Maximize2 className="h-3 w-3" />
            На весь экран
          </button>
        </div>
      )}

      {isDoc && (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-sm hover:bg-background/70"
        >
          <FileText className="h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate font-medium">{mediaFilename || "Файл"}</span>
          <Download className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </a>
      )}

      {showCaption && <p className="whitespace-pre-wrap text-sm">{content}</p>}

      {lightbox && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => e.key === "Escape" && setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="max-h-[90vh] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
            {lightbox === "image" ? (
              <img
                src={mediaUrl}
                alt={mediaFilename || "image"}
                className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain"
              />
            ) : (
              <video
                src={mediaUrl}
                controls
                autoPlay
                playsInline
                className="max-h-[90vh] max-w-[95vw] rounded-lg bg-black"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatMediaBubble;
