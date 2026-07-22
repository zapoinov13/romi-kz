import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MarketingPanel } from "@/components/auth/MarketingPanel";
import { AuthForm } from "@/components/auth/AuthForm";

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate("/ads", { replace: true });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/ads", { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="grid h-screen w-full grid-cols-1 overflow-hidden lg:grid-cols-[1.1fr_1fr]">
      <MarketingPanel />
      <div className="relative flex h-full flex-col items-center justify-center bg-white px-6 py-8 sm:px-10">
        <AuthForm />
        <p className="absolute bottom-5 left-0 right-0 px-6 text-center text-[11px] text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground hover:underline">
            Политика конфиденциальности
          </Link>
          <span className="mx-2 opacity-40">·</span>
          <Link to="/terms" className="hover:text-foreground hover:underline">
            Пользовательское соглашение
          </Link>
        </p>
      </div>
    </div>
  );
}
