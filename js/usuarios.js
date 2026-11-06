/* ==========================================================================
   Gerenciamento de usuários (somente administradores).
   Regras de segurança ficam no servidor: último administrador, usuário com
   acesso exclusivo (Prestadores e Livro Caixa), login único, perda imediata
   de acesso ao desativar/excluir. As áreas exclusivas NÃO aparecem aqui.
   ========================================================================== */
const MODULOS_USR = [
  ["cadastro", "Alunos e responsáveis"], ["matricula", "Matrícula, rematrícula e vagas"], ["contratos", "Contratos"],
  ["documentos", "Documentos dos alunos"], ["declaracoes", "Declarações"], ["espera", "Lista de espera"],
  ["financeiro", "Financeiro (mensalidades)"], ["relatorios", "Relatórios"], ["turmas", "Turmas"], ["modelos", "Modelos de documentos"],
];
const NIVEIS = [["nenhum", "Sem acesso"], ["ver", "Visualizar"], ["editar", "Editar"]];

async function chamarUsuarios(body) {
  const { data, error } = await sb.functions.invoke("usuarios", { body });
  if (error) { const j = await error.context?.json?.().catch(() => null); throw new Error(j?.erro || error.message); }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

rota("usuarios", async (main) => {
  if (!S.perfil.admin) { main.innerHTML = vazio("Apenas administradores gerenciam usuários.", "lock"); return; }
  main.innerHTML = pageHead("user-cog", "Gerenciamento de usuários", "Cadastre, edite, desative ou exclua os acessos da equipe.",
    `<button class="btn" id="uNovo"><i data-lucide="user-plus"></i>Novo usuário</button>`) + `<div id="uBox">${carregando()}</div>`;
  icons();
  let padrao = [];
  try { padrao = await q(sb.from("papel_modulos").select("*")); } catch (_) {}
  const nivelPadrao = (papel, m) => (papel === "direcao" ? "editar" : padrao.some((x) => x.papel === papel && x.modulo === m) ? "editar" : "ver");
  let us = [];
  try { us = (await chamarUsuarios({ acao: "listar" })).usuarios; } catch (e) { $("#uBox").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
  const ativos = us.filter((u) => u.ativo).length;
  $("#uBox").innerHTML = `<div class="kpis">
      ${kpiCard({ ic: "users", cor: "blue", valor: us.length, rotulo: "Usuários" })}
      ${kpiCard({ ic: "user-check", cor: "green", valor: ativos, rotulo: "Ativos" })}
      ${kpiCard({ ic: "user-x", cor: "red", valor: us.length - ativos, rotulo: "Inativos" })}
      ${kpiCard({ ic: "shield", cor: "navy", valor: us.filter((u) => u.admin && u.ativo).length, rotulo: "Administradores" })}</div>
    <div class="bar-tools"><input id="uQ" class="grow" placeholder="Buscar por nome, e-mail ou login"><select id="uSt" style="width:auto">${opts([["", "Todos"], ["1", "Ativos"], ["0", "Inativos"]], "")}</select></div><div id="uTab"></div>`;
  const desenhar = () => {
    const f = normal($("#uQ").value), st = $("#uSt").value;
    const l = us.filter((u) => (!f || normal(`${u.nome} ${u.email} ${u.login || ""}`).includes(f)) && (!st || String(+u.ativo) === st));
    $("#uTab").innerHTML = l.length ? `<div class="scroll"><table><thead><tr><th>Nome</th><th>E-mail / login</th><th>Perfil</th><th>Escolas</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${l.map((u) => `<tr style="${u.ativo ? "" : "opacity:.6"}"><td><b>${esc(u.nome)}</b>${u.admin ? ' <span class="tag blue">admin</span>' : ""}${u.user_id === S.user.id ? ' <span class="tag off">você</span>' : ""}${u.permissoes ? ' <span class="tag warn" title="Permissões individuais">personalizado</span>' : ""}</td>
        <td class="small">${esc(u.email)}${u.login ? `<br>login: <b>${esc(u.login)}</b>` : ""}</td><td>${esc(PAPEL[u.papel])}</td>
        <td class="small">${u.papel === "direcao" ? "Todas" : u.escolas.map(escolaNome).filter(Boolean).join(", ") || '<span class="neg">nenhuma</span>'}</td>
        <td class="small">${u.ultimo_acesso ? dataHora(u.ultimo_acesso) : "nunca"}</td><td>${u.ativo ? '<span class="tag ok">Ativo</span>' : '<span class="tag off">Inativo</span>'}</td>
        <td class="act">${u.exclusivo && u.user_id !== S.user.id ? '<span class="small muted">protegido</span>' : `<button class="btn sm sec" data-u="${u.user_id}"><i data-lucide="pencil"></i>Editar</button>`}</td></tr>`).join("")}
      </tbody></table></div>` : vazio("Nenhum usuário encontrado.", "users");
    $$("[data-u]").forEach((b) => (b.onclick = () => formUsuario(us.find((u) => u.user_id === b.dataset.u))));
    icons();
  };
  $("#uQ").oninput = desenhar; $("#uSt").onchange = desenhar; desenhar();
  $("#uNovo").onclick = () => formUsuario(null);

  function formUsuario(u) {
    const novo = !u, eu = u?.user_id === S.user.id;
    const perm = u?.permissoes || null;
    modal({
      title: novo ? "Novo usuário" : `Editar usuário — ${u.nome}`, size: "lg",
      body: `<div class="grid">
        <div class="c6"><label class="req">Nome completo</label><input name="nome" value="${esc(u?.nome)}"></div>
        <div class="c6"><label class="req">E-mail</label><input type="email" name="email" value="${esc(u?.email)}" autocomplete="off"></div>
        <div class="c6"><label>Login (opcional)</label><input name="login" value="${esc(u?.login)}" autocapitalize="none" spellcheck="false" placeholder="ex.: maria.secretaria"><div class="hint">Permite entrar digitando o login em vez do e-mail.</div></div>
        <div class="c6"><label class="${novo ? "req" : ""}">${novo ? "Senha inicial" : "Redefinir senha"}</label><input type="password" name="senha" autocomplete="new-password" placeholder="${novo ? "mínimo 8 caracteres" : "deixe vazio para manter"}"></div>
        <div class="c6"><label class="req">Perfil</label><select name="papel">${opts(Object.entries(PAPEL), u?.papel || "secretaria")}</select></div>
        <div class="c6"><label>&nbsp;</label><label class="chk"><input type="checkbox" name="admin" ${u?.admin ? "checked" : ""} ${eu ? "disabled" : ""}> Administrador (gerencia usuários)</label>
          ${novo ? "" : `<label class="chk"><input type="checkbox" name="ativo" ${u.ativo ? "checked" : ""} ${eu ? "disabled" : ""}> Acesso ativo</label>`}</div>
        <div><label>Escolas que acessa</label><div class="row">${S.escolas.map((e) => `<label class="chk"><input type="checkbox" class="uEsc" value="${e.id}" ${(u?.escolas || []).includes(e.id) ? "checked" : ""}> ${esc(e.nome)}</label>`).join("")}</div><div class="hint">Direção acessa as duas escolas.</div></div>
      </div>
      <h3 style="margin-top:14px">Permissões</h3>
      <label class="chk"><input type="checkbox" id="uPers" ${perm ? "checked" : ""}> Personalizar as permissões desta pessoa (senão, vale o padrão do perfil)</label>
      <div id="uPerm"></div>
      <p class="hint" style="margin-top:8px"><i data-lucide="lock" style="width:14px;height:14px;vertical-align:-2px"></i> “Pagamentos de prestadores” e “Livro Caixa” são exclusivos e não podem ser liberados por aqui.</p>
      ${novo ? "" : `<details style="margin-top:12px"><summary class="link">Histórico de alterações deste usuário</summary><div id="uHist" class="small" style="margin-top:8px">${carregando()}</div></details>`}`,
      onOpen: (r) => {
        const desenharPerm = () => {
          const papel = $('[name="papel"]', r).value, pers = $("#uPers", r).checked;
          if (papel === "direcao") { $("#uPerm", r).innerHTML = `<div class="msg ok" style="margin-top:8px"><i data-lucide="shield-check"></i>Perfil Direção tem acesso total às áreas do sistema.</div>`; $("#uPers", r).closest("label").classList.add("hidden"); icons(); return; }
          $("#uPers", r).closest("label").classList.remove("hidden");
          $("#uPerm", r).innerHTML = `<div class="scroll" style="margin-top:8px;box-shadow:none"><table><thead><tr><th>Área</th>${NIVEIS.map(([, t]) => `<th style="text-align:center">${t}</th>`).join("")}</tr></thead><tbody>
            ${MODULOS_USR.map(([m, t]) => { const v = (pers && perm?.[m]) || nivelPadrao(papel, m); return `<tr><td>${t}</td>${NIVEIS.map(([n]) => `<td style="text-align:center"><input type="radio" name="p_${m}" value="${n}" ${v === n ? "checked" : ""} ${pers ? "" : "disabled"} style="width:auto"></td>`).join("")}</tr>`; }).join("")}
          </tbody></table></div>`;
        };
        $('[name="papel"]', r).onchange = desenharPerm; $("#uPers", r).onchange = desenharPerm; desenharPerm();
        if (!novo) sb.rpc("historico_usuario", { p_user: u.user_id }).then(({ data }) => {
          const el = $("#uHist", r); if (!el) return;
          const txt = (h) => h.acao === "DELETE" ? "excluído" : h.depois?.criado ? "usuário criado" : Object.entries(h.depois || {}).filter(([k]) => !["updated_at", "user_id"].includes(k))
            .map(([k, v]) => `<b>${esc({ nome: "Nome", login: "Login", papel: "Perfil", admin: "Administrador", ativo: "Ativo", escolas: "Escolas", permissoes: "Permissões", email: "E-mail", senha: "Senha" }[k] || k)}</b>: ${esc(k === "escolas" ? (v || []).map(escolaNome).join(", ") || "nenhuma" : k === "permissoes" ? (v ? Object.entries(v).map(([a, b]) => `${a}=${b}`).join(", ") : "padrão do perfil") : typeof v === "boolean" ? (v ? "sim" : "não") : v ?? "vazio")}`).join("<br>");
          el.innerHTML = (data || []).length ? data.map((h) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)">${dataHora(h.em)} — ${esc(h.usuario_nome || "sistema")}<br>${txt(h)}</div>`).join("") : "Sem alterações registradas.";
        });
      },
      acts: [
        ...(!novo && !eu ? [{ label: "Excluir usuário", cls: "danger", icon: "trash-2", onClick: async () => {
          const ok = await confirmar(`Excluir o usuário <b>${esc(u.nome)}</b>?<br><br>Ele perde o acesso na hora. Matrículas, contratos, registros financeiros e o histórico do que ele fez <b>continuam guardados</b>.<br><br>Se a pessoa pode voltar a trabalhar, prefira <b>desativar</b> (desmarcar “Acesso ativo”).`, { perigo: true, ok: "Excluir usuário" });
          if (!ok) return false;
          const r = await tenta(() => chamarUsuarios({ acao: "excluir", user_id: u.user_id }), "Usuário excluído.");
          if (r === undefined) return false; render(); } }] : []),
        { label: "Cancelar", cls: "sec" },
        { label: novo ? "Criar usuário" : "Salvar", onClick: async (r) => {
          const f = lerForm(r); const escolas = $$(".uEsc:checked", r).map((c) => c.value);
          if (!f.nome || !f.email) { toast("Preencha nome e e-mail.", true); return false; }
          if (novo && (!f.senha || f.senha.length < 8)) { toast("A senha inicial precisa ter pelo menos 8 caracteres.", true); return false; }
          if (f.senha && f.senha.length < 8) { toast("A nova senha precisa ter pelo menos 8 caracteres.", true); return false; }
          if (f.papel !== "direcao" && !escolas.length) { toast("Escolha ao menos uma escola.", true); return false; }
          let permissoes = null;
          if (f.papel !== "direcao" && $("#uPers", r).checked) { permissoes = {}; MODULOS_USR.forEach(([m]) => (permissoes[m] = $(`[name="p_${m}"]:checked`, r)?.value || "ver")); }
          const body = { nome: f.nome, email: f.email, login: f.login || null, senha: f.senha || undefined, papel: f.papel, admin: eu ? true : !!f.admin, escolas, permissoes };
          if (!novo && u.ativo && !(eu || f.ativo) && !(await confirmar(`Desativar <b>${esc(u.nome)}</b>? O acesso é bloqueado imediatamente; o histórico fica guardado.`, { ok: "Desativar" }))) return false;
          const res = await tenta(() => novo ? chamarUsuarios({ acao: "criar", ...body }) : chamarUsuarios({ acao: "salvar", user_id: u.user_id, ...body, ativo: eu ? true : !!f.ativo }),
            novo ? "Usuário criado. Passe o e-mail (ou login) e a senha para a pessoa." : "Usuário atualizado.");
          if (res === undefined) return false;
          if (eu) { const p = await sb.from("perfis").select("*").eq("user_id", S.user.id).single(); if (p.data) S.perfil = p.data; }
          render(); } },
      ],
    });
  }
});
