import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/factory/Header";
import SourceModeCard from "@/components/factory/SourceModeCard";
import FieldGroup from "@/components/factory/FieldGroup";
import WizardHeader from "@/components/factory/WizardHeader";
import LinkSource from "@/components/factory/sources/LinkSource";
import PhotoSource from "@/components/factory/sources/PhotoSource";
import LogoSource from "@/components/factory/sources/LogoSource";
import DescriptionSource from "@/components/factory/sources/DescriptionSource";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Link2, Image as ImageIcon, FileText, Sparkles, Layers } from "lucide-react";
import { CONTENT_TYPES } from "@/data/contentTypes";
import { CopyModePanel } from "@/components/factory/CopyModePanel";
import { persistWizardState } from "@/lib/contentFactoryBrief";
import type { CopyMode } from "@/lib/contentFactoryCopy";
import { BrandTemplatePicker } from "@/components/factory/BrandTemplatePicker";
import { useBrandTemplates } from "@/hooks/useBrandTemplates";
import { getContentTypeFlow, type SourceMode } from "@/data/contentTypeFlows";
import { cn } from "@/lib/utils";

interface LocationState {
  typeId?: string;
}

const MODE_META = {
  link: {
    title: "По ссылке",
    subtitle: "Вставьте URL",
    icon: Link2,
  },
  photo: {
    title: "По фото",
    subtitle: "Загрузите изображения",
    icon: ImageIcon,
  },
  description: {
    title: "По описанию",
    subtitle: "Опишите что нужно",
    icon: FileText,
  },
} as const;

const CreateStep1 = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const type = CONTENT_TYPES.find((t) => t.id === state.typeId);
  const flow = getContentTypeFlow(state.typeId);
  const step1 = flow.step1;

  const [mode, setMode] = useState<SourceMode>(step1.defaultMode);
  const [linkUrl, setLinkUrl] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [peoplePhotos, setPeoplePhotos] = useState<File[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [productName, setProductName] = useState("");
  const [copyMode, setCopyMode] = useState<CopyMode>("auto");
  const [overlayText, setOverlayText] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [brandTemplateId, setBrandTemplateId] = useState<string | null>(null);
  const { templates } = useBrandTemplates();

  useEffect(() => {
    const def = templates.find((t) => t.is_default);
    if (def && !brandTemplateId) setBrandTemplateId(def.id);
  }, [templates, brandTemplateId]);

  useEffect(() => {
    if (!step1.allowedModes.includes(mode)) {
      setMode(step1.defaultMode);
    }
  }, [state.typeId, step1.defaultMode, step1.allowedModes, mode]);

  // В режиме «По фото» достаточно ЛЮБОГО входа: фото товара, фото человека,
  // логотипа ИЛИ заполненного текста на креативе/доп. инструкций.
  // Это позволяет быстро сгенерировать баннер с готовой надписью без обязательного селфи.
  const hasAnyPhotoInput =
    photos.length > 0 ||
    peoplePhotos.length > 0 ||
    !!logoFile ||
    overlayText.trim().length > 0 ||
    extraInstructions.trim().length > 0;

  const canContinue =
    (mode === "link" && linkUrl.trim().length > 0) ||
    (mode === "photo" && hasAnyPhotoInput) ||
    (mode === "description" && description.trim().length > 0);

  const visibleModes = step1.allowedModes.map((id) => ({
    id,
    ...MODE_META[id],
  }));

  return (
    <main className="min-h-screen">
      <Header onClose={() => navigate("/")} />

      <section className="container max-w-6xl space-y-4 pt-3 pb-24">
        <WizardHeader
          step={1}
          totalSteps={flow.totalSteps}
          title={step1.label}
          subtitle={step1.subtitle}
          eyebrow={type ? `Формат · ${type.title}` : undefined}
        />

        {step1.showModeSelector && visibleModes.length > 1 && (
          <div
            className={cn(
              "grid grid-cols-1 gap-2",
              visibleModes.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3",
            )}
          >
            {visibleModes.map((m) => (
              <SourceModeCard
                key={m.id}
                icon={m.icon}
                title={m.title}
                subtitle={m.subtitle}
                selected={mode === m.id}
                onClick={() => setMode(m.id)}
              />
            ))}
          </div>
        )}

        {/* Контентная сетка — раскладка зависит от режима, чтобы карточки выглядели сбалансированно */}
        {mode === "link" && (
          <FieldGroup
            dense
            icon={Link2}
            title="Ссылка на источник"
            description="Товар, статья или видео."
          >
            <LinkSource value={linkUrl} onChange={setLinkUrl} />
          </FieldGroup>
        )}

        {mode === "description" && step1.showDescription && (
          <div
            className={cn(
              "grid gap-3",
              step1.showLogo ? "lg:grid-cols-5" : "lg:grid-cols-1",
            )}
          >
            {step1.showLogo && (
              <FieldGroup
                dense
                icon={Sparkles}
                title="Логотип бренда"
                optional
                description="Фирменный стиль для всех креативов."
                className="lg:col-span-2 h-full"
              >
                <LogoSource file={logoFile} onChange={setLogoFile} compact />
              </FieldGroup>
            )}
            <FieldGroup
              dense
              icon={FileText}
              title="Описание задачи"
              description="Опишите идею, продукт и ключевое сообщение."
              className={cn("h-full", step1.showLogo && "lg:col-span-3")}
            >
              <DescriptionSource
                value={description}
                onChange={setDescription}
                productName={productName}
                onProductNameChange={setProductName}
              />
            </FieldGroup>
          </div>
        )}

        {mode === "photo" && (
          <>
            {step1.showLogo && (
              <FieldGroup
                dense
                icon={Sparkles}
                title="Логотип бренда"
                optional
                description="Фирменный стиль для всех креативов."
              >
                <LogoSource file={logoFile} onChange={setLogoFile} compact />
              </FieldGroup>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              {step1.showPeoplePhoto && (
                <FieldGroup
                  dense
                  icon={ImageIcon}
                  title={step1.peoplePhotoTitle}
                  required={step1.peoplePhotoRequired}
                  optional={!step1.peoplePhotoRequired}
                  description={
                    step1.peoplePhotoRequired
                      ? "Селфи или портрет — нейрофотосессия."
                      : "Фото человека для нейрофотосессии."
                  }
                  className="h-full"
                >
                  <PhotoSource
                    files={peoplePhotos}
                    onChange={setPeoplePhotos}
                    title=""
                    subtitle=""
                    hint=""
                    maxFiles={10}
                    compact
                  />
                </FieldGroup>
              )}
              {step1.showProductPhoto && (
                <FieldGroup
                  dense
                  icon={ImageIcon}
                  title="Фото товара / контента"
                  optional
                  description="Продукт, интерьер, референсы. До 14 файлов."
                  className="h-full"
                >
                  <PhotoSource
                    files={photos}
                    onChange={setPhotos}
                    title=""
                    subtitle=""
                    hint=""
                    compact
                  />
                </FieldGroup>
              )}
            </div>
          </>
        )}

        {step1.showBrandTemplate && (
          <BrandTemplatePicker value={brandTemplateId} onChange={setBrandTemplateId} />
        )}

        {step1.showCopyMode && (
          <CopyModePanel
            mode={copyMode}
            onModeChange={setCopyMode}
            overlayText={overlayText}
            onOverlayTextChange={setOverlayText}
            extraHints={extraInstructions}
            onExtraHintsChange={setExtraInstructions}
          />
        )}

        <div className="mobile-sticky-cta flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/90 p-2 backdrop-blur-xl">
          <Button variant="ghost" onClick={() => navigate("/")} className="rounded-xl">
            <ArrowLeft className="h-4 w-4" />
            Назад
          </Button>
          <Button
            size="lg"
            disabled={!canContinue}
            onClick={() => {
              const nextState = {
                typeId: state.typeId,
                mode,
                linkUrl,
                description,
                productName,
                copyMode,
                overlayText,
                extraInstructions,
                photosCount: photos.length,
                photos,
                peoplePhotos,
                peoplePhotosCount: peoplePhotos.length,
                logoFile,
                brandTemplateId,
              };
              persistWizardState(nextState);
              navigate("/create/step-2", { state: nextState });
            }}
            className="rounded-2xl bg-gradient-to-r from-primary to-primary/80 px-8 font-extrabold uppercase tracking-wider text-primary-foreground shadow-[0_10px_30px_hsl(var(--primary)/0.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_15px_40px_hsl(var(--primary)/0.5)] disabled:translate-y-0 disabled:bg-secondary disabled:from-secondary disabled:to-secondary disabled:text-muted-foreground disabled:shadow-none"
          >
            Далее
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </main>
  );
};

export default CreateStep1;
