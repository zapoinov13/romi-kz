import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Layers, Maximize } from "lucide-react";
import Header from "@/components/factory/Header";
import WizardHeader from "@/components/factory/WizardHeader";
import FieldGroup from "@/components/factory/FieldGroup";
import { Button } from "@/components/ui/button";
import { persistWizardState } from "@/lib/contentFactoryBrief";
import { getContentTypeFlow, type AspectId } from "@/data/contentTypeFlows";
import { AspectRatioPicker } from "@/components/factory/AspectRatioPicker";
import { VariantCountPicker } from "@/components/factory/VariantCountPicker";

type LangId = "ru" | "kz" | "en";

function detectLang(text?: string): LangId {
  if (!text) return "ru";
  // Kazakh-specific characters
  if (/[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/.test(text)) return "kz";
  // Cyrillic (Russian)
  if (/[а-яА-ЯёЁ]/.test(text)) return "ru";
  // Latin (English)
  if (/[a-zA-Z]/.test(text)) return "en";
  return "ru";
}

const CreateStep2 = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const prevState = (location.state ?? {}) as Record<string, unknown>;
  const typeId = typeof prevState.typeId === "string" ? prevState.typeId : undefined;
  const flow = getContentTypeFlow(typeId);
  const step2 = flow.step2;

  const description = typeof prevState.description === "string" ? prevState.description : "";
  const autoLang = detectLang(description);

  const [aspect, setAspect] = useState<AspectId>(step2.defaultAspect);
  const [variants, setVariants] = useState<number>(step2.defaultVariants);

  const variantUnit =
    step2.variantsLabel.toLowerCase().includes("слайд")
      ? "слайдов"
      : step2.variantsLabel.toLowerCase().includes("фото")
        ? "фото"
        : "вариантов";

  return (
    <main className="min-h-screen">
      <Header onClose={() => navigate("/")} />

      <section className="container max-w-6xl space-y-4 pt-6 pb-28">
        <WizardHeader
          step={2}
          totalSteps={flow.totalSteps}
          title={step2.label}
          subtitle={step2.subtitle || "Настройки можно пропустить, если подходят базовые"}
          eyebrow="Параметры вывода"
        />

        <div className="grid grid-cols-12 gap-4">
          {step2.showVariants && (
            <div className="col-span-12">
              <FieldGroup
                icon={Layers}
                title={step2.variantsLabel}
                description="Сколько итераций нейросеть создаст за раз"
              >
                <VariantCountPicker
                  value={variants}
                  onChange={setVariants}
                  counts={step2.variantCounts}
                  unitLabel={variantUnit}
                />
              </FieldGroup>
            </div>
          )}

          {step2.showAspect && (
            <div className="col-span-12 lg:col-span-5">
              <FieldGroup
                icon={Maximize}
                title="Соотношение сторон"
                description="Выберите формат под площадку — креатив будет сгенерирован ровно в этом размере."
              >
                <AspectRatioPicker
                  value={aspect}
                  onChange={setAspect}
                  allowed={step2.aspects}
                />
              </FieldGroup>
            </div>
          )}
        </div>

        <div className="mobile-sticky-cta flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/90 p-2 backdrop-blur-xl">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="rounded-xl"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад
          </Button>
          <Button
            size="lg"
            onClick={() => {
              const nextState = { ...prevState, aspect, lang: autoLang, variants };
              persistWizardState(nextState);
              navigate("/create/step-3", { state: nextState });
            }}
            className="rounded-2xl bg-gradient-to-r from-primary to-primary/80 px-8 font-extrabold uppercase tracking-wider text-primary-foreground shadow-[0_10px_30px_hsl(var(--primary)/0.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_15px_40px_hsl(var(--primary)/0.5)]"
          >
            Продолжить
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </main>
  );
};

export default CreateStep2;
