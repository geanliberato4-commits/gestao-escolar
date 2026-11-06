// Gestão de usuários (precisa da chave de serviço, por isso fica no servidor).
// Ações: entrar (login por apelido), primeiro_acesso, listar, criar, salvar, excluir.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const PAPEIS = ["direcao", "secretaria", "financeiro"];
const LOGIN_RE = /^[a-z0-9._-]{3,30}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adm = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida" }, 400); }
  const acao = body.acao;
  const senhaOk = (s: string) => typeof s === "string" && s.length >= 8;
  const email = String(body.email || "").trim().toLowerCase();
  const nome = String(body.nome || "").trim();
  const login = body.login ? String(body.login).trim().toLowerCase() : null;

  // ---------- entrar com login (apelido) em vez do e-mail
  if (acao === "entrar") {
    const generico = json({ erro: "Login ou senha incorretos." }, 400);
    if (!login || typeof body.senha !== "string") return generico;
    const { data: p } = await adm.from("perfis").select("email,ativo").ilike("login", login).maybeSingle();
    if (!p?.email || !p.ativo) return generico;
    const pub = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await pub.auth.signInWithPassword({ email: p.email, password: body.senha });
    if (error || !data.session) return generico;
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  }

  // ---------- primeiro acesso
  if (acao === "primeiro_acesso") {
    const { count } = await adm.from("perfis").select("user_id", { count: "exact", head: true });
    if ((count ?? 0) > 0) return json({ erro: "O primeiro acesso já foi feito. Entre com seu login." }, 403);
    if (!nome || !email || !senhaOk(body.senha)) return json({ erro: "Preencha nome, e-mail e senha (mínimo 8 caracteres)." }, 400);
    const { data, error } = await adm.auth.admin.createUser({ email, password: body.senha, email_confirm: true, user_metadata: { nome } });
    if (error) return json({ erro: error.message }, 400);
    const { error: e2 } = await adm.from("perfis").insert({ user_id: data.user.id, nome, email, papel: "direcao", admin: true });
    if (e2) { await adm.auth.admin.deleteUser(data.user.id); return json({ erro: e2.message }, 400); }
    return json({ ok: true });
  }

  // ---------- demais ações: administrador logado
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data: u } = await adm.auth.getUser(token);
  if (!u?.user) return json({ erro: "Sessão inválida. Entre novamente." }, 401);
  const { data: eu } = await adm.from("perfis").select("*").eq("user_id", u.user.id).maybeSingle();
  if (!eu?.ativo || !eu?.admin) return json({ erro: "Apenas administradores gerenciam usuários." }, 403);
  const registrar = (alvo: string, depois: Record<string, unknown>) =>
    adm.from("auditoria").insert({ tabela: "usuarios", registro_id: alvo, acao: "UPDATE", depois, user_id: eu.user_id, usuario_nome: eu.nome });
  const protegido = async (alvo: string) =>
    alvo !== eu.user_id && !!(await adm.from("acesso_prestadores").select("user_id").eq("user_id", alvo).maybeSingle()).data;

  if (acao === "listar") {
    const { data: perfis } = await adm.from("perfis").select("*").order("nome");
    const { data: lista } = await adm.auth.admin.listUsers({ perPage: 1000 });
    const { data: prest } = await adm.from("acesso_prestadores").select("user_id");
    const ult = new Map((lista?.users || []).map((x) => [x.id, x.last_sign_in_at]));
    const ex = new Set((prest || []).map((x) => x.user_id));
    return json({ usuarios: (perfis || []).map((p) => ({ ...p, ultimo_acesso: ult.get(p.user_id) || null, exclusivo: ex.has(p.user_id) })) });
  }

  if (acao === "criar") {
    if (!nome || !email || !senhaOk(body.senha)) return json({ erro: "Preencha nome, e-mail e senha (mínimo 8 caracteres)." }, 400);
    if (!PAPEIS.includes(body.papel)) return json({ erro: "Perfil inválido." }, 400);
    if (login && !LOGIN_RE.test(login)) return json({ erro: "Login deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado." }, 400);
    if (login && (await adm.from("perfis").select("user_id").ilike("login", login).maybeSingle()).data) return json({ erro: "Este login já está em uso." }, 400);
    const { data, error } = await adm.auth.admin.createUser({ email, password: body.senha, email_confirm: true, user_metadata: { nome } });
    if (error) return json({ erro: /already/i.test(error.message) ? "Já existe um usuário com este e-mail." : error.message }, 400);
    const { error: e2 } = await adm.from("perfis").insert({
      user_id: data.user.id, nome, email, login, papel: body.papel, admin: !!body.admin,
      escolas: Array.isArray(body.escolas) ? body.escolas : [], permissoes: body.permissoes || null,
    });
    if (e2) { await adm.auth.admin.deleteUser(data.user.id); return json({ erro: e2.message }, 400); }
    await registrar(data.user.id, { criado: true, nome, email, login, papel: body.papel, admin: !!body.admin });
    return json({ ok: true });
  }

  if (acao === "salvar") {
    const alvo = String(body.user_id || "");
    // regras (admin, último administrador, usuário exclusivo, login único) ficam na função do banco,
    // chamada com o login de quem está fazendo a alteração para o histórico registrar o nome certo
    const userDb = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { error } = await userDb.rpc("admin_salvar_usuario", {
      p_user: alvo, p_nome: nome, p_login: login, p_papel: body.papel, p_admin: !!body.admin,
      p_escolas: Array.isArray(body.escolas) ? body.escolas : [], p_permissoes: body.permissoes || null, p_ativo: !!body.ativo,
    });
    if (error) return json({ erro: error.message }, 400);
    const { data: atual } = await adm.auth.admin.getUserById(alvo);
    const upd: Record<string, unknown> = { ban_duration: body.ativo ? "none" : "876000h" };
    const mudou: Record<string, unknown> = {};
    if (email && email !== (atual?.user?.email || "").toLowerCase()) { upd.email = email; upd.email_confirm = true; mudou.email = email; }
    if (body.senha) { if (!senhaOk(body.senha)) return json({ erro: "Senha precisa ter ao menos 8 caracteres." }, 400); upd.password = body.senha; mudou.senha = "redefinida"; }
    const { error: e3 } = await adm.auth.admin.updateUserById(alvo, upd);
    if (e3) return json({ erro: /already|registered/i.test(e3.message) ? "Já existe um usuário com este e-mail." : e3.message }, 400);
    if (mudou.email) await adm.from("perfis").update({ email }).eq("user_id", alvo);
    if (Object.keys(mudou).length) await registrar(alvo, mudou);
    return json({ ok: true });
  }

  if (acao === "excluir") {
    const alvo = String(body.user_id || "");
    if (alvo === eu.user_id) return json({ erro: "Você não pode excluir o próprio usuário." }, 400);
    if (await protegido(alvo)) return json({ erro: "Este usuário não pode ser excluído." }, 403);
    const { data: p } = await adm.from("perfis").select("*").eq("user_id", alvo).maybeSingle();
    if (!p) return json({ erro: "Usuário não encontrado." }, 404);
    if (p.admin && p.ativo) {
      const { count } = await adm.from("perfis").select("user_id", { count: "exact", head: true }).eq("admin", true).eq("ativo", true).neq("user_id", alvo);
      if ((count ?? 0) === 0) return json({ erro: "Não é possível: este é o último administrador ativo." }, 400);
    }
    // apaga só o acesso: matrículas, contratos, financeiro e histórico ficam (guardam o nome de quem fez)
    const { error } = await adm.auth.admin.deleteUser(alvo);
    if (error) return json({ erro: error.message }, 400);
    await adm.from("auditoria").insert({ tabela: "usuarios", registro_id: alvo, acao: "DELETE", antes: { nome: p.nome, email: p.email, papel: p.papel }, user_id: eu.user_id, usuario_nome: eu.nome });
    return json({ ok: true });
  }

  return json({ erro: "Ação desconhecida" }, 400);
});
