/* ==========================================================================
   Alunos: lista, ficha individual (dados, família/irmãos, matrículas,
   financeiro, contratos, documentos, declarações, histórico).
   ========================================================================== */

/* ---------- formulários reutilizados ---------- */
function formAluno(a = {}, { escolaFixa } = {}) {
  return `<div class="grid">
    <div class="c8"><label class="req">Nome completo</label><input name="nome" value="${esc(a.nome)}"></div>
    <div class="c4"><label>Escola</label><select name="escola_id" ${escolaFixa ? "disabled" : ""}>${escolaOpts(a.escola_id || S.escola || S.escolas[0]?.id)}</select></div>
    <div class="c3"><label class="req">Nascimento</label><input type="date" name="nascimento" value="${esc(a.nascimento)}"></div>
    <div class="c3"><label>Sexo</label><select name="sexo">${opts(["Feminino", "Masculino"], a.sexo, "—")}</select></div>
    <div class="c3"><label>CPF</label><input name="cpf" data-mask="cpf" value="${esc(fmtCPF(a.cpf))}"></div>
    <div class="c3"><label>RG</label><input name="rg" value="${esc(a.rg)}"></div>
    <div class="c4"><label>Naturalidade</label><input name="naturalidade" value="${esc(a.naturalidade)}" placeholder="Cidade/UF"></div>
    <div class="c4"><label>Nacionalidade</label><input name="nacionalidade" value="${esc(a.nacionalidade ?? "Brasileira")}"></div>
    <div class="c4"><label>Telefone de contato</label><input name="telefone" data-mask="tel" value="${esc(a.telefone)}"></div>
    <div><label>E-mail da família</label><input type="email" name="email" value="${esc(a.email)}"></div>
    <div class="c6"><label class="req">Nome da mãe</label><input name="mae_nome" value="${esc(a.mae_nome)}"></div>
    <div class="c6"><label>Nome do pai</label><input name="pai_nome" value="${esc(a.pai_nome)}"></div>
    <div class="c3"><label>CEP</label><input name="cep" data-mask="cep" value="${esc(a.cep)}"></div>
    <div class="c9"><label>Endereço (rua, número, complemento)</label><input name="endereco" value="${esc(a.endereco)}"></div>
    <div class="c5"><label>Bairro</label><input name="bairro" value="${esc(a.bairro)}"></div>
    <div class="c5"><label>Cidade</label><input name="cidade" value="${esc(a.cidade)}"></div>
    <div class="c2"><label>UF</label><input name="uf" maxlength="2" value="${esc(a.uf)}"></div>
    <div><label>Observações</label><textarea name="obs" placeholder="Informações administrativas">${esc(a.obs)}</textarea></div>
  </div>`;
}
function formResp(r = {}) {
  return `<div class="grid">
    <div class="c8"><label class="req">Nome completo</label><input name="nome" value="${esc(r.nome)}"></div>
    <div class="c4"><label class="req">Parentesco</label><select name="parentesco">${opts(PARENTESCOS, r.parentesco, "—")}</select></div>
    <div class="c4"><label>CPF</label><input name="cpf" data-mask="cpf" value="${esc(fmtCPF(r.cpf))}"></div>
    <div class="c4"><label>RG</label><input name="rg" value="${esc(r.rg)}"></div>
    <div class="c4"><label>Nascimento</label><input type="date" name="nascimento" value="${esc(r.nascimento)}"></div>
    <div class="c4"><label class="req">Telefone / WhatsApp</label><input name="telefone" data-mask="tel" value="${esc(r.telefone)}"></div>
    <div class="c4"><label>Outro telefone</label><input name="telefone2" data-mask="tel" value="${esc(r.telefone2)}"></div>
    <div class="c4"><label>E-mail</label><input type="email" name="email" value="${esc(r.email)}"></div>
    <div class="c3"><label>CEP</label><input name="cep" data-mask="cep" value="${esc(r.cep)}"></div>
    <div class="c9"><label>Endereço (rua, número, complemento) <button type="button" class="link small" data-copiar-end style="margin-left:8px">usar o endereço do aluno</button></label><input name="endereco" value="${esc(r.endereco)}"></div>
    <div class="c5"><label>Bairro</label><input name="bairro" value="${esc(r.bairro)}"></div>
    <div class="c4"><label>Cidade</label><input name="cidade" value="${esc(r.cidade)}"></div>
    <div class="c3"><label>Profissão</label><input name="profissao" value="${esc(r.profissao)}"></div>
  </div>`;
}
function validaCPFs(o, rotulo) {
  if (o.cpf && !cpfValido(o.cpf)) { toast(`CPF ${rotulo} inválido.`, true); return false; }
  if (o.cpf) o.cpf = fmtCPF(o.cpf);
  return true;
}
function editarResponsavel(familia_id, r, depois) {
  modal({
    title: r?.id ? "Editar responsável" : "Novo responsável", size: "lg", body: formResp(r || {}),
    acts: [
      ...(r?.id && pode("cadastro") ? [{ label: "Remover", cls: "ghost-danger", onClick: async () => {
        if (!(await confirmar(`Remover ${esc(r.nome)} da família?`, { perigo: true, ok: "Remover" }))) return false;
        const ok = await tenta(() => q(sb.from("responsaveis").delete().eq("id", r.id)), "Responsável removido.");
        if (ok !== undefined) depois && depois(); } }] : []),
      { label: "Cancelar", cls: "sec" },
      { label: "Salvar", onClick: async (root) => {
        if (!exigir(root, ["nome", "parentesco", "telefone"])) return false;
        const o = lerForm(root); if (!validaCPFs(o, "do responsável")) return false;
        const ok = await tenta(() => r?.id ? q(sb.from("responsaveis").update(o).eq("id", r.id)) : q(sb.from("responsaveis").insert({ ...o, familia_id })), "Responsável salvo.");
        if (ok === undefined) return false; depois && depois(); } },
    ],
  });
}

/* "usar o endereço do aluno" nos formulários de responsável */
S.endAluno = null;
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copiar-end]"); if (!b) return; e.preventDefault();
  const novo = $("#faNovo") ? lerForm($("#faNovo")) : null;
  const end = novo && (novo.endereco || novo.cidade) ? novo : S.endAluno;
  if (!end) return toast("Preencha antes o endereço do aluno.", true);
  const box = b.closest(".grid");
  [["cep", end.cep], ["endereco", end.endereco], ["bairro", end.bairro], ["cidade", end.cidade ? end.cidade + (end.uf ? "/" + end.uf : "") : ""]]
    .forEach(([n, v]) => { const el = $(`[name="${n}"]`, box); if (el && v) el.value = v; });
});

/* ---------- lista de alunos ---------- */
rota("alunos", async (main, _, p) => {
  const ano = Number(p.ano || S.anoAtual);
  main.innerHTML = pageHead("users", "Alunos", "Fichas individuais. Clique no nome para abrir.",
    pode("matricula") ? `<button class="btn" onclick="ir('#/matricula')"><i data-lucide="user-plus"></i>Nova matrícula</button>` : "") +
    `<div class="bar-tools">
      <input id="fNome" placeholder="Filtrar por nome" class="grow" value="${esc(p.q || "")}">
      <select id="fAno">${anosOpts(ano)}</select>
      <select id="fTurma"><option value="">Todas as turmas</option></select>
      <select id="fStatus">${opts(Object.entries(STATUS_MAT).map(([k, v]) => [k, v[0]]), p.status, "Todas as situações")}<option value="sem">Sem matrícula no ano</option></select>
      <label class="chk"><input type="checkbox" id="fInat" ${p.inat ? "checked" : ""}> Inativos</label>
      <button class="btn sec" id="xl"><i data-lucide="sheet"></i>Excel</button><button class="btn sec" id="lpdf"><i data-lucide="printer"></i>Lista</button>
    </div><div id="lista">${carregando()}</div>`;
  icons();
  const [alunos, mats, turmas] = await Promise.all([
    fetchAll(() => filtraEscola(sb.from("alunos").select("id,nome,nascimento,escola_id,ativo,mae_nome,familia_id")).order("nome")),
    fetchAll(() => filtraEscola(sb.from("v_matriculas").select("aluno_id,serie,turma_nome,turma_id,turma2_id,turma2_nome,status,periodo,resp_nome").eq("ano_letivo", ano))),
    q(filtraEscola(sb.from("turmas").select("id,nome,escola_id").eq("ano_letivo", ano)).order("nome")),
  ]);
  $("#fTurma").innerHTML = opts(turmas.map((t) => [t.id, t.nome + (S.escola ? "" : " — " + escolaNome(t.escola_id))]), p.turma, "Todas as turmas");
  const mapa = {}; mats.forEach((m) => { if (!mapa[m.aluno_id] || !["cancelada", "transferida"].includes(m.status)) mapa[m.aluno_id] = m; });
  let linhas = [];
  const desenhar = () => {
    const f = normal($("#fNome").value), tu = $("#fTurma").value, st = $("#fStatus").value, inat = $("#fInat").checked;
    linhas = alunos.filter((a) => (inat || a.ativo) && (!f || normal(a.nome).includes(f))).map((a) => ({ a, m: mapa[a.id] }))
      .filter(({ m }) => (!tu || m?.turma_id === tu || m?.turma2_id === tu) && (!st || (st === "sem" ? !m : m?.status === st)));
    $("#lista").innerHTML = linhas.length ? `<div class="scroll"><table><thead><tr><th>Aluno</th><th>Nascimento</th>${S.escola ? "" : "<th>Escola</th>"}<th>Série / turma ${ano}</th><th>Situação</th><th>Resp. financeiro</th></tr></thead><tbody>
      ${linhas.map(({ a, m }) => `<tr><td><a class="link" href="#/aluno/${a.id}">${esc(a.nome)}</a> ${a.ativo ? "" : '<span class="tag off">Inativo</span>'}<div class="small muted">${esc(a.mae_nome ? "Mãe: " + a.mae_nome : "")}</div></td>
        <td>${dataBR(a.nascimento)}</td>${S.escola ? "" : `<td>${esc(escolaNome(a.escola_id))}</td>`}
        <td>${m ? esc(m.serie) + (m.turma_nome ? `<div class="small muted">${esc(m.turma_nome)}${m.turma2_nome ? " + " + esc(m.turma2_nome) : ""} · ${esc(m.periodo || "")}</div>` : "") : '<span class="muted">—</span>'}</td>
        <td>${m ? tag(STATUS_MAT, m.status) : '<span class="tag off">Sem matrícula</span>'}</td><td>${esc(m?.resp_nome || "")}</td></tr>`).join("")}
      </tbody></table></div><p class="muted small">${linhas.length} aluno(s)</p>` : vazio("Nenhum aluno encontrado com esses filtros.", "users");
    icons();
  };
  ["fNome", "fTurma", "fStatus", "fInat"].forEach((id) => $("#" + id).addEventListener("input", desenhar));
  $("#fAno").onchange = (e) => ir(`#/alunos?ano=${e.target.value}`);
  $("#lpdf").onclick = () => {
    const tSel = turmas.find((t) => t.id === $("#fTurma").value);
    relatorioPDF(tSel ? `Lista da turma ${tSel.nome} — ${ano}` : `Lista de alunos — ${ano}`, linhas.map(({ a, m }, i) => ({ "Nº": i + 1, Aluno: a.nome, Nascimento: dataBR(a.nascimento), Série: m?.serie || "", Período: m?.periodo || "", "Resp. financeiro": m?.resp_nome || "" })));
  };
  $("#xl").onclick = () => exportXLSX(linhas.map(({ a, m }) => ({ Aluno: a.nome, Nascimento: dataBR(a.nascimento), Escola: escolaNome(a.escola_id), Ano: ano, Série: m?.serie || "", Turma: m?.turma_nome || "", Período: m?.periodo || "", Situação: m ? STATUS_MAT[m.status][0] : "Sem matrícula", "Resp. financeiro": m?.resp_nome || "", Ativo: a.ativo ? "Sim" : "Não" })), "alunos-" + ano);
  desenhar();
});

/* ---------- ficha individual ---------- */
rota("aluno", async (main, id, p) => {
  const a = await q(sb.from("alunos").select("*").eq("id", id).maybeSingle());
  if (!a) { main.innerHTML = vazio("Aluno não encontrado ou sem permissão de acesso.", "user-x"); return; }
  const [mats, resps] = await Promise.all([
    q(sb.from("v_matriculas").select("*").eq("aluno_id", id).order("ano_letivo", { ascending: false }).order("created_at", { ascending: false })),
    q(sb.from("responsaveis").select("*").eq("familia_id", a.familia_id).order("created_at")),
  ]);
  const atual = mats.find((m) => !["cancelada", "transferida"].includes(m.status)) || mats[0];
  S.endAluno = a;
  const aba = p.aba || "dados";
  const abas = [["dados", "Ficha", "id-card"], ["familia", "Família e irmãos", "users"], ["matriculas", "Matrículas", "clipboard-list", mats.length],
    ["financeiro", "Financeiro", "wallet"], ["contratos", "Contratos", "file-signature"], ["documentos", "Documentos", "folder-open"],
    ["declaracoes", "Declarações", "file-badge"], ["historico", "Histórico", "history"]];
  main.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="ficha-head">
      <div class="avatar">${esc(iniciais(a.nome))}</div>
      <div style="flex:1;min-width:220px"><h2>${esc(a.nome)} ${a.ativo ? "" : '<span class="tag off">Inativo</span>'}</h2>
      <div class="muted">${esc([escolaNome(a.escola_id), a.nascimento && `${dataBR(a.nascimento)} (${idade(a.nascimento)} anos)`, atual && `${atual.serie} · ${atual.ano_letivo}${atual.turma_nome ? " · " + atual.turma_nome : ""}`].filter(Boolean).join(" · "))}</div></div>
      ${atual ? tag(STATUS_MAT, atual.status) : '<span class="tag off">Sem matrícula</span>'}
    </div>
    <div class="quick">
      ${pode("matricula") ? `<button class="btn sm" onclick="ir('#/matricula?aluno=${a.id}')"><i data-lucide="user-plus"></i>Matrícula</button>` : ""}
      ${pode("matricula") && atual ? `<button class="btn sm sec" onclick="ir('#/rematricula?aluno=${a.id}')"><i data-lucide="refresh-cw"></i>Rematrícula</button>` : ""}
      <button class="btn sm sec" data-aba="financeiro"><i data-lucide="wallet"></i>Financeiro</button>
      <button class="btn sm sec" data-aba="contratos"><i data-lucide="file-signature"></i>Contratos</button>
      <button class="btn sm sec" data-aba="documentos"><i data-lucide="folder-open"></i>Documentos</button>
      ${pode("declaracoes") ? `<button class="btn sm sec" data-aba="declaracoes"><i data-lucide="file-badge"></i>Declarações</button>` : ""}
      <button class="btn sm sec" data-aba="familia"><i data-lucide="users"></i>Irmãos</button>
    </div></div>
    <div class="tabs">${abas.map(([k, t, ic, n]) => `<button data-aba="${k}" class="${k === aba ? "on" : ""}"><i data-lucide="${ic}"></i>${t}${n ? ` <span class="n">${n}</span>` : ""}</button>`).join("")}</div>
    <div id="abaBox">${carregando()}</div>`;
  $$("[data-aba]", main).forEach((b) => (b.onclick = () => ir(`#/aluno/${id}?aba=${b.dataset.aba}`)));
  icons();
  const box = $("#abaBox");
  const recarregar = () => render();
  const ctx = { a, mats, resps, atual, box, recarregar };
  await (FICHA[aba] || FICHA.dados)(ctx);
  icons();
});

const FICHA = {
  async dados({ a, box, recarregar }) {
    const edit = pode("cadastro") || pode("matricula");
    box.innerHTML = `<div class="card"><div class="row" style="margin-bottom:6px"><h3>Dados do aluno</h3>
      ${edit ? `<div class="right row"><button class="btn sm sec" id="ativar">${a.ativo ? "Marcar inativo" : "Reativar"}</button></div>` : ""}</div>
      <div id="fa">${formAluno(a, { escolaFixa: !ehDirecao() })}</div>
      ${edit ? `<div class="form-acts">${ehDirecao() ? `<button class="btn ghost-danger" id="excluirAluno" style="margin-right:auto"><i data-lucide="trash-2"></i>Excluir aluno</button>` : ""}<button class="btn" id="salvar"><i data-lucide="save"></i>Salvar alterações</button></div>` : ""}</div>`;
    if (!edit) $$("#fa input,#fa select,#fa textarea").forEach((e) => (e.disabled = true));
    if (!edit) return;
    $("#salvar").onclick = async () => {
      const r = $("#fa"); if (!exigir(r, ["nome", "nascimento", "mae_nome"])) return;
      const o = lerForm(r); if (!ehDirecao()) delete o.escola_id; if (!validaCPFs(o, "do aluno")) return;
      o.uf = o.uf?.toUpperCase();
      const ok = await tenta(() => q(sb.from("alunos").update(o).eq("id", a.id)), "Ficha atualizada. Os próximos documentos já usam os novos dados.");
      if (ok !== undefined) recarregar();
    };
    if ($("#excluirAluno")) $("#excluirAluno").onclick = () => modal({
      title: "Excluir aluno definitivamente",
      body: `<p>Isto apaga <b>${esc(a.nome)}</b> com matrículas, mensalidades, contratos em rascunho, declarações e arquivos anexados. <b>Não dá para desfazer.</b></p>
        <p class="muted">Use só para cadastro errado, duplicado ou de teste. Se o aluno saiu da escola, use <b>Marcar inativo</b>: o histórico fica guardado.</p>
        <label>Para confirmar, digite <b>EXCLUIR</b></label><input name="conf" autocomplete="off">`,
      acts: [{ label: "Cancelar", cls: "sec" }, { label: "Excluir definitivamente", cls: "danger", onClick: async (r) => {
        if ($('[name="conf"]', r).value.trim().toUpperCase() !== "EXCLUIR") { toast("Digite EXCLUIR para confirmar.", true); return false; }
        const arqs = await tenta(() => q(sb.rpc("excluir_aluno", { p_aluno: a.id })));
        if (arqs === undefined) return false;
        if (arqs?.length) await sb.storage.from("documentos").remove(arqs);
        toast("Aluno excluído."); ir("#/alunos");
      } }],
    });
    $("#ativar").onclick = async () => {
      if (!(await confirmar(a.ativo ? "Marcar o aluno como inativo? O histórico é preservado." : "Reativar o aluno?"))) return;
      await tenta(() => q(sb.from("alunos").update({ ativo: !a.ativo }).eq("id", a.id)), "Situação atualizada."); recarregar();
    };
  },

  async familia({ a, resps, box, recarregar }) {
    const irmaos = await q(sb.rpc("familia_irmaos", { p_familia: a.familia_id }));
    const fam = await q(sb.from("familias").select("*").eq("id", a.familia_id).single());
    const edit = pode("cadastro") || pode("matricula");
    box.innerHTML = `<div class="stack">
      <div class="card"><div class="row"><h3>Responsáveis da família “${esc(fam.nome)}”</h3>
        ${edit ? `<button class="btn sm right" id="novoResp"><i data-lucide="plus"></i>Adicionar responsável</button>` : ""}</div>
        <p class="sub">Os responsáveis são compartilhados entre irmãos. Cada matrícula escolhe o seu responsável financeiro.</p>
        ${resps.length ? `<div class="scroll"><table><thead><tr><th>Nome</th><th>Parentesco</th><th>CPF</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead><tbody>
        ${resps.map((r) => `<tr><td><b>${esc(r.nome)}</b></td><td>${esc(r.parentesco)}</td><td>${esc(fmtCPF(r.cpf))}</td><td>${esc(r.telefone)}</td><td>${esc(r.email)}</td>
          <td class="act">${edit ? `<button class="btn sm sec" data-r="${r.id}"><i data-lucide="pencil"></i>Editar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : vazio("Nenhum responsável cadastrado.")}
      </div>
      <div class="card"><div class="row"><h3>Irmãos</h3>${edit ? `<button class="btn sm sec right" id="vincular"><i data-lucide="link"></i>Vincular a outro aluno (irmão)</button>` : ""}</div>
        <p class="sub">Irmãos podem estar em escolas diferentes. Cada criança mantém matrícula, contrato e histórico próprios.</p>
        <ul class="list">${irmaos.map((i) => `<li><div class="avatar">${esc(iniciais(i.nome))}</div><div style="flex:1">
          ${i.acesso ? `<a class="link" href="#/aluno/${i.aluno_id}">${esc(i.nome)}</a>` : `<b>${esc(i.nome)}</b>`} ${i.aluno_id === a.id ? '<span class="tag blue">Este aluno</span>' : ""}
          <div class="small muted">${esc([i.escola, i.serie, i.ano_letivo].filter(Boolean).join(" · "))}</div></div>${i.status ? tag(STATUS_MAT, i.status) : ""}</li>`).join("")}</ul>
        ${irmaos.length > 1 ? `<div class="row" style="margin-top:10px"><button class="btn sm sec" onclick="ir('#/financeiro?familia=${a.familia_id}')"><i data-lucide="wallet"></i>Ver mensalidades da família</button></div>` : ""}
      </div></div>`;
    if (!edit) return;
    $("#novoResp").onclick = () => editarResponsavel(a.familia_id, null, recarregar);
    $$("[data-r]", box).forEach((b) => (b.onclick = () => editarResponsavel(a.familia_id, resps.find((r) => r.id === b.dataset.r), recarregar)));
    $("#vincular").onclick = () => escolherAluno("Vincular como irmão de…", async (outro) => {
      if (outro.id === a.id) return toast("Escolha outro aluno.", true);
      const o = await q(sb.from("alunos").select("familia_id,nome").eq("id", outro.id).single());
      if (o.familia_id === a.familia_id) return toast("Já são da mesma família.", true);
      if (!(await confirmar(`Juntar a família de <b>${esc(a.nome)}</b> com a de <b>${esc(o.nome)}</b>? Os responsáveis passam a ser compartilhados (revise duplicados depois).`))) return;
      const ok = await tenta(async () => {
        await q(sb.from("responsaveis").update({ familia_id: o.familia_id }).eq("familia_id", a.familia_id));
        await q(sb.from("alunos").update({ familia_id: o.familia_id }).eq("familia_id", a.familia_id));
      }, "Irmãos vinculados.");
      if (ok !== undefined) recarregar();
    });
  },

  async matriculas({ a, mats, box, recarregar }) {
    box.innerHTML = mats.length ? `<div class="stack">${mats.map((m) => `<div class="card">
      <div class="row"><h3>${m.ano_letivo} · ${esc(m.serie)} ${m.turma_nome ? "· " + esc(m.turma_nome) + (m.turma2_nome ? " + " + esc(m.turma2_nome) : "") : ""}</h3>${tag(STATUS_MAT, m.status)}
        <span class="tag">${m.tipo === "rematricula" ? "Rematrícula" : "Matrícula nova"}</span>
        <div class="right row">${pode("matricula") ? `<button class="btn sm sec" data-ed="${m.id}"><i data-lucide="pencil"></i>Editar</button>` : ""}
        <button class="btn sm sec" data-req="${m.id}"><i data-lucide="file-text"></i>Requerimento</button>
        ${pode("contratos") || pode("matricula") ? `<button class="btn sm sec" data-con="${m.id}"><i data-lucide="file-signature"></i>Contrato</button>` : ""}</div></div>
      <div class="kv" style="margin-top:12px">
        <div><span>Escola</span><b>${esc(m.escola_nome)}</b></div><div><span>Período / horário</span><b>${esc(m.periodo || "")} ${m.hora_entrada ? hora(m.hora_entrada) + "–" + hora(m.hora_saida) : ""}</b></div>
        <div><span>Data</span><b>${dataBR(m.data_matricula)}</b></div><div><span>Resp. financeiro</span><b>${esc(m.resp_nome || "—")}</b></div>
        <div><span>Mensalidade</span><b class="money">${money(m.valor_mensalidade)} × ${m.num_parcelas}</b></div>
        <div><span>Desconto</span><b>${m.desconto_tipo === "nenhum" ? "—" : m.desconto_tipo === "percentual" ? m.desconto_valor + "%" : money(m.desconto_valor)}${m.aplica_desconto_irmao ? " + irmão" : ""}</b></div>
        <div><span>Por indicação?</span><b>${m.indicacao ? "Sim — " + esc(m.indicador_aluno_nome || m.indicador_nome || "") : "Não"}</b></div>
        ${m.cond_primeira?.modo && m.cond_primeira.modo !== "integral" ? `<div style="grid-column:1/-1"><span>Condição especial</span><b>${esc(textoCond(m.cond_primeira))}</b></div>` : ""}
        ${m.motivo_encerramento ? `<div><span>Encerramento</span><b>${dataBR(m.data_encerramento)} — ${esc(m.motivo_encerramento)}</b></div>` : ""}
      </div>${m.obs ? `<p class="small muted" style="margin-top:10px">${esc(m.obs)}</p>` : ""}</div>`).join("")}</div>`
      : vazio("Sem matrículas. Use o botão Matrícula acima.", "clipboard-list");
    $$("[data-ed]", box).forEach((b) => (b.onclick = () => ir(`#/matricula?editar=${b.dataset.ed}`)));
    $$("[data-req]", box).forEach((b) => (b.onclick = () => gerarRequerimento(b.dataset.req)));
    $$("[data-con]", box).forEach((b) => (b.onclick = () => ir(`#/aluno/${a.id}?aba=contratos`)));
  },

  async financeiro({ a, box }) {
    if (!(pode("financeiro") || pode("matricula") || pode("declaracoes"))) { box.innerHTML = vazio("Seu perfil não acessa o financeiro.", "lock"); return; }
    const parc = await fetchAll(() => sb.from("v_parcelas").select("*").eq("aluno_id", a.id).order("vencimento"));
    box.innerHTML = `<div class="row" style="margin-bottom:10px"><button class="btn sm sec" onclick="ir('#/financeiro?familia=${a.familia_id}')"><i data-lucide="users"></i>Mensalidades da família inteira</button></div><div id="fin"></div>`;
    painelParcelas($("#fin"), parc, { porAno: true, recarregar: () => render() });
  },

  async contratos({ a, mats, box }) { await listaContratosAluno(box, a, mats); },
  async documentos({ a, box }) { await documentosAluno(box, a); },
  async declaracoes({ a, mats, box }) { await declaracoesAluno(box, a, mats); },

  async historico({ a, mats, box }) {
    const regs = [...(await q(sb.rpc("historico", { p_tabela: "alunos", p_id: a.id }))).map((r) => ({ ...r, o: "Ficha" }))];
    for (const m of mats) (await q(sb.rpc("historico", { p_tabela: "matriculas", p_id: m.id }))).forEach((r) => regs.push({ ...r, o: "Matrícula " + m.ano_letivo }));
    regs.sort((x, y) => new Date(y.em) - new Date(x.em));
    box.innerHTML = regs.length ? `<div class="scroll"><table><thead><tr><th>Quando</th><th>Quem</th><th>Onde</th><th>O que mudou</th></tr></thead><tbody>
      ${regs.map((r) => `<tr><td class="small">${dataHora(r.em)}</td><td>${esc(r.usuario_nome)}</td><td>${esc(r.o)}</td><td class="small">${difTexto(r)}</td></tr>`).join("")}</tbody></table></div>`
      : vazio("Sem alterações registradas.", "history");
  },
};

const ROTULOS = { nome: "Nome", status: "Situação", turma_id: "Turma", serie: "Série", valor_mensalidade: "Mensalidade", indicacao: "Indicação", indicador_nome: "Quem indicou", indicador_aluno_id: "Aluno indicador", indicacao_obs: "Obs. indicação", resp_financeiro_id: "Resp. financeiro", ativo: "Ativo", escola_id: "Escola", familia_id: "Família" };
function difTexto(r) {
  if (r.acao === "INSERT") return "Criado";
  if (r.acao === "DELETE") return "Removido";
  const ign = ["id", "created_at", "created_by", "updated_at"];
  return Object.keys(r.depois || {}).filter((k) => !ign.includes(k)).map((k) => {
    const f = (v) => (v == null || v === "" ? "vazio" : typeof v === "boolean" ? (v ? "sim" : "não") : String(v).length > 40 ? String(v).slice(0, 40) + "…" : v);
    return `<b>${esc(ROTULOS[k] || k)}</b>: ${esc(f(r.antes?.[k]))} → ${esc(f(r.depois[k]))}`;
  }).join("<br>");
}

/* seletor de aluno com busca (usado em vínculos e indicações) */
function escolherAluno(titulo, onPick) {
  modal({
    title: titulo, size: "lg",
    body: `<input id="eaQ" placeholder="Digite nome, responsável ou CPF"><div id="eaRes" style="margin-top:10px"></div>`,
    onOpen: (root, close) => {
      let t; $("#eaQ", root).addEventListener("input", (e) => {
        clearTimeout(t); t = setTimeout(async () => {
          const v = e.target.value.trim(); if (v.length < 2) return ($("#eaRes", root).innerHTML = "");
          const { data } = await sb.rpc("buscar", { q: v });
          $("#eaRes", root).innerHTML = (data || []).length ? `<ul class="list">${data.map((r) => `<li><div style="flex:1"><b>${esc(r.nome)}</b><div class="small muted">${esc([r.escola, r.serie, r.ano_letivo, r.responsaveis].filter(Boolean).join(" · "))}</div></div><button class="btn sm" data-id="${r.aluno_id}" data-n="${esc(r.nome)}">Escolher</button></li>`).join("")}</ul>` : '<div class="empty-sm">Nada encontrado.</div>';
          $$("[data-id]", root).forEach((b) => (b.onclick = () => { close(); onPick({ id: b.dataset.id, nome: b.dataset.n }); }));
        }, 220);
      });
    },
    acts: [{ label: "Fechar", cls: "sec" }],
  });
}
