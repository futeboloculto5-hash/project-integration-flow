import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | Clube Campeão World" },
      { name: "description", content: "Entre ou crie sua conta para salvar sua carreira no Clube Campeão World." },
      { property: "og:title", content: "Entrar | Clube Campeão World" },
      { property: "og:description", content: "Entre ou crie sua conta para salvar sua carreira." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (user) navigate({ to: "/" }); }, [user, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg("E-mail ou senha incorretos. Se você já jogava antes da mudança, use “Criar conta” com o mesmo e-mail para definir uma nova senha.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) setMsg(error.message);
        else if (!data.session) setMsg("Enviamos um link de confirmação para seu e-mail. Confirme para entrar — sua carreira anterior será recuperada automaticamente.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        setMsg(error ? error.message : "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.");
      }
    } finally { setBusy(false); }
  };

  const social = async (provider: "google" | "lovable") => {
    const r = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (r.error) setMsg("Não foi possível entrar agora. Tente novamente.");
  };

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-title">{mode === "signup" ? "Criar conta" : mode === "forgot" ? "Recuperar senha" : "Entrar"}</h1>
        <p className="auth-sub">Salve sua carreira e continue de onde parou.</p>
        <input className="auth-input" type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {mode !== "forgot" && (
          <input className="auth-input" type="password" required minLength={6} placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        )}
        <button className="auth-btn" disabled={busy} type="submit">
          {busy ? "Aguarde…" : mode === "signup" ? "Criar conta" : mode === "forgot" ? "Enviar link" : "Entrar"}
        </button>
        {msg && <p className="auth-msg">{msg}</p>}
        {mode !== "forgot" && (
          <>
            <div className="auth-divider">ou</div>
            <button type="button" className="auth-btn-ghost" onClick={() => social("google")}>Continuar com Google</button>
            <button type="button" className="auth-btn-ghost" onClick={() => social("lovable")}>Continue with Lovable</button>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button type="button" className="auth-link" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMsg(null); }}>
            {mode === "signup" ? "Já tenho conta" : "Criar conta"}
          </button>
          <button type="button" className="auth-link" onClick={() => { setMode(mode === "forgot" ? "signin" : "forgot"); setMsg(null); }}>
            {mode === "forgot" ? "Voltar" : "Esqueci a senha"}
          </button>
        </div>
      </form>
    </main>
  );
}
