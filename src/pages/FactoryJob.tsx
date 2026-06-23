import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Job = {
  id: string;
  content_type: string;
  status: string;
  slides_total: number;
  error: string | null;
  created_at: string;
};

type Slide = {
  id: string;
  idx: number;
  status: string;
  image_url: string | null;
  qa_verdict: Record<string, unknown> | null;
};

const STATUS_FLOW = ["queued", "routed", "generating", "qa", "compositing", "delivering", "done"];

const FactoryJob = () => {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [{ data: j }, { data: s }] = await Promise.all([
        supabase.from("generation_jobs").select("*").eq("id", id).maybeSingle(),
        supabase.from("job_slides").select("*").eq("job_id", id).order("idx", { ascending: true }),
      ]);
      if (j) setJob(j as Job);
      if (s) setSlides(s as Slide[]);
    };
    void load();

    const ch = supabase
      .channel(`job-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generation_jobs", filter: `id=eq.${id}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_slides", filter: `job_id=eq.${id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id]);

  if (!job) {
    return <main className="container py-10 text-sm text-muted-foreground">Загрузка...</main>;
  }

  const stepIdx = STATUS_FLOW.indexOf(job.status);
  const failed = job.status === "failed";

  return (
    <main className="container max-w-5xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Задача {job.id.slice(0, 8)}</h1>
          <p className="text-xs text-muted-foreground">
            {job.content_type} - {new Date(job.created_at).toLocaleString()}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/factory/beta">Новая задача</Link>
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_FLOW.map((s, i) => (
          <Badge
            key={s}
            variant={
              failed ? "destructive" : i < stepIdx ? "default" : i === stepIdx ? "secondary" : "outline"
            }
          >
            {s}
          </Badge>
        ))}
        {failed && <Badge variant="destructive">failed</Badge>}
      </div>

      {job.error && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {job.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: Math.max(job.slides_total, slides.length) }).map((_, i) => {
          const s = slides[i];
          return (
            <div
              key={i}
              className="aspect-square overflow-hidden rounded-lg border border-white/10 bg-muted/30"
            >
              {s?.image_url ? (
                <img src={s.image_url} alt={`Слайд ${s.idx}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {s?.status ?? "pending"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
};

export default FactoryJob;