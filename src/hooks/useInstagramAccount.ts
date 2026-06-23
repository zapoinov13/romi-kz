import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

export interface InstagramAccount {
  igUserId: string;
  username: string | null;
  name: string | null;
  profilePictureUrl: string | null;
  pageId: string;
  pageName: string | null;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  active: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface AvailableIgAccount {
  ig_user_id: string;
  username: string;
  name: string | null;
  profile_picture_url: string | null;
  followers_count: number;
  media_count: number;
  page_id: string;
  page_name: string;
}

export function useInstagramAccount() {
  const { activeId: projectId } = useProjectsStore();
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!projectId) {
      setAccount(null);
      return;
    }
    const { data } = await (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
          };
        };
      };
    })
      .from("instagram_accounts_safe")
      .select("ig_user_id, username, name, profile_picture_url, page_id, page_name, followers_count, follows_count, media_count, active, last_sync_at, last_error")
      .eq("project_id", projectId)
      .maybeSingle();
    if (!data) {
      setAccount(null);
      return;
    }
    const row = data as {
      ig_user_id: string;
      username: string | null;
      name: string | null;
      profile_picture_url: string | null;
      page_id: string;
      page_name: string | null;
      followers_count: number | null;
      follows_count: number | null;
      media_count: number | null;
      active: boolean;
      last_sync_at: string | null;
      last_error: string | null;
    };
    setAccount({
      igUserId: row.ig_user_id,
      username: row.username,
      name: row.name,
      profilePictureUrl: row.profile_picture_url,
      pageId: row.page_id,
      pageName: row.page_name,
      followersCount: row.followers_count ?? 0,
      followsCount: row.follows_count ?? 0,
      mediaCount: row.media_count ?? 0,
      active: row.active,
      lastSyncAt: row.last_sync_at,
      lastError: row.last_error,
    });
  }, [projectId]);

  useEffect(() => { void refetch(); }, [refetch]);
  useRealtimeTable("instagram_accounts", refetch, !!projectId, 800);

  const listAvailable = useCallback(async (): Promise<{ accounts: AvailableIgAccount[]; error?: string }> => {
    if (!projectId) return { accounts: [], error: "no project" };
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-list-accounts", {
        body: { project_id: projectId },
      });
      if (error) return { accounts: [], error: error.message };
      return { accounts: data?.accounts ?? [], error: data?.error };
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const connect = useCallback(async (selected: AvailableIgAccount) => {
    if (!projectId) throw new Error("no project");
    const { data, error } = await supabase.functions.invoke("instagram-connect", {
      body: { project_id: projectId, page_id: selected.page_id, ig_user_id: selected.ig_user_id },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    await refetch();
  }, [projectId, refetch]);

  const disconnect = useCallback(async () => {
    if (!projectId) return;
    await supabase.functions.invoke("instagram-disconnect", { body: { project_id: projectId } });
    await refetch();
  }, [projectId, refetch]);

  const sync = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      await supabase.functions.invoke("instagram-sync", { body: { project_id: projectId } });
      await refetch();
    } finally {
      setLoading(false);
    }
  }, [projectId, refetch]);

  return { account, loading, listAvailable, connect, disconnect, sync, refetch };
}
