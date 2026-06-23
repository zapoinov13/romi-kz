const Hero = () => {
  return (
    <section className="container animate-fade-in-up pb-2 pt-5 sm:pt-8">
      <div className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
          <span className="h-1 w-1 rounded-full bg-primary animate-pulse-dot" />
          Контент-завод
        </span>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Создавайте контент, который{" "}
          <span className="bg-gradient-to-r from-primary to-[hsl(180_70%_55%)] bg-clip-text text-transparent">
            продаёт
          </span>
        </h1>
        <p className="max-w-xl text-balance text-sm leading-relaxed text-muted-foreground">
          Выберите формат — ИИ подберёт оптимальную структуру, стиль и продающие триггеры под вашу нишу.
        </p>
      </div>
    </section>
  );
};

export default Hero;
