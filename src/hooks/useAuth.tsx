import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  ALL_MODULE_KEYS,
  type ModuleKey,
  defaultModulesForRole,
  type TeamRole,
} from "@/hooks/useTeamStore";

export type AppRole = "admin" | "manager" | "marketer" | "director";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  isAdmin: boolean;
  isManager: boolean;
  modules: ModuleKey[];
  hasModule: (key: ModuleKey) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function mapTeamRole(roles: AppRole[]): TeamRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("director")) return "director";
  return "marketer";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [modules, setModules] = useState<ModuleKey[]>([]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => {
          void fetchAccess(newSession.user.id);
        }, 0);
      } else {
        setRoles([]);
        setModules([]);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        void fetchAccess(data.session.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchAccess(userId: string) {
    const [{ data: roleRows }, { data: modRows }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("team_member_modules").select("module_key").eq("user_id", userId),
    ]);

    const nextRoles = (roleRows ?? []).map((r) => r.role as AppRole);
    setRoles(nextRoles);

    if (nextRoles.includes("admin")) {
      setModules([...ALL_MODULE_KEYS]);
      return;
    }

    const keys = (modRows ?? [])
      .map((m) => m.module_key as ModuleKey)
      .filter((k) => ALL_MODULE_KEYS.includes(k));

    setModules(keys.length > 0 ? keys : defaultModulesForRole(mapTeamRole(nextRoles)));
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      session,
      loading,
      roles,
      isAdmin: roles.includes("admin"),
      isManager: roles.includes("manager") || roles.includes("marketer") || roles.includes("director"),
      modules,
      hasModule: (key: ModuleKey) =>
        roles.includes("admin") || modules.includes(key),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [user, session, loading, roles, modules],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
