/* ==========================================================================
   Painel inicial, turmas, modelos de documentos e configurações
   (escolas, usuários, permissões, backup, auditoria).
   ========================================================================== */

rota("painel", async (main) => {
  const ano = S.anoAtual, hoje = hojeISO(), mesIni = hoje.slice(0, 8) + "01";
  main.innerHTML = pageHead("layout-dashboard", `Olá, ${S.perfil.nome.split(" ")[0]}!`, `${S.escola ? escolaNome(S.escola) : "Visão conjunta das escolas"} · ${dataExtenso()}`) + carregando();
  const fin = pode("financeiro");
  const [mats, turmas, cons, esp, chk, parc] = await Promise.all([
    fetchAll(() => filtraEscola(sb.from("v_matriculas").select("id,aluno_id,aluno_nome,status,tipo,escola_nome,serie,created_at,ano_letivo").in("ano_letivo", [ano, ano + 1]))),
    q(filtraEscola(sb.from("v_turmas").select("id,vagas,capacidade,matriculados,ano_letivo,nome,escola_nome").in("ano_letivo", [ano, ano + 1]))),
    fetchAll(() => filtraEscola(sb.from("contratos").select("id,aluno_id,titulo,status,enviado_em,token_expira").eq("status", "aguardando"))),
    fetchAll(() => filtraEscola(sb.from("lista_espera").select("id,status").in("status", ["aguardando", "vaga_disponivel", "contatado"]))),
    fetchAll(() => sb.from("doc_checklist").select("aluno_id").eq("status", "pendente")),
    fin ? fetchAll(() => filtraEscola(sb.from("v_parcelas").select("situacao,em_aberto,valor_pago,data_pagamento,vencimento,status").gte("vencimento", `${ano - 1}-01-01`))) : Promise.resolve([]),
  ]);
  const at = (a) => mats.filter((m) => m.ano_letivo === a && !["cancelada", "transferida"].includes(m.status));
  const pend = mats.filter((m) => ["em_andamento", "aguardando_documentos", "aguardando_assinatura", "rematricula_pendente"].includes(m.status));
  const vagas = (a) => turmas.filter((t) => t.ano_letivo === a).reduce((s, t) => s + Math.max(0, t.vagas), 0);
  const lot = turmas.filter((t) => t.vagas <= 0 && t.ano_letivo >= ano);
  const k = (ic, cor, v, t, href) => kpiCard({ ic, cor, valor: v, rotulo: t, href, dinheiro: String(v).startsWith("R$") });
  const recMes = parc.filter((p) => p.data_pagamento && p.data_pagamento >= mesIni).reduce((s, p) => s + Number(p.valor_pago), 0);
  const venc = parc.filter((p) => p.situacao === "atrasado").reduce((s, p) => s + Number(p.em_aberto), 0);
  const recentes = [...mats].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  main.innerHTML = pageHead("layout-dashboard", `Olá, ${S.perfil.nome.split(" ")[0]}!`, `${S.escola ? escolaNome(S.escola) : "Visão conjunta das escolas"} · ${dataExtenso()}`) +
    `${await alertasPrestadores().catch(() => "")}<div class="kpis">
      ${k("users", "blue", at(ano).length, `Matriculados ${ano}`, `#/matriculas?ano=${ano}`)}
      ${k("calendar-plus", "navy", at(ano + 1).length, `Matrículas ${ano + 1}`, `#/matriculas?ano=${ano + 1}`)}
      ${k("clock", "amber", pend.length, "Matrículas pendentes", `#/alunos?ano=${ano}`)}
      ${k("armchair", "green", vagas(ano + 1) || vagas(ano), `Vagas ${vagas(ano + 1) ? ano + 1 : ano}`, `#/matriculas?ano=${vagas(ano + 1) ? ano + 1 : ano}`)}
      ${k("file-signature", "amber", cons.length, "Contratos aguardando", "#/contratos?st=aguardando")}
      ${k("folder-x", "red", new Set(chk.map((c) => c.aluno_id)).size, "Alunos com documentos pendentes", "#/documentos")}
      ${k("hourglass", "navy", esp.length, "Na lista de espera", "#/espera")}
      ${fin ? k("banknote", "green", money(recMes), "Recebido no mês", "#/financeiro") + k("alert-triangle", "red", money(venc), "Vencido em aberto", "#/financeiro?sit=atrasado&ano=") : ""}
    </div>
    ${lot.length ? `<div class="msg warn"><i data-lucide="alert-triangle"></i><div><b>${lot.length} turma(s) lotada(s):</b> ${lot.map((t) => esc(`${t.nome} ${t.ano_letivo}${S.escola ? "" : " (" + t.escola_nome + ")"}`)).join(", ")}</div></div>` : ""}
    <div class="two">
      <div class="card"><h3>Matrículas recentes</h3><ul class="list">${recentes.length ? recentes.map((m) => `<li><div class="avatar">${esc(iniciais(m.aluno_nome))}</div><div style="flex:1"><a class="link" href="#/aluno/${m.aluno_id}">${esc(m.aluno_nome)}</a><div class="small muted">${esc(m.serie)} · ${m.ano_letivo}${S.escola ? "" : " · " + esc(m.escola_nome)} · ${m.tipo === "nova" ? "nova" : "rematrícula"}</div></div>${tag(STATUS_MAT, m.status)}</li>`).join("") : '<li class="empty-sm">Nenhuma matrícula ainda.</li>'}</ul></div>
      <div class="card"><h3>Contratos aguardando assinatura</h3><ul class="list">${cons.length ? cons.slice(0, 8).map((c) => `<li><div style="flex:1"><a class="link" href="#/aluno/${c.aluno_id}?aba=contratos">${esc(c.titulo)}</a><div class="small muted">Enviado ${dataHora(c.enviado_em)} · expira ${dataBR((c.token_expira || "").slice(0, 10))}</div></div></li>`).join("") : '<li class="empty-sm">Nenhum contrato pendente.</li>'}</ul></div>
    </div>`;
});

/* ---------- turmas ---------- */
rota("turmas", async (main, _, p) => {
  const ano = Number(p.ano || S.anoAtual), edit = pode("turmas");
  main.innerHTML = pageHead("school", "Turmas", "Capacidade, horários e mensalidade padrão. As vagas são calculadas automaticamente.",
    edit ? `<div class="row"><button class="btn sec" id="tCopiar"><i data-lucide="copy"></i>Copiar para ${ano + 1}</button><button class="btn" id="tNova"><i data-lucide="plus"></i>Nova turma</button></div>` : "") +
    `<div class="bar-tools"><select id="tAno">${anosOpts(ano)}</select><label class="chk"><input type="checkbox" id="tInat"> Mostrar inativas</label></div><div id="tBox">${carregando()}</div>`;
  icons();
  $("#tAno").onchange = (e) => ir("#/turmas?ano=" + e.target.value);
  const ts = await q(filtraEscola(sb.from("v_turmas").select("*").eq("ano_letivo", ano)).order("escola_nome").order("serie").order("nome"));
  const desenhar = () => {
    const l = ts.filter((t) => $("#tInat").checked || t.ativa);
    $("#tBox").innerHTML = l.length ? `<div class="scroll"><table><thead><tr>${S.escola ? "" : "<th>Escola</th>"}<th>Turma</th><th>Série</th><th>Período</th><th>Horário</th><th class="num">Capac.</th><th class="num">Matric.</th><th class="num">Vagas</th><th class="num">Mensalidade</th><th></th></tr></thead><tbody>
      ${l.map((t) => `<tr>${S.escola ? "" : `<td>${esc(t.escola_nome)}</td>`}<td><b>${esc(t.nome)}</b> ${t.ativa ? "" : '<span class="tag off">Inativa</span>'}</td><td>${esc(t.serie)}</td><td>${esc(t.periodo)}</td><td>${hora(t.hora_entrada)}–${hora(t.hora_saida)}</td>
        <td class="num">${t.capacidade}</td><td class="num">${t.matriculados}</td><td class="num">${t.vagas <= 0 ? '<span class="tag err">Lotada</span>' : t.vagas}</td><td class="num money">${t.mensalidade_padrao ? money(t.mensalidade_padrao) : "—"}</td>
        <td class="act">${edit ? `<button class="btn sm sec" data-t="${t.id}"><i data-lucide="pencil"></i></button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : vazio(`Nenhuma turma em ${ano}.`, "school");
    $$("[data-t]").forEach((b) => (b.onclick = () => editarTurma(ts.find((t) => t.id === b.dataset.t))));
    icons();
  };
  const editarTurma = (t) => modal({
    title: t ? "Editar turma" : "Nova turma", size: "lg",
    body: `<div class="grid"><div class="c6"><label class="req">Escola</label><select name="escola_id" ${t ? "disabled" : ""}>${escolaOpts(t?.escola_id || S.escola || S.escolas[0]?.id)}</select></div>
      <div class="c6"><label class="req">Ano letivo</label><select name="ano_letivo">${anosOpts(t?.ano_letivo || ano)}</select></div>
      <div class="c6"><label class="req">Série / ano</label><input name="serie" value="${esc(t?.serie)}" placeholder="Ex.: Maternal II, 3º ano"></div>
      <div class="c6"><label class="req">Nome da turma</label><input name="nome" value="${esc(t?.nome)}" placeholder="Ex.: Maternal II A"></div>
      <div class="c4"><label class="req">Período</label><select name="periodo">${opts(PERIODOS, t?.periodo)}</select></div>
      <div class="c4"><label>Entrada</label><input type="time" name="hora_entrada" value="${hora(t?.hora_entrada)}"></div><div class="c4"><label>Saída</label><input type="time" name="hora_saida" value="${hora(t?.hora_saida)}"></div>
      <div class="c4"><label class="req">Capacidade</label><input type="number" min="0" name="capacidade" value="${t?.capacidade ?? 20}"></div>
      <div class="c4"><label>Mensalidade padrão (R$)</label><input name="mensalidade_padrao" data-mask="money" value="${numIn(t?.mensalidade_padrao)}"></div>
      <div class="c4"><label class="chk" style="margin-top:34px"><input type="checkbox" name="ativa" ${t?.ativa === false ? "" : "checked"}> Ativa</label></div></div>`,
    acts: [
      ...(t && t.matriculados === 0 ? [{ label: "Excluir", cls: "ghost-danger", onClick: async () => { if (!(await confirmar("Excluir esta turma?", { perigo: true, ok: "Excluir" }))) return false; await tenta(() => q(sb.from("turmas").delete().eq("id", t.id)), "Turma excluída."); render(); } }] : []),
      { label: "Cancelar", cls: "sec" },
      { label: "Salvar", onClick: async (r) => {
        if (!exigir(r, ["serie", "nome", "capacidade"])) return false;
        const o = lerForm(r); o.ano_letivo = Number(o.ano_letivo); if (!o.mensalidade_padrao) o.mensalidade_padrao = null; if (t) delete o.escola_id;
        if (t && o.capacidade < t.matriculados && !(await confirmar(`A capacidade ficará menor que os ${t.matriculados} matriculados. Continuar?`))) return false;
        const ok = await tenta(() => t ? q(sb.from("turmas").update(o).eq("id", t.id)) : q(sb.from("turmas").insert(o)), "Turma salva.");
        if (ok === undefined) return false; render(); } }],
  });
  if (edit) {
    $("#tNova").onclick = () => editarTurma(null);
    $("#tCopiar").onclick = async () => {
      const ex = await q(filtraEscola(sb.from("turmas").select("escola_id,nome").eq("ano_letivo", ano + 1)));
      const ja = new Set(ex.map((x) => x.escola_id + x.nome));
      const novas = ts.filter((t) => t.ativa && !ja.has(t.escola_id + t.nome));
      if (!novas.length) return toast(`As turmas já existem em ${ano + 1}.`);
      if (!(await confirmar(`Criar ${novas.length} turma(s) em ${ano + 1} com a mesma estrutura de ${ano}? Você poderá ajustar valores depois.`))) return;
      await tenta(() => q(sb.from("turmas").insert(novas.map((t) => ({ escola_id: t.escola_id, ano_letivo: ano + 1, serie: t.serie, nome: t.nome, periodo: t.periodo, hora_entrada: t.hora_entrada, hora_saida: t.hora_saida, capacidade: t.capacidade, mensalidade_padrao: t.mensalidade_padrao })))), "Turmas copiadas.");
      ir(`#/turmas?ano=${ano + 1}`);
    };
  }
  $("#tInat").onchange = desenhar; desenhar();
});

/* ---------- modelos de documentos ---------- */
rota("modelos", async (main, id) => {
  if (!pode("modelos")) { main.innerHTML = vazio("Seu perfil não edita modelos.", "lock"); return; }
  if (id) return editorModelo(main, id === "novo" ? null : id);
  const ms = await q(filtraEscola(sb.from("modelos").select("id,escola_id,tipo,subtipo,nome,ativo,updated_at,updated_by")).order("tipo").order("nome"));
  main.innerHTML = pageHead("file-cog", "Modelos de documentos", "Cada escola tem seus próprios modelos. Alterações valem para documentos gerados depois; contratos já assinados não mudam.",
    `<button class="btn" onclick="ir('#/modelos/novo')"><i data-lucide="plus"></i>Novo modelo</button>`) +
    `<div class="msg warn"><i data-lucide="scale"></i><div>Os modelos iniciais são sugestões. Revise contrato e declarações com o responsável jurídico antes de usar em produção.</div></div>` +
    (ms.length ? `<div class="scroll"><table><thead><tr>${S.escola ? "" : "<th>Escola</th>"}<th>Tipo</th><th>Nome</th><th>Situação</th><th>Atualizado</th><th></th></tr></thead><tbody>${ms.map((m) => `<tr>${S.escola ? "" : `<td>${esc(escolaNome(m.escola_id))}</td>`}<td>${esc({ contrato: "Contrato", requerimento: "Requerimento", declaracao: "Declaração — " + (DECL[m.subtipo] || m.subtipo) }[m.tipo])}</td>
      <td><b>${esc(m.nome)}</b></td><td>${m.ativo ? '<span class="tag ok">Ativo</span>' : '<span class="tag off">Inativo</span>'}</td><td class="small">${dataHora(m.updated_at)}<br>${esc(m.updated_by || "")}</td><td class="act"><a class="btn sm sec" href="#/modelos/${m.id}"><i data-lucide="pencil"></i>Editar</a></td></tr>`).join("")}</tbody></table></div>` : vazio("Nenhum modelo.", "file-cog"));
});
async function editorModelo(main, id) {
  const m = id ? await q(sb.from("modelos").select("*").eq("id", id).single()) : { escola_id: S.escola || S.escolas[0]?.id, tipo: "declaracao", subtipo: "personalizada", nome: "", conteudo: "<h2 style=\"text-align:center\">TÍTULO</h2>\n<p>Texto com {{aluno.nome}}…</p>\n<p style=\"text-align:right\">{{escola.cidade}}, {{data.extenso}}.</p>", ativo: true };
  main.innerHTML = pageHead("file-cog", id ? "Editar modelo" : "Novo modelo", "Use os campos automáticos entre chaves duplas. Clique num campo para inserir.") +
    `<div class="card"><div class="grid">
      <div class="c4"><label>Escola</label><select name="escola_id" ${id ? "disabled" : ""}>${escolaOpts(m.escola_id)}</select></div>
      <div class="c4"><label>Tipo</label><select name="tipo" ${id ? "disabled" : ""}>${opts([["contrato", "Contrato"], ["requerimento", "Requerimento"], ["declaracao", "Declaração"]], m.tipo)}</select></div>
      <div class="c4"><label>Subtipo (declaração)</label><select name="subtipo">${opts([["padrao", "—"], ...Object.entries(DECL)], m.subtipo)}</select></div>
      <div class="c8"><label class="req">Nome</label><input name="nome" value="${esc(m.nome)}"></div>
      <div class="c4"><label class="chk" style="margin-top:34px"><input type="checkbox" name="ativo" ${m.ativo ? "checked" : ""}> Ativo</label></div></div>
      <label>Campos automáticos</label><div class="ph-list">${PLACEHOLDERS.map((p) => `<code data-ph="${p}">{{${p}}}</code>`).join("")}</div>
      <div class="two" style="margin-top:12px"><div><label>Conteúdo (HTML simples: &lt;p&gt;, &lt;b&gt;, &lt;h3&gt;, &lt;table&gt;)</label><textarea class="editor" id="mCont">${esc(m.conteudo)}</textarea></div>
      <div><label>Prévia (dados de exemplo)</label><div class="doc-prev" style="max-height:52vh"><div id="mPrev"></div></div></div></div>
      <div class="form-acts">${id ? `<button class="btn sec" id="mDup"><i data-lucide="copy"></i>Duplicar para outra escola</button>` : ""}<button class="btn sec" onclick="ir('#/modelos')">Voltar</button><button class="btn" id="mSalvar"><i data-lucide="save"></i>Salvar modelo</button></div></div>`;
  icons();
  const exemplo = Object.fromEntries(PLACEHOLDERS.map((p) => [p, "‹" + p.split(".")[1] + "›"]));
  Object.assign(exemplo, { "aluno.nome": "Maria Exemplo da Silva", "escola.nome": escolaNome(m.escola_id), "data.extenso": dataExtenso(), "matricula.ano_letivo": S.anoAtual + 1, "responsaveis.tabela": "<table><tr><th>Nome</th><th>Parentesco</th></tr><tr><td>Ana Exemplo</td><td>Mãe</td></tr></table>", "financeiro.tabela_parcelas": "<table><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr><tr><td>1/12</td><td>10/02</td><td>R$ 1.000,00</td></tr></table>", "escola.cnpj_texto": ", CNPJ 00.000.000/0001-00" });
  const prev = () => ($("#mPrev").innerHTML = folha(S.escolas.find((e) => e.id === m.escola_id), aplicarModelo($("#mCont").value, exemplo)));
  $("#mCont").addEventListener("input", prev); prev();
  $$("[data-ph]").forEach((c) => (c.onclick = () => { const t = $("#mCont"), s = t.selectionStart; t.setRangeText(`{{${c.dataset.ph}}}`, s, t.selectionEnd, "end"); t.focus(); prev(); }));
  const dados = () => { const o = lerForm(main); o.conteudo = $("#mCont").value; o.updated_by = S.perfil.nome; return o; };
  $("#mSalvar").onclick = async () => {
    const o = dados(); if (!o.nome) return toast("Dê um nome ao modelo.", true);
    if (id) { delete o.escola_id; delete o.tipo; }
    const r = await tenta(() => id ? q(sb.from("modelos").update(o).eq("id", id).select().single()) : q(sb.from("modelos").insert(o).select().single()), "Modelo salvo.");
    if (r && !id) ir("#/modelos/" + r.id);
  };
  if ($("#mDup")) $("#mDup").onclick = () => modal({ title: "Duplicar modelo", body: `<label>Para a escola</label><select id="dEsc">${escolaOpts(S.escolas.find((e) => e.id !== m.escola_id)?.id)}</select>`,
    acts: [{ label: "Cancelar", cls: "sec" }, { label: "Duplicar", onClick: async (r) => { const o = dados(); o.escola_id = $("#dEsc", r).value; o.tipo = m.tipo; o.nome = m.nome + " (cópia)"; const n = await tenta(() => q(sb.from("modelos").insert(o).select().single()), "Modelo duplicado."); if (n) ir("#/modelos/" + n.id); } }] });
}

/* ---------- configurações ---------- */
rota("config", async (main, _, p) => {
  if (!(ehDirecao() || S.perfil.admin)) { main.innerHTML = vazio("Apenas a direção acessa as configurações.", "lock"); return; }
  const aba = p.aba || "escolas";
  const abas = [["escolas", "Escolas", "building-2"], ...(S.perfil.admin ? [["usuarios", "Usuários", "user-cog"], ["permissoes", "Permissões", "shield"]] : []), ["backup", "Backup", "database-backup"], ["auditoria", "Registro de alterações", "history"], ["lgpd", "Privacidade (LGPD)", "lock"]];
  main.innerHTML = pageHead("settings", "Configurações", "") + `<div class="tabs">${abas.map(([k, t, ic]) => `<button class="${k === aba ? "on" : ""}" data-a="${k}"><i data-lucide="${ic}"></i>${t}</button>`).join("")}</div><div id="cfg">${carregando()}</div>`;
  $$("[data-a]").forEach((b) => (b.onclick = () => ir("#/config?aba=" + b.dataset.a)));
  icons();
  await CFG[aba]($("#cfg"));
  icons();
});

const MODULOS = { cadastro: "Cadastro de alunos e responsáveis", matricula: "Matrícula e rematrícula", contratos: "Contratos", documentos: "Documentos (excluir arquivos e checklist)", declaracoes: "Declarações", espera: "Lista de espera", turmas: "Turmas e vagas", modelos: "Modelos de documentos", financeiro: "Financeiro (parcelas, pagamentos, boletos e NF)", relatorios: "Relatórios" };

const CFG = {
  async escolas(box) {
    const es = await q(sb.from("escolas").select("*").order("nome"));
    box.innerHTML = es.map((e) => `<div class="card" style="margin-bottom:14px" data-e="${e.id}"><h3>${esc(e.nome)}</h3><div class="grid">
      <div class="c6"><label>Nome</label><input name="nome" value="${esc(e.nome)}"></div><div class="c6"><label>Razão social</label><input name="razao_social" value="${esc(e.razao_social)}"></div>
      <div class="c4"><label>CNPJ</label><input name="cnpj" value="${esc(e.cnpj)}"></div><div class="c4"><label>Telefone</label><input name="telefone" data-mask="tel" value="${esc(e.telefone)}"></div><div class="c4"><label>E-mail</label><input name="email" value="${esc(e.email)}"></div>
      <div class="c8"><label>Endereço completo</label><input name="endereco" value="${esc(e.endereco)}"></div><div class="c4"><label>Cidade (para documentos e foro)</label><input name="cidade" value="${esc(e.cidade)}"></div>
      <div class="c4"><label>Desconto de irmão</label><select name="desconto_irmao_tipo">${opts([["percentual", "Percentual (%)"], ["valor", "Valor fixo (R$)"]], e.desconto_irmao_tipo)}</select></div>
      <div class="c4"><label>Valor do desconto de irmão</label><input name="desconto_irmao_valor" data-mask="money" value="${numIn(e.desconto_irmao_valor)}"></div>
      <div class="c4"><label class="chk" style="margin-top:34px"><input type="checkbox" name="descontos_acumulam" ${e.descontos_acumulam ? "checked" : ""}> Desconto de irmão acumula com outros</label></div></div>
      <div class="form-acts"><button class="btn" data-s="${e.id}"><i data-lucide="save"></i>Salvar</button></div></div>`).join("") +
      `<p class="hint">Se o desconto não acumular, vale o maior entre o desconto da matrícula e o de irmão. Vale para mensalidades geradas a partir de agora.</p>`;
    $$("[data-s]", box).forEach((b) => (b.onclick = async () => {
      const card = $(`[data-e="${b.dataset.s}"]`, box); const o = lerForm(card);
      const ok = await tenta(() => q(sb.from("escolas").update(o).eq("id", b.dataset.s)), "Escola atualizada.");
      if (ok !== undefined) S.escolas = await q(sb.from("escolas").select("*").order("nome"));
    }));
  },

  async usuarios(box) {
    const { data, error } = await sb.functions.invoke("usuarios", { body: { acao: "listar" } });
    if (error || data?.erro) { box.innerHTML = `<div class="msg err">${esc(data?.erro || error.message)}</div>`; return; }
    const us = data.usuarios;
    box.innerHTML = `<div class="row" style="margin-bottom:12px"><p class="muted" style="flex:1">Cada pessoa tem seu próprio login. Desative quem sair da equipe (o histórico é mantido).</p><button class="btn" id="uNovo"><i data-lucide="user-plus"></i>Novo usuário</button></div>
      <div class="scroll"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Escolas</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${us.map((u) => `<tr><td><b>${esc(u.nome)}</b>${u.admin ? ' <span class="tag blue">admin</span>' : ""}</td><td>${esc(u.email)}</td><td>${esc(PAPEL[u.papel])}</td><td class="small">${u.papel === "direcao" ? "Todas" : u.escolas.map(escolaNome).join(", ") || '<span class="neg">nenhuma</span>'}</td>
        <td class="small">${dataHora(u.ultimo_acesso) || "nunca"}</td><td>${u.ativo ? '<span class="tag ok">Ativo</span>' : '<span class="tag off">Desativado</span>'}</td><td class="act"><button class="btn sm sec" data-u="${u.user_id}"><i data-lucide="pencil"></i>Editar</button></td></tr>`).join("")}</tbody></table></div>`;
    const form = (u = {}) => `<div class="grid"><div class="c6"><label class="req">Nome</label><input name="nome" value="${esc(u.nome)}"></div><div class="c6"><label class="req">E-mail</label><input type="email" name="email" value="${esc(u.email)}" ${u.user_id ? "disabled" : ""}></div>
      <div class="c6"><label class="req">Perfil</label><select name="papel">${opts(Object.entries(PAPEL), u.papel || "secretaria")}</select></div>
      <div class="c6"><label class="chk" style="margin-top:34px"><input type="checkbox" name="admin" ${u.admin ? "checked" : ""}> Administrador (gerencia usuários)</label></div>
      <div><label>Escolas que acessa (direção acessa todas)</label><div class="row">${S.escolas.map((e) => `<label class="chk"><input type="checkbox" class="uEsc" value="${e.id}" ${(u.escolas || []).includes(e.id) ? "checked" : ""}> ${esc(e.nome)}</label>`).join("")}</div></div>
      ${u.user_id ? `<div class="c6"><label class="chk"><input type="checkbox" name="ativo" ${u.ativo ? "checked" : ""}> Acesso ativo</label></div><div class="c6"><label>Nova senha (opcional)</label><input type="password" name="senha" autocomplete="new-password" placeholder="mínimo 8 caracteres"></div>` : `<div><label class="req">Senha inicial (mínimo 8)</label><input type="password" name="senha" autocomplete="new-password"></div>`}</div>`;
    $("#uNovo").onclick = () => modal({ title: "Novo usuário", size: "lg", body: form(), acts: [{ label: "Cancelar", cls: "sec" }, { label: "Criar acesso", onClick: async (r) => {
      const o = lerForm(r); o.escolas = $$(".uEsc:checked", r).map((c) => c.value);
      if (o.papel !== "direcao" && !o.escolas.length) { toast("Escolha ao menos uma escola.", true); return false; }
      const { data, error } = await sb.functions.invoke("usuarios", { body: { acao: "criar", ...o } });
      const erro = data?.erro || (error && ((await error.context?.json?.().catch(() => null))?.erro || error.message));
      if (erro) { toast(erro, true); return false; }
      toast("Usuário criado. Passe o e-mail e a senha para a pessoa."); render(); } }] });
    $$("[data-u]", box).forEach((b) => (b.onclick = () => { const u = us.find((x) => x.user_id === b.dataset.u); modal({ title: "Editar usuário", size: "lg", body: form(u), acts: [{ label: "Cancelar", cls: "sec" }, { label: "Salvar", onClick: async (r) => {
      const o = lerForm(r); const escolas = $$(".uEsc:checked", r).map((c) => c.value);
      if (u.user_id === S.user.id && (!o.ativo || !o.admin)) { toast("Você não pode remover o próprio acesso de administrador.", true); return false; }
      const ok = await tenta(() => q(sb.from("perfis").update({ nome: o.nome, papel: o.papel, admin: o.admin, ativo: o.ativo, escolas }).eq("user_id", u.user_id)));
      if (ok === undefined) return false;
      if (o.senha) { const { data } = await sb.functions.invoke("usuarios", { body: { acao: "senha", user_id: u.user_id, senha: o.senha } }); if (data?.erro) { toast(data.erro, true); return false; } }
      toast("Usuário atualizado."); render(); } }] }); }));
  },

  async permissoes(box) {
    const pm = await q(sb.from("papel_modulos").select("*"));
    const tem = (p, m) => pm.some((x) => x.papel === p && x.modulo === m);
    box.innerHTML = `<div class="card"><p class="sub">A direção tem acesso total. Ajuste o que secretaria e financeiro podem <b>alterar</b>. Todos os perfis consultam as fichas das escolas a que têm acesso.</p>
      <div class="scroll" style="box-shadow:none"><table><thead><tr><th>Módulo</th><th>Secretaria</th><th>Financeiro</th></tr></thead><tbody>
      ${Object.entries(MODULOS).map(([m, t]) => `<tr><td>${esc(t)}</td>${["secretaria", "financeiro"].map((p) => `<td><input type="checkbox" style="width:auto" data-p="${p}" data-m="${m}" ${tem(p, m) ? "checked" : ""}></td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
    $$("[data-p]", box).forEach((c) => (c.onchange = () => tenta(() => c.checked ? q(sb.from("papel_modulos").insert({ papel: c.dataset.p, modulo: c.dataset.m })) : q(sb.from("papel_modulos").delete().eq("papel", c.dataset.p).eq("modulo", c.dataset.m)), "Permissão atualizada. Vale no próximo acesso de quem usa esse perfil.")));
  },

  async backup(box) {
    box.innerHTML = `<div class="card"><h3>Cópia de segurança</h3><p class="sub">Baixa todos os dados que você tem permissão para ver (alunos, responsáveis, matrículas, parcelas, contratos, documentos emitidos, lista de espera, modelos e turmas). Os arquivos anexados ficam no armazenamento do Supabase.</p>
      <div class="row"><button class="btn" id="bJson"><i data-lucide="download"></i>Backup completo (JSON)</button><button class="btn sec" id="bXl"><i data-lucide="sheet"></i>Planilha (Excel)</button></div>
      <p class="hint" style="margin-top:12px">Guarde o arquivo em local seguro: ele contém dados pessoais de crianças. Recomendação: baixar toda semana. Para recuperação completa, o banco também pode ser restaurado pelo painel do Supabase (backups diários nos planos pagos).</p>
      <p class="hint" id="bUlt"></p></div>`;
    let ult = ""; try { ult = localStorage.getItem("ge.backup") || ""; } catch (_) {}
    $("#bUlt").textContent = ult ? "Último backup baixado neste navegador: " + dataHora(ult) : "Nenhum backup baixado neste navegador ainda.";
    const tabelas = ["escolas", "familias", "responsaveis", "alunos", "turmas", "matriculas", "parcelas", "contratos", "emissoes", "documentos", "doc_checklist", "lista_espera", "espera_contatos", "modelos", "papel_modulos"];
    const coletar = async () => { const o = { gerado_em: new Date().toISOString(), por: S.perfil.nome }; for (const t of tabelas) o[t] = await fetchAll(() => sb.from(t).select("*")); return o; };
    const marcar = () => { try { localStorage.setItem("ge.backup", new Date().toISOString()); } catch (_) {} };
    $("#bJson").onclick = async () => { const d = await tenta(coletar); if (!d) return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: "application/json" })); a.download = `backup-gestao-escolar-${hojeISO()}.json`; a.click(); marcar(); toast("Backup baixado."); };
    $("#bXl").onclick = async () => { const d = await tenta(coletar); if (!d) return; const wb = XLSX.utils.book_new(); tabelas.forEach((t) => d[t].length && XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d[t].map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "object" && v ? JSON.stringify(v).slice(0, 32000) : typeof v === "string" ? v.slice(0, 32000) : v])))), t.slice(0, 31))); XLSX.writeFile(wb, `backup-gestao-escolar-${hojeISO()}.xlsx`); marcar(); };
  },

  async auditoria(box) {
    const rs = await q(sb.from("auditoria").select("*").order("em", { ascending: false }).limit(300));
    box.innerHTML = `<p class="muted" style="margin-bottom:10px">Últimas 300 alterações${ehDirecao() ? "" : " feitas por você"}. Todas as inclusões, alterações e exclusões ficam registradas.</p>` +
      (rs.length ? `<div class="scroll"><table><thead><tr><th>Quando</th><th>Quem</th><th>Tabela</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>${rs.map((r) => `<tr><td class="small">${dataHora(r.em)}</td><td>${esc(r.usuario_nome)}</td><td>${esc(r.tabela)}</td><td>${esc({ INSERT: "Inclusão", UPDATE: "Alteração", DELETE: "Exclusão" }[r.acao])}</td><td class="small">${r.acao === "UPDATE" ? difTexto(r) : esc((r.depois || r.antes)?.nome || (r.depois || r.antes)?.titulo || r.registro_id || "")}</td></tr>`).join("")}</tbody></table></div>` : vazio("Sem registros.", "history"));
  },

  async lgpd(box) {
    box.innerHTML = `<div class="card"><h3>Como o sistema protege os dados</h3><ul style="line-height:1.8;margin:10px 0 0">
      <li>Login individual; cada perfil só altera o que lhe é permitido e só vê as escolas a que tem acesso (regras no próprio banco de dados, não só na tela).</li>
      <li>Sem portal de pais. O único acesso externo é o link individual de assinatura, que expira e mostra apenas o contrato daquele aluno.</li>
      <li>Arquivos guardados em área privada; abrem por link temporário de 2 minutos.</li>
      <li>Toda inclusão, alteração e exclusão fica registrada com data, hora e usuário.</li>
      <li>Não há campos de saúde, alergias ou pessoas autorizadas, conforme definido.</li>
      <li>Contratos assinados não podem ser alterados; ficam com hash SHA-256 e código de verificação.</li></ul>
      <h3 style="margin-top:18px">Recomendações para a direção</h3><ul style="line-height:1.8;margin:10px 0 0">
      <li>No Supabase › Authentication: desativar cadastro público e ativar proteção contra senhas vazadas.</li>
      <li>Desativar o acesso de quem sair da equipe no mesmo dia.</li>
      <li>Baixar o backup semanalmente e guardar em local protegido.</li>
      <li>Informar às famílias, no contrato e na política de privacidade, como os dados são usados (cláusula de proteção de dados no modelo).</li></ul></div>`;
  },
};
