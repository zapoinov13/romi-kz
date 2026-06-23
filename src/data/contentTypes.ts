import {
  Facebook,
  ShoppingBag,
  Images,
  Flame,
  type LucideIcon,
} from "lucide-react";

export type ContentCategory = "ads" | "content" | "ai";

export type ContentAccent = "blue" | "purple" | "pink" | "orange" | "emerald";

export interface ContentMetric {
  label: string;
  value: string;
  positive?: boolean;
}

export interface ContentBadge {
  label: string;
  tone: "hot" | "new" | "soon";
}

export interface ContentType {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  category: ContentCategory;
  popular?: boolean;
  tooltip: string;
  accent: ContentAccent;
  badge?: ContentBadge;
  metric: ContentMetric;
  /** Ключевые слова для поиска (latin + cyrillic). */
  keywords?: string[];
}

// NOTE: ранее были также google-ads, reels-cover, youtube-thumb, web-banner, neuro-photo —
// скрыты по запросу пользователя. При необходимости можно вернуть из git-истории.
export const CONTENT_TYPES: ContentType[] = [
  {
    id: "facebook-ads",
    title: "Креативы для рекламы",
    subtitle: "Facebook, Instagram, Google Ads. Оптимизировано под CTR.",
    icon: Facebook,
    category: "ads",
    popular: true,
    accent: "blue",
    badge: { label: "Хит", tone: "hot" },
    metric: { label: "Конверсия", value: "+12.4%", positive: true },
    keywords: ["facebook", "instagram", "ads", "реклама", "креатив", "таргет"],
    tooltip:
      "Логика конверсии: останавливаем скролл первым кадром → бьём в боль → показываем оффер → CTA. Цель — клик и низкий CPC.",
  },
  {
    id: "marketplace",
    title: "Карточки товара",
    subtitle: "Wildberries, Ozon, Kaspi. Инфографика, которая продаёт за вас.",
    icon: ShoppingBag,
    category: "ads",
    popular: true,
    accent: "purple",
    badge: { label: "New", tone: "new" },
    metric: { label: "Скорость", value: "~45 сек" },
    keywords: ["wildberries", "ozon", "kaspi", "маркетплейс", "карточка", "товар"],
    tooltip:
      "Логика конверсии: первый слайд продаёт клик в выдаче, следующие снимают возражения и ведут в корзину. Растёт CTR и CR карточки.",
  },
  {
    id: "insta-carousel",
    title: "Карусели Instagram",
    subtitle: "Сторителлинг в 10 слайдах. Удержание внимания аудитории.",
    icon: Images,
    category: "content",
    popular: true,
    accent: "pink",
    metric: { label: "Retention", value: "Высокий", positive: true },
    keywords: ["instagram", "карусель", "carousel", "слайды", "контент"],
    tooltip:
      "Логика конверсии: крючок на 1-м слайде → польза по слайдам → удержание свайпа → CTA в финале. Цель — сохранения и заявки в Direct.",
  },
  {
    id: "warmup",
    title: "Прогревы",
    subtitle: "Серия материалов, которая ведёт холодную аудиторию к покупке.",
    icon: Flame,
    category: "content",
    accent: "pink",
    metric: { label: "Глубина", value: "5–10 шагов" },
    keywords: ["прогрев", "warmup", "воронка", "контент-серия"],
    tooltip:
      "Знакомство → боль → инсайт → метод → кейс → оффер → CTA. Готовит аудиторию к покупке без давления.",
  },
];
