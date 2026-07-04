import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleKey } from "@/hooks/useTeamStore";

const HOME_ORDER: { key: ModuleKey; path: string }[] = [
  { key: "ads", path: "/ads" },
  { key: "crm", path: "/crm" },
  { key: "metrics", path: "/metrics" },
  { key: "sales_analytics", path: "/analytics/sales" },
  { key: "settings", path: "/settings" },
];

/** Редирект на первый доступный блок сотрудника. */
export function HomeRedirect() {
  const { loading, hasModule, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="grid h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const first = HOME_ORDER.find((o) => isAdmin || hasModule(o.key));
  return <Navigate to={first?.path ?? "/settings"} replace />;
}
