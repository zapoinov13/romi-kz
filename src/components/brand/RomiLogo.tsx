import { cn } from "@/lib/utils";
import { ROMI_LOGO_SRC } from "@/lib/brand";

const SIZES = {
  sm: 32,
  md: 44,
  lg: 52,
  xl: 64,
} as const;

type RomiLogoSize = keyof typeof SIZES;

interface RomiLogoProps {
  size?: RomiLogoSize;
  className?: string;
}

/** Круглый фирменный знак ROMI (текст уже внутри изображения). */
export function RomiLogo({ size = "md", className }: RomiLogoProps) {
  const px = SIZES[size];
  return (
    <img
      src={ROMI_LOGO_SRC}
      alt="ROMI — Return On Marketing Investment"
      width={px}
      height={px}
      decoding="async"
      draggable={false}
      className={cn(
        "block shrink-0 select-none rounded-full object-contain",
        className,
      )}
      style={{ width: px, height: px }}
    />
  );
}
