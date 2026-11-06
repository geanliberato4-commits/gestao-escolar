/* ==========================================================================
   Matrícula (nova / edição), Rematrícula e Painel de matrículas e vagas.
   ========================================================================== */

rota("matricula", async (main, _, p) => {
  if (!pode("matricula")) { main.innerHTML = vazio("Seu perfil não faz matrículas.", "lock"); return; }
  const editando = p.editar ? await q(sb.from("matriculas").select("*").eq("id", p.editar).single()) : null;
  const anterior = p.rema ? await q(sb.from("matriculas").select("*").eq("id", p.rema).single()) : null;
  const espera = p.espera ? await q(sb.from("lista_espera").select("*").eq("id", p.espera).single()) : null;
  const alunoId = editando?.aluno_id || p.aluno || espera?.aluno_id || null;
  let aluno = alunoId ? await q(sb.from("alunos").select("*").eq("id", alunoId).single()) : null;
  S.endAluno = aluno;
  let familiaId = aluno?.familia_id || null;
  let resps = familiaId ? await q(sb.from("responsaveis").select("*").eq("familia_id", familiaId).order("created_at")) : [];
  const rema = !!anterior;
  const base = editando || (anterior ? { ...anterior, id: null, ano_letivo: anterior.ano_letivo + 1, turma_id: null, status: "em_andamento", tipo: "rematricula", data_matricula: hojeISO(), primeiro_vencimento: null, matricula_anterior_id: anterior.id, motivo_encerramento: null, data_encerramento: null, indicacao: false, indicador_nome: null, indicador_aluno_id: null, indicacao_obs: null, obs: null } : null)
    || { escola_id: espera?.escola_id || aluno?.escola_id || S.escola || S.escolas[0]?.id, ano_letivo: espera?.ano_pretendido || S.anoAtual + (new Date().getMonth() >= 8 ? 1 : 0), turma_id: espera?.turma_id, serie: espera?.serie, periodo: espera?.periodo, num_parcelas: 13, dia_vencimento: 10, material_forma: "Editora Netbil", desconto_tipo: "nenhum", desconto_valor: 0, status: "em_andamento", tipo: "nova", data_matricula: hojeISO() };
  let indicadorAluno = base.indicador_aluno_id ? await q(sb.from("alunos").select("id,nome").eq("id", base.indicador_aluno_id).maybeSingle()) : null;

  const titulo = editando ? "Editar matrícula" : rema ? "Rematrícula" : "Nova matrícula";
  main.innerHTML = pageHead(rema ? "refresh-cw" : "user-plus", titulo,
    editando ? `${aluno.nome} · ${editando.ano_letivo}` : rema ? `${aluno.nome}: dados reaproveitados de ${anterior.ano_letivo}. Revise e atualize.` : "Os dados digitados aqui alimentam a ficha, o financeiro e os documentos.") +
    `<div class="stack" id="fm">
      <div class="card sect" id="secAluno"></div>
      <div class="card sect" id="secResp"></div>
      <div class="card sect" id="secCurso"></div>
      <div class="card sect" id="secFin"></div>
      <div class="card sect" id="secOrigem"></div>
      <div class="card sect" id="secSit"></div>
      <div class="form-acts"><button class="btn sec" onclick="history.back()">Cancelar</button><button class="btn" id="salvarMat"><i data-lucide="save"></i>${editando ? "Salvar alterações" : "Salvar matrícula"}</button></div>
    </div>`;

  /* ---- 1. aluno ---- */
  const novosResp = []; // formulários de responsáveis novos (quando aluno novo)
  const desenharAluno = () => {
    $("#secAluno").innerHTML = aluno
      ? `<h3><i data-lucide="user"></i>Aluno</h3><div class="row"><div class="avatar">${esc(iniciais(aluno.nome))}</div><div><b>${esc(aluno.nome)}</b><div class="small muted">${dataBR(aluno.nascimento)} · ${esc(escolaNome(aluno.escola_id))} · Mãe: ${esc(aluno.mae_nome || "")}</div></div>
         <a class="link right" href="#/aluno/${aluno.id}" target="_blank">Abrir ficha para editar dados</a></div>`
      : `<div class="row"><h3><i data-lucide="user"></i>Dados do aluno</h3><button class="btn sm sec right" id="jaCad"><i data-lucide="search"></i>Aluno já cadastrado?</button></div>
         <div id="faNovo">${formAluno({ nome: espera?.crianca_nome, nascimento: espera?.nascimento, escola_id: base.escola_id })}</div>`;
    if (!aluno) {
      $("#jaCad").onclick = () => escolherAluno("Escolher aluno cadastrado", (x) => ir(`#/matricula?aluno=${x.id}${espera ? "&espera=" + espera.id : ""}`));
      $('#faNovo [name="escola_id"]').closest("div").classList.add("hidden"); // escola é escolhida no bloco do curso
    }
  };
  /* ---- 2. responsáveis ---- */
  const desenharResp = () => {
    const temFamilia = !!familiaId;
    $("#secResp").innerHTML = `<div class="row"><h3><i data-lucide="users"></i>Responsáveis</h3>
      ${!aluno ? `<button class="btn sm sec right" id="irmao"><i data-lucide="link"></i>${temFamilia ? "Trocar família" : "Tem irmão na escola? Usar a mesma família"}</button>` : ""}</div>
      <p class="sub">${temFamilia ? "Família já cadastrada (compartilhada com irmãos). Adicione ou corrija responsáveis se precisar." : "Cadastre pelo menos um responsável. Quem assina o contrato deve ter CPF."}</p>
      ${resps.length ? `<ul class="list list-tight">${resps.map((r) => `<li><div style="flex:1"><b>${esc(r.nome)}</b> <span class="muted small">${esc(r.parentesco || "")} · ${esc(fmtCPF(r.cpf) || "sem CPF")} · ${esc(r.telefone || "")}</span></div>
        <button class="btn sm sec" data-er="${r.id}">Editar</button></li>`).join("")}</ul>` : ""}
      <div id="novosResp"></div>
      <button class="btn sm sec" id="addResp" style="margin-top:10px"><i data-lucide="plus"></i>Adicionar responsável</button>`;
    const wrap = $("#novosResp");
    novosResp.forEach((n, i) => {
      const d = document.createElement("div"); d.className = "card"; d.style.cssText = "margin-top:12px;background:#fafcff";
      d.innerHTML = `<div class="row"><b>Novo responsável ${i + 1}</b><button class="btn sm ghost-danger right" data-rm="${i}">Remover</button></div>${formResp(n.dados)}`;
      n.el = d; wrap.appendChild(d);
    });
    $$("[data-rm]", wrap).forEach((b) => (b.onclick = () => { salvarRascunhoResp(); novosResp.splice(Number(b.dataset.rm), 1); desenharResp(); desenharFin(); }));
    $("#addResp").onclick = () => { salvarRascunhoResp(); novosResp.push({ dados: {} }); desenharResp(); desenharFin(); };
    $$("[data-er]").forEach((b) => (b.onclick = () => editarResponsavel(familiaId, resps.find((r) => r.id === b.dataset.er), async () => { resps = await q(sb.from("responsaveis").select("*").eq("familia_id", familiaId).order("created_at")); desenharResp(); desenharFin(); })));
    if ($("#irmao")) $("#irmao").onclick = () => escolherAluno("Escolha o irmão já cadastrado", async (x) => {
      const o = await q(sb.from("alunos").select("familia_id").eq("id", x.id).single());
      familiaId = o.familia_id; resps = await q(sb.from("responsaveis").select("*").eq("familia_id", familiaId).order("created_at"));
      salvarRascunhoResp(); novosResp.length = 0; desenharResp(); desenharFin(); toast("Família vinculada: os responsáveis do irmão foram carregados.");
    });
    icons();
  };
  const salvarRascunhoResp = () => novosResp.forEach((n) => { if (n.el) n.dados = lerForm(n.el); });
  if (!aluno && !familiaId) novosResp.push({ dados: espera ? { nome: espera.responsavel_nome, telefone: espera.telefone, email: espera.email } : {} });

  /* ---- 3. curso ---- */
  let turmas = [];
  const minhas = new Set([editando?.turma_id, editando?.turma2_id].filter(Boolean));
  const livreDe = (t) => (t ? t.vagas + (minhas.has(t.id) ? 1 : 0) : 0);
  const parDe = (t) => turmas.find((x) => x.serie === t.serie && x.periodo === (t.periodo === "Manhã" ? "Tarde" : "Manhã"));
  /* opções de turma conforme o período: no integral, cada série com manhã e tarde vira uma opção só */
  const montarOpcoes = () => {
    const per = $("#secCurso")._per, sel = $("#mTurma").value || base.turma_id;
    let lista;
    if (per === "Integral") {
      const manhas = turmas.filter((t) => t.periodo === "Manhã" && parDe(t));
      lista = [...manhas.map((t) => { const t2 = parDe(t); return [t.id, `${t.serie} — Integral (manhã + tarde) — ${Math.min(livreDe(t), livreDe(t2))} vaga(s)`]; }),
               ...turmas.filter((t) => t.periodo === "Integral").map((t) => [t.id, `${t.nome} — ${livreDe(t)} vaga(s)`])];
      const alvo = turmas.find((t) => t.id === sel); const manha = alvo?.periodo === "Tarde" ? parDe(alvo)?.id : sel;
      $("#mTurma").innerHTML = opts(lista, manha, lista.length ? "Selecione a série" : "Nenhuma série com turma de manhã e de tarde");
    } else {
      lista = turmas.filter((t) => !per || t.periodo === per).map((t) => [t.id, `${t.nome}${t.nome.includes(t.periodo) ? "" : " — " + t.periodo} — ${livreDe(t)} vaga(s)`]);
      const alvo = turmas.find((t) => t.id === sel); const mesmo = alvo && per && alvo.periodo !== per ? turmas.find((x) => x.serie === alvo.serie && x.periodo === per)?.id : sel;
      $("#mTurma").innerHTML = opts(lista, mesmo, lista.length ? "Selecione a turma" : "Nenhuma turma neste período");
    }
    avisoVaga();
  };
  const carregarTurmas = async () => {
    const esc_ = $("#mEscola").value, ano = $("#mAno").value;
    turmas = await q(sb.from("v_turmas").select("*").eq("escola_id", esc_).eq("ano_letivo", ano).eq("ativa", true).order("serie").order("nome"));
    montarOpcoes();
  };
  const turmasEscolhidas = () => {
    const t = turmas.find((x) => x.id === $("#mTurma").value); if (!t) return [];
    return $("#secCurso")._per === "Integral" && t.periodo !== "Integral" ? [t, parDe(t)].filter(Boolean) : [t];
  };
  const avisoVaga = () => {
    const ts = turmasEscolhidas();
    $("#vagaMsg").innerHTML = !ts.length ? "" : ts.map((t) => { const livre = livreDe(t);
      return livre <= 0 ? `<div class="msg err"><i data-lucide="alert-triangle"></i>${esc(t.nome)} lotada (${t.matriculados}/${t.capacidade}). Considere a lista de espera.</div>`
        : livre <= 2 ? `<div class="msg warn"><i data-lucide="alert-circle"></i>${esc(t.nome)}: restam ${livre} vaga(s).</div>` : `<div class="msg ok"><i data-lucide="check"></i>${esc(t.nome)}: ${livre} vaga(s) disponível(is).</div>`; }).join("")
      + (ts.length === 2 ? `<p class="hint">Período integral: a criança aparece nas listas das duas turmas, com uma única matrícula, contrato e financeiro.</p>` : "");
    icons();
  };
  $("#secCurso").innerHTML = `<h3><i data-lucide="school"></i>Escola, ano e turma</h3><div class="grid">
    <div class="c4"><label class="req">Escola</label><select id="mEscola" name="escola_id" ${editando ? "disabled" : ""}>${escolaOpts(base.escola_id)}</select></div>
    <div class="c2"><label class="req">Ano letivo</label><select id="mAno" name="ano_letivo">${anosOpts(base.ano_letivo)}</select></div>
    <div class="c6"><label class="req">Período</label><div class="radio-row">${["Manhã", "Tarde", "Integral"].map((x) => `<label><input type="radio" name="periodo" value="${x}" ${base.periodo === x ? "checked" : ""}> ${x}</label>`).join("")}</div></div>
    <div class="c6"><label>Turma</label><select id="mTurma" name="turma_id"></select></div>
    <div class="c6"><label class="req">Série / ano</label><input name="serie" value="${esc(base.serie)}"></div>
    <div class="c3"><label>Entrada</label><input type="time" name="hora_entrada" value="${esc(hora(base.hora_entrada))}"></div>
    <div class="c3"><label>Saída</label><input type="time" name="hora_saida" value="${esc(hora(base.hora_saida))}"></div>
    <div id="vagaMsg"></div></div>`;
  // o seletor de período é um grupo de opções; o valor lido é o marcado
  Object.defineProperty($("#secCurso"), "_per", { get: () => $('#secCurso [name="periodo"]:checked')?.value || "" });
  $$('#secCurso [name="periodo"]').forEach((r) => (r.onchange = () => { montarOpcoes(); $("#mTurma").onchange(); }));
  $("#mEscola").onchange = carregarTurmas; $("#mAno").onchange = carregarTurmas;
  $("#mTurma").onchange = () => {
    const ts = turmasEscolhidas(); avisoVaga(); if (!ts.length) return;
    const c = $("#secCurso");
    $('[name="serie"]', c).value = ts[0].serie;
    $('[name="hora_entrada"]', c).value = hora(ts[0].hora_entrada); $('[name="hora_saida"]', c).value = hora(ts[ts.length - 1].hora_saida);
    const t = ts[0];
    if (t.mensalidade_padrao && (!editando || !num($('[name="valor_mensalidade"]').value))) { $('[name="valor_mensalidade"]').value = numIn(t.mensalidade_padrao); prever(); }
  };

  /* ---- 4. financeiro ---- */
  const desenharFin = () => {
    salvarRascunhoResp();
    const opcoes = [...resps.map((r) => [r.id, `${r.nome} (${r.parentesco || "resp."})`]), ...novosResp.map((n, i) => ["novo:" + i, `${n.dados?.nome || "Novo responsável " + (i + 1)} (novo)`])];
    const atualSel = $('[name="resp_financeiro_id"]')?.value || base.resp_financeiro_id || opcoes[0]?.[0];
    const e = S.escolas.find((x) => x.id === ($("#mEscola")?.value || base.escola_id)) || {};
    const temFin = !!$("#secFin").innerHTML;
    if (temFin) { $('[name="resp_financeiro_id"]').innerHTML = opts(opcoes, atualSel, "Selecione"); return; }
    $("#secFin").innerHTML = `<h3><i data-lucide="wallet"></i>Condições financeiras</h3><div class="grid">
      <div class="c6"><label class="req">Responsável financeiro</label><select name="resp_financeiro_id">${opts(opcoes, atualSel, "Selecione")}</select></div>
      <div class="c3"><label class="req">Mensalidade (R$)</label><input name="valor_mensalidade" data-mask="money" inputmode="decimal" value="${numIn(base.valor_mensalidade)}"></div>
      <div class="c3"><label class="req">Nº total de parcelas</label><input type="number" name="num_parcelas" min="0" max="24" value="${base.num_parcelas ?? 13}"></div>
      <div class="c3"><label>1ª parcela diferente (R$)</label><input name="valor_primeira_parcela" data-mask="money" inputmode="decimal" value="${numIn(base.valor_primeira_parcela)}" placeholder="vazio = igual às demais"></div>
      <div class="c3"><label>Vencimento da 1ª parcela</label><input type="date" name="vencimento_primeira" value="${esc(base.vencimento_primeira || "")}"></div>
      <div class="c3"><label>Dia de vencimento</label><input type="number" name="dia_vencimento" min="1" max="31" value="${base.dia_vencimento ?? 10}"></div>
      <div class="c3"><label class="req">1º vencimento das mensalidades</label><input type="date" name="primeiro_vencimento" value="${esc(base.primeiro_vencimento || `${base.ano_letivo}-01-${String(base.dia_vencimento || 10).padStart(2, "0")}`)}"></div>
      <div class="c3"><label>Desconto</label><select name="desconto_tipo">${opts([["nenhum", "Sem desconto"], ["percentual", "Percentual (%)"], ["valor", "Valor fixo (R$)"]], base.desconto_tipo)}</select></div>
      <div class="c3"><label>Valor do desconto</label><input name="desconto_valor" data-mask="money" inputmode="decimal" value="${numIn(base.desconto_valor)}"></div>
      <div class="c6"><label>Motivo do desconto</label><input name="desconto_motivo" value="${esc(base.desconto_motivo)}" placeholder="Ex.: bolsa parcial, convênio"></div>
      <div class="c6"><label>&nbsp;</label><label class="chk"><input type="checkbox" name="aplica_desconto_irmao" ${base.aplica_desconto_irmao ? "checked" : ""}> Aplicar desconto de irmão
        <span class="muted small">(${e.desconto_irmao_tipo === "valor" ? money(e.desconto_irmao_valor) : (e.desconto_irmao_valor || 0) + "%"}${e.descontos_acumulam ? ", acumula" : ", não acumula"})</span></label></div>
      <div class="c6"><label>Material didático (R$)</label><input name="valor_material" data-mask="money" inputmode="decimal" value="${numIn(base.valor_material)}"></div>
      <div class="c6"><label>Forma de pagamento do material</label><input name="material_forma" value="${esc(base.material_forma ?? "Editora Netbil")}"></div>
      <div><label>Condições especiais</label><textarea name="condicoes_especiais" placeholder="Aparece no requerimento (condição especial)">${esc(base.condicoes_especiais)}</textarea></div>
      <div id="prev" class="hint"></div></div>`;
    $$("#secFin input,#secFin select").forEach((x) => x.addEventListener("input", prever)); prever();
  };
  function prever() {
    const f = lerForm($("#secFin")); const v = f.valor_mensalidade || 0;
    const d = f.desconto_tipo === "percentual" ? v * (f.desconto_valor || 0) / 100 : f.desconto_tipo === "valor" ? f.desconto_valor || 0 : 0;
    const n = f.num_parcelas || 0, p1 = f.valor_primeira_parcela > 0 ? f.valor_primeira_parcela : null;
    $("#prev").innerHTML = v ? (p1 ? `1ª parcela <b>${money(p1)}</b> + ${n - 1} × <b>${money(v - d)}</b> = <b>${money(p1 + (v - d) * Math.max(0, n - 1))}</b>` : `Parcela estimada: <b>${money(v - d)}</b> × ${n} = <b>${money((v - d) * n)}</b>`) + `${f.aplica_desconto_irmao ? " (o desconto de irmão é aplicado na geração se houver irmão matriculado no mesmo ano)" : ""}` : "";
  }

  /* ---- 5. origem / indicação ---- */
  $("#secOrigem").innerHTML = `<h3><i data-lucide="megaphone"></i>Origem da matrícula</h3>
    <label>Matrícula por indicação?</label>
    <div class="radio-row"><label><input type="radio" name="indicacao" value="nao" ${!base.indicacao ? "checked" : ""}> Não</label><label><input type="radio" name="indicacao" value="sim" ${base.indicacao ? "checked" : ""}> Sim</label></div>
    <div id="indBox" class="grid ${base.indicacao ? "" : "hidden"}">
      <div class="c6"><label>Nome de quem indicou</label><input name="indicador_nome" value="${esc(base.indicador_nome)}" placeholder="Pode ser pessoa de fora da escola"></div>
      <div class="c6"><label>Aluno / família indicadora (opcional)</label><div class="row"><span id="indAl" class="chip">${indicadorAluno ? esc(indicadorAluno.nome) : "Nenhum vinculado"}</span>
        <button class="btn sm sec" id="indPick" type="button">Vincular</button>${indicadorAluno ? '<button class="btn sm sec" id="indClr" type="button">Limpar</button>' : ""}</div></div>
      <div><label>Observações sobre a indicação</label><textarea name="indicacao_obs">${esc(base.indicacao_obs)}</textarea></div>
    </div>`;
  $$('#secOrigem [name="indicacao"]').forEach((r) => (r.onchange = () => $("#indBox").classList.toggle("hidden", r.value !== "sim" || !r.checked)));
  const ligaInd = () => {
    $("#indPick").onclick = () => escolherAluno("Aluno ou família que indicou", (x) => { indicadorAluno = x; $("#indAl").textContent = x.nome; if (!$('[name="indicador_nome"]').value) $('[name="indicador_nome"]').value = "Família de " + x.nome; });
    if ($("#indClr")) $("#indClr").onclick = () => { indicadorAluno = null; $("#indAl").textContent = "Nenhum vinculado"; };
  };
  ligaInd();

  /* ---- 6. situação ---- */
  $("#secSit").innerHTML = `<h3><i data-lucide="flag"></i>Andamento</h3><div class="grid">
    <div class="c4"><label>Situação da matrícula</label><select name="status">${opts(Object.entries(STATUS_MAT).filter(([k]) => editando || !["cancelada", "transferida"].includes(k)).map(([k, v]) => [k, v[0]]), base.status)}</select></div>
    <div class="c3"><label>Data</label><input type="date" name="data_matricula" value="${esc(base.data_matricula)}"></div>
    <div class="c5 ${editando ? "" : "hidden"}"><label>Motivo (cancelamento/transferência)</label><input name="motivo_encerramento" value="${esc(base.motivo_encerramento)}"></div>
    <div><label>Observações</label><textarea name="obs">${esc(base.obs)}</textarea></div>
    ${!editando ? `<div><label class="chk"><input type="checkbox" id="gerarParc" checked> Gerar as mensalidades automaticamente</label></div>` : `<div><label class="chk"><input type="checkbox" id="regerar"> Regerar mensalidades com as novas condições (só parcelas sem pagamento)</label></div>`}
  </div>`;

  desenharAluno(); desenharResp(); desenharFin(); await carregarTurmas(); icons();

  /* ---- salvar ---- */
  $("#salvarMat").onclick = async () => {
    const btn = $("#salvarMat");
    if (!aluno && !exigir($("#faNovo"), ["nome", "nascimento", "mae_nome"])) return;
    salvarRascunhoResp();
    for (const [i, n] of novosResp.entries()) { if (!n.dados.nome || !n.dados.parentesco || !n.dados.telefone) { toast(`Complete nome, parentesco e telefone do novo responsável ${i + 1}.`, true); return; } if (!validaCPFs(n.dados, "do responsável " + (i + 1))) return; }
    if (!resps.length && !novosResp.length) return toast("Cadastre pelo menos um responsável.", true);
    if (!$("#secCurso")._per) return toast("Escolha o período: Manhã, Tarde ou Integral.", true);
    if (!exigir($("#secCurso"), ["serie"]) || !exigir($("#secFin"), ["resp_financeiro_id", "primeiro_vencimento"])) return;
    const curso = lerForm($("#secCurso")), fin = lerForm($("#secFin")), ori = lerForm($("#secOrigem")), sit = lerForm($("#secSit"));
    curso.escola_id = $("#mEscola").value; curso.ano_letivo = Number(curso.ano_letivo);
    const lotadas = turmasEscolhidas().filter((t) => livreDe(t) <= 0);
    if (lotadas.length && !(await confirmar(`${lotadas.map((t) => esc(t.nome)).join(" e ")} ${lotadas.length > 1 ? "estão lotadas" : "está lotada"}. Matricular mesmo assim?`, { ok: "Matricular" }))) return;
    const rfSel = fin.resp_financeiro_id;
    if (String(rfSel).startsWith("novo:") ? !novosResp[Number(rfSel.slice(5))]?.dados.cpf : !resps.find((r) => r.id === rfSel)?.cpf) {
      if (!(await confirmar("O responsável financeiro está sem CPF. O contrato poderá ser assinado sem conferência de CPF. Continuar?"))) return;
    }
    btn.disabled = true;
    try {
      // família / aluno / responsáveis
      if (!familiaId) {
        const nomeFam = (lerForm($("#faNovo")).nome || "").split(" ").slice(-1)[0];
        familiaId = (await q(sb.from("familias").insert({ nome: "Família " + nomeFam }).select().single())).id;
      }
      if (!aluno) {
        const o = lerForm($("#faNovo")); o.escola_id = curso.escola_id; o.familia_id = familiaId; if (!validaCPFs(o, "do aluno")) throw new Error("CPF do aluno inválido.");
        o.uf = o.uf?.toUpperCase();
        aluno = await q(sb.from("alunos").insert(o).select().single());
        await q(sb.from("doc_checklist").insert(Object.keys(CHECK).map((item) => ({ aluno_id: aluno.id, item, status: item === "historico_transferencia" ? "nao_aplicavel" : "pendente" }))));
      } else if (aluno.escola_id !== curso.escola_id && !editando) {
        await q(sb.from("alunos").update({ escola_id: curso.escola_id }).eq("id", aluno.id));
      }
      const novosIds = [];
      for (const n of novosResp) novosIds.push((await q(sb.from("responsaveis").insert({ ...n.dados, familia_id: familiaId }).select().single())).id);
      novosResp.length = 0;
      const resp_financeiro_id = String(rfSel).startsWith("novo:") ? novosIds[Number(rfSel.slice(5))] : rfSel;

      const reg = {
        ...curso, ...fin, resp_financeiro_id, status: sit.status, data_matricula: sit.data_matricula, obs: sit.obs,
        indicacao: ori.indicacao === "sim", indicador_nome: ori.indicacao === "sim" ? ori.indicador_nome : null,
        indicador_aluno_id: ori.indicacao === "sim" ? indicadorAluno?.id || null : null, indicacao_obs: ori.indicacao === "sim" ? ori.indicacao_obs : null,
      };
      let mat;
      if (editando) {
        if (["cancelada", "transferida"].includes(sit.status) && !editando.data_encerramento) { reg.data_encerramento = hojeISO(); }
        reg.motivo_encerramento = sit.motivo_encerramento;
        mat = await q(sb.from("matriculas").update(reg).eq("id", editando.id).select().single());
        if ($("#regerar")?.checked) { const n = await q(sb.rpc("gerar_parcelas", { p_matricula: mat.id, p_regerar: true })); toast(`${n} mensalidade(s) regerada(s).`); }
        if (["cancelada", "transferida"].includes(sit.status) && editando.status !== sit.status) await tratarEncerramento(mat);
      } else {
        mat = await q(sb.from("matriculas").insert({ ...reg, aluno_id: aluno.id, tipo: rema ? "rematricula" : "nova", matricula_anterior_id: anterior?.id || null, espera_id: espera?.id || null }).select().single());
        if ($("#gerarParc")?.checked) await q(sb.rpc("gerar_parcelas", { p_matricula: mat.id, p_regerar: false }));
        if (espera) await q(sb.from("lista_espera").update({ status: "matriculado", aluno_id: aluno.id, matricula_id: mat.id }).eq("id", espera.id));
        if (anterior && anterior.status === "rematricula_pendente") await q(sb.from("matriculas").update({ status: "concluida" }).eq("id", anterior.id));
      }
      toast(editando ? "Matrícula atualizada." : "Matrícula salva!");
      posMatricula(mat, aluno);
    } catch (e) { console.error(e); toast(erroAmigavel(e), true); }
    finally { btn.disabled = false; }
  };
});

/* ao cancelar/transferir: decide o que fazer com as parcelas em aberto */
async function tratarEncerramento(mat) {
  const abertas = await q(sb.from("parcelas").select("id,vencimento").eq("matricula_id", mat.id).eq("status", "aberta").gt("vencimento", hojeISO()));
  if (!abertas.length) return;
  if (await confirmar(`Existem ${abertas.length} mensalidade(s) a vencer. Cancelar essas parcelas futuras? (as vencidas e pagas continuam como estão)`, { ok: "Cancelar parcelas futuras" })) {
    if (!pode("financeiro")) return toast("Peça ao financeiro para cancelar as parcelas futuras.", true);
    await tenta(() => q(sb.from("parcelas").update({ status: "cancelada", obs: "Cancelada por encerramento da matrícula em " + dataBR(hojeISO()) }).in("id", abertas.map((p) => p.id))), "Parcelas futuras canceladas.");
  }
}

function posMatricula(mat, aluno) {
  modal({
    title: "Matrícula registrada", size: "lg",
    body: `<p><b>${esc(aluno.nome)}</b> — ${esc(mat.serie)} · ${mat.ano_letivo}. O que deseja fazer agora?</p>
      <div class="stack" style="margin-top:12px">
        <button class="btn sec" id="pmReq"><i data-lucide="file-text"></i>Gerar requerimento de matrícula</button>
        ${pode("contratos") || pode("matricula") ? `<button class="btn sec" id="pmCon"><i data-lucide="file-signature"></i>Gerar contrato</button>` : ""}
        <button class="btn sec" id="pmDoc"><i data-lucide="folder-open"></i>Anexar documentos</button>
        <button class="btn" id="pmFicha"><i data-lucide="id-card"></i>Abrir ficha do aluno</button>
      </div>`,
    onOpen: (r, close) => {
      $("#pmReq", r).onclick = () => { close(); gerarRequerimento(mat.id); ir(`#/aluno/${aluno.id}?aba=matriculas`); };
      if ($("#pmCon", r)) $("#pmCon", r).onclick = async () => { close(); ir(`#/aluno/${aluno.id}?aba=contratos`); await gerarContrato(mat.id); };
      $("#pmDoc", r).onclick = () => { close(); ir(`#/aluno/${aluno.id}?aba=documentos`); };
      $("#pmFicha", r).onclick = () => { close(); ir(`#/aluno/${aluno.id}`); };
    },
  });
}

/* requerimento de matrícula: gera, mostra e permite arquivar */
async function gerarRequerimento(matriculaId) {
  const { ctx, m, e } = await contextoMatricula(matriculaId);
  const mod = await modeloDe(m.escola_id, "requerimento");
  if (!mod) return toast("Cadastre um modelo de requerimento em Modelos.", true);
  let corpo = aplicarModelo(mod.conteudo, ctx);
  const titulo = `Requerimento de matrícula ${m.ano_letivo} — ${ctx["aluno.nome"]}`;
  const montar = () => folha(e, corpo, `Gerado em ${dataHora(new Date())} por ${esc(S.perfil.nome)}`);
  const v = verDocumento({
    titulo, html: montar(), editavel: true,
    onEditar: async () => { const n = await editarHTML("Ajustar requerimento", corpo); if (n) { corpo = n; $("#docPrev", v.el).innerHTML = montar(); } },
    extras: [{ label: "Arquivar na ficha", icon: "archive", onClick: async () => {
      const ok = await tenta(async () => {
        const html = montar();
        const d = await arquivarPDF({ aluno_id: m.aluno_id, escola_id: m.escola_id, categoria: "requerimento", titulo, ano: m.ano_letivo, html });
        await q(sb.from("emissoes").insert({ aluno_id: m.aluno_id, escola_id: m.escola_id, matricula_id: m.id, tipo: "requerimento", subtipo: "matricula", titulo, conteudo: html, documento_id: d.id }));
      }, "Requerimento arquivado na ficha.");
      return ok !== undefined;
    } }],
  });
}

/* ---------- rematrícula ---------- */
rota("rematricula", async (main, _, p) => {
  if (!pode("matricula")) { main.innerHTML = vazio("Seu perfil não faz rematrículas.", "lock"); return; }
  if (p.aluno) {
    const ult = await q(sb.from("matriculas").select("id").eq("aluno_id", p.aluno).not("status", "in", "(cancelada,transferida)").order("ano_letivo", { ascending: false }).limit(1));
    if (!ult.length) { toast("Este aluno não tem matrícula anterior ativa.", true); return ir(`#/matricula?aluno=${p.aluno}`); }
    return ir(`#/matricula?aluno=${p.aluno}&rema=${ult[0].id}`);
  }
  const ano = Number(p.ano || S.anoAtual);
  main.innerHTML = pageHead("refresh-cw", "Rematrícula", `Alunos de ${ano} que ainda não têm matrícula em ${ano + 1}. O histórico do ano anterior é preservado.`) +
    `<div class="bar-tools"><label class="muted">Ano de origem</label><select id="rAno">${anosOpts(ano)}</select><input id="rQ" class="grow" placeholder="Filtrar por nome">
     <button class="btn sec" id="rPend"><i data-lucide="flag"></i>Marcar listados como “rematrícula pendente”</button></div><div id="rLista">${carregando()}</div>`;
  icons();
  $("#rAno").onchange = (e) => ir("#/rematricula?ano=" + e.target.value);
  const [mats, prox] = await Promise.all([
    fetchAll(() => filtraEscola(sb.from("v_matriculas").select("*").eq("ano_letivo", ano).not("status", "in", "(cancelada,transferida)")).order("aluno_nome")),
    fetchAll(() => filtraEscola(sb.from("matriculas").select("aluno_id").eq("ano_letivo", ano + 1).not("status", "in", "(cancelada,transferida)"))),
  ]);
  const ja = new Set(prox.map((x) => x.aluno_id));
  const lista = mats.filter((m) => !ja.has(m.aluno_id) && m.aluno_ativo);
  let vis = lista;
  const desenhar = () => {
    const f = normal($("#rQ").value); vis = lista.filter((m) => !f || normal(m.aluno_nome).includes(f));
    $("#rLista").innerHTML = vis.length ? `<div class="scroll"><table><thead><tr><th>Aluno</th>${S.escola ? "" : "<th>Escola</th>"}<th>${ano}</th><th>Situação</th><th>Mensalidade</th><th></th></tr></thead><tbody>
      ${vis.map((m) => `<tr><td><a class="link" href="#/aluno/${m.aluno_id}">${esc(m.aluno_nome)}</a></td>${S.escola ? "" : `<td>${esc(m.escola_nome)}</td>`}<td>${esc(m.serie)} ${m.turma_nome ? "· " + esc(m.turma_nome) : ""}</td>
        <td>${tag(STATUS_MAT, m.status)}</td><td class="money">${money(m.valor_mensalidade)}</td>
        <td class="act"><button class="btn sm" onclick="ir('#/matricula?aluno=${m.aluno_id}&rema=${m.id}')"><i data-lucide="refresh-cw"></i>Rematricular</button></td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">${vis.length} aluno(s) sem rematrícula para ${ano + 1}.</p>` : vazio(`Todos os alunos de ${ano} já têm matrícula em ${ano + 1}.`, "party-popper");
    icons();
  };
  $("#rQ").oninput = desenhar; desenhar();
  $("#rPend").onclick = async () => {
    const alvo = vis.filter((m) => m.status !== "rematricula_pendente");
    if (!alvo.length) return toast("Nada para marcar.");
    if (!(await confirmar(`Marcar ${alvo.length} matrícula(s) de ${ano} como “rematrícula pendente”? Ao rematricular, voltam para “concluída”.`))) return;
    await tenta(() => q(sb.from("matriculas").update({ status: "rematricula_pendente" }).in("id", alvo.map((m) => m.id))), "Marcadas como pendentes."); render();
  };
});

/* ---------- painel de matrículas e vagas ---------- */
rota("matriculas", async (main, _, p) => {
  const ano = Number(p.ano || S.anoAtual);
  main.innerHTML = pageHead("clipboard-list", "Matrículas e vagas", "Indicadores por escola, turma, série e período.") +
    `<div class="bar-tools"><select id="vAno">${anosOpts(ano)}</select><select id="vPer">${opts(PERIODOS, p.per, "Todos os períodos")}</select><div class="grow"></div>
    <button class="btn sec" id="vXl"><i data-lucide="sheet"></i>Excel</button><button class="btn sec" id="vPdf"><i data-lucide="printer"></i>PDF / imprimir</button></div><div id="vBox">${carregando()}</div>`;
  icons();
  $("#vAno").onchange = (e) => ir(`#/matriculas?ano=${e.target.value}`);
  $("#vPer").onchange = (e) => ir(`#/matriculas?ano=${ano}&per=${encodeURIComponent(e.target.value)}`);
  let [mats, turmas, esp] = await Promise.all([
    fetchAll(() => filtraEscola(sb.from("v_matriculas").select("id,aluno_id,aluno_nome,escola_id,escola_nome,turma_id,turma_nome,serie,periodo,status,tipo,data_matricula").eq("ano_letivo", ano))),
    q(filtraEscola(sb.from("v_turmas").select("*").eq("ano_letivo", ano)).order("serie").order("nome")),
    fetchAll(() => filtraEscola(sb.from("lista_espera").select("turma_id,serie,escola_id,status").eq("ano_pretendido", ano).in("status", ["aguardando", "vaga_disponivel", "contatado"]))),
  ]);
  if (p.per) { mats = mats.filter((m) => m.periodo === p.per); turmas = turmas.filter((t) => t.periodo === p.per); }
  const ativos = mats.filter((m) => !["cancelada", "transferida"].includes(m.status));
  const cont = (f) => mats.filter(f).length;
  const pend = ["em_andamento", "aguardando_documentos", "aguardando_assinatura", "rematricula_pendente"];
  const cap = turmas.reduce((s, t) => s + t.capacidade, 0);
  const lot = turmas.filter((t) => t.vagas <= 0).length;
  const espT = (t) => esp.filter((x) => x.turma_id === t.id || (!x.turma_id && x.serie === t.serie && x.escola_id === t.escola_id)).length;
  const kpi = (ic, cor, v, t) => kpiCard({ ic, cor, valor: v, rotulo: t });
  const porEscola = S.escolas.filter((e) => !S.escola || e.id === S.escola).map((e) => {
    const m = ativos.filter((x) => x.escola_id === e.id), tt = turmas.filter((t) => t.escola_id === e.id), c = tt.reduce((s, t) => s + t.capacidade, 0);
    return `<tr><td><b>${esc(e.nome)}</b></td><td class="num">${m.length}</td><td class="num">${m.filter((x) => x.tipo === "nova").length}</td><td class="num">${m.filter((x) => x.tipo === "rematricula").length}</td><td class="num">${c}</td><td class="num">${tt.reduce((s2, t) => s2 + Math.max(0, t.vagas), 0)}</td></tr>`;
  }).join("");
  const porStatus = Object.entries(STATUS_MAT).map(([k, v]) => `<tr><td>${tag(STATUS_MAT, k)}</td><td class="num">${cont((m) => m.status === k)}</td></tr>`).join("");
  $("#vBox").innerHTML = `<div class="kpis">
      ${kpi("users", "blue", ativos.length, "Matriculados")}${kpi("user-plus", "green", ativos.filter((m) => m.tipo === "nova").length, "Novas matrículas")}
      ${kpi("refresh-cw", "navy", ativos.filter((m) => m.tipo === "rematricula").length, "Rematrículas")}${kpi("clock", "amber", cont((m) => pend.includes(m.status)), "Pendências")}
      ${kpi("x-circle", "red", cont((m) => m.status === "cancelada"), "Cancelamentos")}${kpi("arrow-right-left", "red", cont((m) => m.status === "transferida"), "Transferências")}
      ${kpi("armchair", "green", turmas.reduce((s2, t) => s2 + Math.max(0, t.vagas), 0), "Vagas restantes")}${kpi("alert-triangle", lot ? "red" : "green", lot, "Turmas lotadas")}
    </div>
    <div class="two" style="margin-bottom:16px">
      <div class="card"><h3>Por escola</h3><p class="sub">Matrículas ativas no ano ${ano}</p><div class="scroll" style="box-shadow:none"><table><thead><tr><th>Escola</th><th class="num">Total</th><th class="num">Novas</th><th class="num">Remat.</th><th class="num">Capac.</th><th class="num">Vagas</th></tr></thead><tbody>${porEscola}</tbody></table></div></div>
      <div class="card"><h3>Por situação</h3><p class="sub">Clique em Alunos para filtrar a lista</p><div class="scroll" style="box-shadow:none"><table><tbody>${porStatus}</tbody></table></div></div>
    </div>
    <div class="card"><div class="row"><h3>Vagas por turma</h3>${pode("turmas") ? `<a class="link right" href="#/turmas?ano=${ano}">Editar turmas e capacidades</a>` : ""}</div><p class="sub">Alerta quando a turma lota. “Espera” = interessados aguardando vaga.</p>
      ${turmas.length ? `<div class="scroll" style="box-shadow:none"><table><thead><tr>${S.escola ? "" : "<th>Escola</th>"}<th>Turma</th><th>Série</th><th>Período</th><th class="num">Capac.</th><th class="num">Matric.</th><th class="num">Vagas</th><th>Ocupação</th><th class="num">Espera</th></tr></thead><tbody>
      ${turmas.map((t) => { const pc = t.capacidade ? Math.min(100, Math.round(t.matriculados / t.capacidade * 100)) : 100; const w = espT(t);
        return `<tr class="${t.vagas <= 0 ? "alert-row" : ""}">${S.escola ? "" : `<td>${esc(t.escola_nome)}</td>`}<td><b>${esc(t.nome)}</b></td><td>${esc(t.serie)}</td><td>${esc(t.periodo)}</td><td class="num">${t.capacidade}</td><td class="num">${t.matriculados}</td>
        <td class="num">${t.vagas <= 0 ? '<span class="tag err">Lotada</span>' : t.vagas}</td><td><div class="meter ${pc >= 100 ? "err" : pc >= 85 ? "warn" : ""}"><i style="width:${pc}%"></i></div></td><td class="num">${w ? `<span class="tag ${t.vagas > 0 ? "ok" : "warn"}">${w}</span>` : "—"}</td></tr>`; }).join("")}
      </tbody></table></div>` : vazio("Nenhuma turma cadastrada neste ano.", "school")}</div>`;
  icons();
  const linhas = () => turmas.map((t) => ({ Escola: t.escola_nome, Turma: t.nome, Série: t.serie, Período: t.periodo, Capacidade: t.capacidade, Matriculados: t.matriculados, Vagas: t.vagas, "Lista de espera": espT(t) }));
  $("#vXl").onclick = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas()), "Vagas por turma");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mats.map((m) => ({ Aluno: m.aluno_nome, Escola: m.escola_nome, Série: m.serie, Turma: m.turma_nome || "", Período: m.periodo || "", Tipo: m.tipo === "nova" ? "Nova" : "Rematrícula", Situação: STATUS_MAT[m.status][0], Data: dataBR(m.data_matricula) }))), "Matrículas");
    XLSX.writeFile(wb, `matriculas-vagas-${ano}-${hojeISO()}.xlsx`);
  };
  $("#vPdf").onclick = () => relatorioPDF(`Matrículas e vagas — ${ano}`, linhas());
});

/* relatório tabular genérico em PDF / impressão */
function relatorioPDF(titulo, linhas, { totais } = {}) {
  if (!linhas.length) return toast("Nada para imprimir.", true);
  const cols = Object.keys(linhas[0]);
  const e = S.escola ? S.escolas.find((x) => x.id === S.escola) : { nome: S.escolas.map((x) => x.nome).join(" | "), logos: S.escolas.filter((x) => x.logo) };
  const html = folha(e, `<h2>${esc(titulo)}</h2><table><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${linhas.map((l) => `<tr>${cols.map((c) => `<td>${esc(l[c])}</td>`).join("")}</tr>`).join("")}${totais ? `<tr>${cols.map((c) => `<th>${esc(totais[c] ?? "")}</th>`).join("")}</tr>` : ""}</table>`,
    `Emitido em ${dataHora(new Date())} por ${esc(S.perfil.nome)} · ${linhas.length} linha(s)`);
  verDocumento({ titulo, html });
}
