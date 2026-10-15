import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha | Clube Campeão World" },
      { name: "description", content: "Defina uma nova senha para sua conta do Clube Campeão World." },
      { property: "og:title", content: "Nova senha | Clube Campeão World" },
      { property: "og:description", content: "Defina uma nova senha para sua conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMsg("O link expirou ou é inválido. Peça um novo em “Esqueci a senha”.");
    else navigate({ to: "/" });
  };
  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-title">Definir nova senha</h1>
        <input className="auth-input" type="password" required minLength={6} placeholder="Nova senha" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <button className="auth-btn" disabled={busy} type="submit">{busy ? "Salvando…" : "Salvar senha"}</button>
        {msg && <p className="auth-msg">{msg}</p>}
      </form>
    </main>
  );
}
