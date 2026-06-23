import { Sparkles, Beaker } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CONTENT_TYPES } from "@/data/contentTypes";
import ContentTypeCard from "./ContentTypeCard";

interface ContentTypeGridProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ContentTypeGrid = ({ selectedId, onSelect }: ContentTypeGridProps) => {
  return (
    <section className="container pb-6" aria-labelledby="content-type-title">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2
          id="content-type-title"
          className="text-sm font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Выберите формат креатива
        </h2>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/factory/beta">
            <Beaker className="h-4 w-4" />
            Новый pipeline (beta)
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
        {CONTENT_TYPES.map((type) => (
          <ContentTypeCard
            key={type.id}
            type={type}
            selected={selectedId === type.id}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="text-xs leading-relaxed text-foreground/85">
          <span className="font-semibold text-foreground">AI-совет:</span>{" "}
          на этой неделе карточки для Wildberries показывают на{" "}
          <span className="font-semibold text-primary">18% выше</span> кликабельность в категории
          «Дом и сад».
        </p>
      </div>
    </section>
  );
};

export default ContentTypeGrid;
