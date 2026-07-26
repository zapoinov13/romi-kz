import { cn } from "@/lib/utils";

type Props = {
  content?: string | null;
  mediaUrl?: string | null;
  mediaKind?: string | null;
  mediaMime?: string | null;
  mediaFilename?: string | null;
  className?: string;
};

/** Превью медиа в чате CRM (image / audio / video / document). */
export function ChatMediaBubble({
  content,
  mediaUrl,
  mediaKind,
  mediaMime,
  mediaFilename,
  className,
}: Props) {
  if (!mediaUrl) {
    return <span className={className}>{content || ""}</span>;
  }

  const kind = (mediaKind || "").toLowerCase();
  const mime = (mediaMime || "").toLowerCase();

  return (
    <div className={cn("space-y-1.5", className)}>
      {(kind === "image" || mime.startsWith("image/")) && (
        <a href={mediaUrl} target="_blank" rel="noreferrer" className="block">
          <img
            src={mediaUrl}
            alt={mediaFilename || "image"}
            className="max-h-56 max-w-full rounded-lg object-contain"
          />
        </a>
      )}
      {(kind === "audio" || mime.startsWith("audio/")) && (
        <audio controls preload="metadata" className="max-w-full">
          <source src={mediaUrl} type={mediaMime || "audio/mp4"} />
        </audio>
      )}
      {(kind === "video" || mime.startsWith("video/")) && (
        <video controls preload="metadata" className="max-h-56 max-w-full rounded-lg">
          <source src={mediaUrl} type={mediaMime || "video/mp4"} />
        </video>
      )}
      {(kind === "document" || (!["image", "audio", "video"].includes(kind) && !mime.startsWith("image/") && !mime.startsWith("audio/") && !mime.startsWith("video/"))) && (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm underline underline-offset-2"
        >
          {mediaFilename || "Файл"}
        </a>
      )}
      {content && !["[Фото]", "[Видео]", "[Аудио]", "[Документ]", "[Стикер]"].includes(content) && (
        <p className="whitespace-pre-wrap text-sm">{content}</p>
      )}
    </div>
  );
}

export default ChatMediaBubble;
