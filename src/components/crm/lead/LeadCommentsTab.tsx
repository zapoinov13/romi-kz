import { useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { MessageSquareLock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { TeamMember } from "@/hooks/useTeamStore";

export type InternalComment = {
  id: string;
  leadId: string;
  text: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
};

type Props = {
  leadId: string;
  comments: InternalComment[];
  members: TeamMember[];
  onAdded: (c: InternalComment) => void;
};

export function LeadCommentsTab({ leadId, comments, members, onAdded }: Props) {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const authorName =
    members.find((m) => m.id === user?.id)?.name ?? user?.email?.split("@")[0] ?? "Менеджер";

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("communications")
      .insert({
        lead_id: leadId,
        type: "note",
        direction: null,
        channel: null,
        content: text,
        status: "sent",
        is_draft: false,
        is_auto: false,
        created_by: user?.id ?? null,
      })
      .select("id, lead_id, content, created_by, created_at")
      .single();
    setSaving(false);
    if (error || !data) {
      if (error) toast.error(error.message);
      return;
    }
    const row = data as { id: string; lead_id: string; content: string; created_by: string | null; created_at: string };
    onAdded({
      id: row.id,
      leadId: row.lead_id,
      text: row.content ?? "",
      authorId: row.created_by,
      authorName: members.find((m) => m.id === row.created_by)?.name ?? authorName,
      createdAt: row.created_at,
    });
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-[280px] flex-col">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <MessageSquareLock className="h-3.5 w-3.5" />
        Внутренние комментарии
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Видны только сотрудникам CRM. Клиент их не увидит.
      </p>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {comments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 py-8 text-center text-xs text-muted-foreground">
            Комментариев пока нет
          </div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold">{c.authorName}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {format(new Date(c.createdAt), "dd MMM, HH:mm", { locale: ru })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.text}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Внутренний комментарий для команды…"
          rows={3}
          maxLength={2000}
        />
        <Button size="sm" className="gap-2" disabled={!draft.trim() || saving} onClick={() => void submit()}>
          <Send className="h-3.5 w-3.5" />
          Добавить
        </Button>
      </div>
    </div>
  );
}
