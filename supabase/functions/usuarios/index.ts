// Gestão de usuários (precisa da chave de serviço, por isso fica no servidor).
// Ações: primeiro_acesso (só quando não há nenhum usuário), listar, criar, senha.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PAPEIS = ["direcao", "secretaria", "financeiro"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const adm = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida" }, 400); }
  const acao = body.acao;

  const validarSenha = (s: string) => typeof s === "string" && s.length >= 8;
  const email = String(body.email || "").trim().toLowerCase();
  const nome = String(body.nome || "").trim();

  // ---------- primeiro acesso: cria a primeira pessoa da direção (administradora)
  if (acao === "primeiro_acesso") {
    const { count } = await adm.from("perfis").select("user_id", { count: "exact", head: true });
    if ((count ?? 0) > 0) return json({ erro: "O primeiro acesso já foi feito. Entre com seu login." }, 403);
    if (!nome || !email || !validarSenha(body.senha)) return json({ erro: "Preencha nome, e-mail e senha (mínimo 8 caracteres)." }, 400);
    const { data, error } = await adm.auth.admin.createUser({ email, password: body.senha, email_confirm: true, user_metadata: { nome } });
    if (error) return json({ erro: error.message }, 400);
    const { error: e2 } = await adm.from("perfis").insert({ user_id: data.user.id, nome, email, papel: "direcao", admin: true });
    if (e2) { await adm.auth.admin.deleteUser(data.user.id); return json({ erro: e2.message }, 400); }
    return json({ ok: true });
  }

  // ---------- demais ações: só administrador logado
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await adm.auth.getUser(token);
  if (!u?.user) return json({ erro: "Sessão inválida. Entre novamente." }, 401);
  const { data: eu } = await adm.from("perfis").select("*").eq("user_id", u.user.id).maybeSingle();
  if (!eu?.ativo || !eu?.admin) return json({ erro: "Apenas administradores gerenciam usuários." }, 403);

  if (acao === "listar") {
    const { data: perfis } = await adm.from("perfis").select("*").order("nome");
    const { data: lista } = await adm.auth.admin.listUsers({ perPage: 1000 });
    const ult = new Map((lista?.users || []).map((x) => [x.id, x.last_sign_in_at]));
    return json({ usuarios: (perfis || []).map((p) => ({ ...p, ultimo_acesso: ult.get(p.user_id) || null })) });
  }

  if (acao === "criar") {
    if (!nome || !email || !validarSenha(body.senha)) return json({ erro: "Preencha nome, e-mail e senha (mínimo 8 caracteres)." }, 400);
    if (!PAPEIS.includes(body.papel)) return json({ erro: "Perfil inválido." }, 400);
    const { data, error } = await adm.auth.admin.createUser({ email, password: body.senha, email_confirm: true, user_metadata: { nome } });
    if (error) return json({ erro: error.message.includes("already") ? "Já existe um usuário com este e-mail." : error.message }, 400);
    const { error: e2 } = await adm.from("perfis").insert({
      user_id: data.user.id, nome, email, papel: body.papel, admin: !!body.admin,
      escolas: Array.isArray(body.escolas) ? body.escolas : [],
    });
    if (e2) { await adm.auth.admin.deleteUser(data.user.id); return json({ erro: e2.message }, 400); }
    return json({ ok: true });
  }

  if (acao === "senha") {
    if (!body.user_id || !validarSenha(body.senha)) return json({ erro: "Senha precisa ter ao menos 8 caracteres." }, 400);
    const { error } = await adm.auth.admin.updateUserById(body.user_id, { password: body.senha });
    if (error) return json({ erro: error.message }, 400);
    return json({ ok: true });
  }

  return json({ erro: "Ação desconhecida" }, 400);
});
