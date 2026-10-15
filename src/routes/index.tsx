import { createFileRoute, Link } from "@tanstack/react-router";
import Dashboard from "@/components/dashboard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clube Campeão World | Gestão de futebol" },
      { name: "description", content: "Assuma o comando, construa seu elenco e leve seu clube ao topo." },
      { property: "og:title", content: "Clube Campeão World | Gestão de futebol" },
      { property: "og:description", content: "Assuma o comando, construa seu elenco e leve seu clube ao topo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="auth-shell" />;
  return (
    <>
      {/* keyed so the career reloads from the account after sign-in */}
      <Dashboard key={user?.id ?? "guest"} />
      <div className="account-chip">
        {user ? (
          <>
            <span>{user.email}</span>
            <button onClick={() => supabase.auth.signOut()}>Sair</button>
          </>
        ) : (
          <>
            <span>Carreira não salva</span>
            <Link to="/auth">Entrar</Link>
          </>
        )}
      </div>
    </>
  );
}
