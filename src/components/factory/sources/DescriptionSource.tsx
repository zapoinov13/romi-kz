import { Info } from "lucide-react";

interface DescriptionSourceProps {
  value: string;
  onChange: (v: string) => void;
  productName: string;
  onProductNameChange: (v: string) => void;
}

const DescriptionSource = ({
  value,
  onChange,
  productName,
  onProductNameChange,
}: DescriptionSourceProps) => {
  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <label htmlFor="main-description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Главное описание
        </label>
        <textarea
          id="main-description"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder="Основная идея дизайна или текст поста..."
          className="mt-2 w-full resize-none rounded-2xl border border-border bg-background/40 px-5 py-4 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-primary/60 focus:bg-background/60"
        />
      </div>

      <div>
        <label htmlFor="product-name" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Название товара
        </label>
        <input
          id="product-name"
          type="text"
          value={productName}
          onChange={(e) => onProductNameChange(e.target.value)}
          placeholder="Например: Увлажнитель воздуха, Кроссовки Nike..."
          className="mt-2 h-12 w-full rounded-2xl border border-border bg-background/40 px-5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-primary/60 focus:bg-background/60"
        />
      </div>
    </div>
  );
};

export default DescriptionSource;