import { createFileRoute, Link } from "@tanstack/react-router";
import { Game } from "@/components/game/game";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clube Campeão World | Gestão de futebol" },
      { name: "description", content: "Escolha seu clube do Brasileirão, monte o elenco e dispute 38 rodadas ao vivo." },
      { property: "og:title", content: "Clube Campeão World | Gestão de futebol" },
      { property: "og:description", content: "Escolha seu clube do Brasileirão, monte o elenco e dispute 38 rodadas ao vivo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="g-loading"><div className="g-spinner" /></div>;
  return (
    <>
      <Game key={user?.id ?? "guest"} userId={user?.id ?? null} />
      <div className="account-chip">
        {user ? (
          <button onClick={() => supabase.auth.signOut()}>Sair</button>
        ) : (
          <Link to="/auth" title="Entre para salvar na nuvem">Entrar</Link>
        )}
      </div>
    </>
  );
}
