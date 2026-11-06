/* ==========================================================================
   Financeiro: parcelas (individual e geral), pagamentos, boletos/NF,
   painel consolidado e relatórios.
   ========================================================================== */

/* tabela de parcelas reutilizável (ficha do aluno e painel geral) */
function painelParcelas(box, parc, { porAno = false, selecionavel = false, recarregar, mostrarAluno = false } = {}) {
  const fin = pode("financeiro");
  if (!parc.length) { box.innerHTML = vazio("Nenhuma mensalidade encontrada.", "wallet"); return; }
  const linha = (p) => `<tr class="${p.situacao === "atrasado" ? "alert-row" : ""}">
    ${selecionavel && fin ? `<td><input type="checkbox" class="selP" value="${p.id}" style="width:auto"></td>` : ""}
    ${mostrarAluno ? `<td><a class="link" href="#/aluno/${p.aluno_id}?aba=financeiro">${esc(p.aluno_nome)}</a><div class="small muted">${esc([S.escola ? "" : p.escola_nome, p.turma_nome || p.serie].filter(Boolean).join(" · "))}</div></td>` : ""}
    <td>${p.numero}${porAno ? "" : ` <span class="small muted">${p.ano_letivo}</span>`}<div class="small muted">${esc(p.resp_nome || "")}</div></td>
    <td>${dataBR(p.vencimento)}</td>
    <td class="num money">${money(p.valor)}${Number(p.desconto) ? `<div class="small muted">desc. ${money(p.desconto)}</div>` : ""}</td>
    <td class="num money">${Number(p.valor_pago) ? money(p.valor_pago) : "—"}<div class="small muted">${dataBR(p.data_pagamento)} ${esc(p.forma_pagamento || "")}</div></td>
    <td>${tag(SIT_PARC, p.situacao)}</td>
    <td>${p.boleto_emitido ? `<span class="tag ok" title="${esc(p.boleto_situacao || "")}">Sim</span>` : '<span class="tag off">Não</span>'}</td>
    <td>${p.nf_emitida ? `<span class="tag ok" title="${esc(p.nf_numero || "")} ${dataBR(p.nf_data)}">Sim</span>` : '<span class="tag off">Não</span>'}</td>
    <td class="act">${fin && p.status !== "cancelada" && p.situacao !== "pago" ? `<button class="btn sm ok" data-pg="${p.id}"><i data-lucide="banknote"></i>Pagar</button>` : ""}
      ${fin ? `<button class="btn sm sec" data-edp="${p.id}" title="Ajustar"><i data-lucide="pencil"></i></button>` : ""}</td></tr>`;
  const cab = `<tr>${selecionavel && fin ? '<th><input type="checkbox" id="selAll" style="width:auto"></th>' : ""}${mostrarAluno ? "<th>Aluno</th>" : ""}<th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Pago</th><th>Situação</th><th>Boleto</th><th>NF</th><th></th></tr>`;
  if (porAno) {
    const grupos = {}; parc.forEach((p) => (grupos[p.ano_letivo + "|" + p.matricula_id] ||= []).push(p));
    box.innerHTML = Object.entries(grupos).sort((a, b) => b[0].localeCompare(a[0])).map(([k, ps]) => {
      const t = resumo(ps);
      return `<div class="card" style="margin-bottom:14px"><div class="row"><h3>Ano letivo ${k.split("|")[0]} · ${esc(ps[0].serie || "")}</h3>
        <span class="chip">Previsto ${money(t.previsto)}</span><span class="chip">Recebido ${money(t.recebido)}</span><span class="chip" style="${t.vencido ? "background:var(--err-soft)" : ""}">Vencido ${money(t.vencido)}</span>
        ${fin ? `<button class="btn sm sec right" data-nova="${ps[0].matricula_id}"><i data-lucide="plus"></i>Parcela avulsa</button>` : ""}</div>
        <div class="scroll" style="margin-top:10px"><table><thead>${cab}</thead><tbody>${ps.sort((a, b) => a.numero - b.numero).map(linha).join("")}</tbody></table></div></div>`;
    }).join("");
  } else box.innerHTML = `<div class="scroll"><table><thead>${cab}</thead><tbody>${parc.map(linha).join("")}</tbody></table></div>`;
  $$("[data-pg]", box).forEach((b) => (b.onclick = () => registrarPagamento(parc.find((p) => p.id === b.dataset.pg), recarregar)));
  $$("[data-edp]", box).forEach((b) => (b.onclick = () => editarParcela(parc.find((p) => p.id === b.dataset.edp), recarregar)));
  $$("[data-nova]", box).forEach((b) => (b.onclick = () => novaParcela(parc.find((p) => p.matricula_id === b.dataset.nova), recarregar)));
  if ($("#selAll", box)) $("#selAll", box).onchange = (e) => $$(".selP", box).forEach((c) => (c.checked = e.target.checked));
  icons();
}
function resumo(ps) {
  const v = ps.filter((p) => p.status !== "cancelada");
  return {
    previsto: v.reduce((s, p) => s + Number(p.valor), 0), recebido: v.reduce((s, p) => s + Number(p.valor_pago), 0),
    aberto: v.reduce((s, p) => s + Number(p.em_aberto), 0), vencido: v.filter((p) => p.situacao === "atrasado").reduce((s, p) => s + Number(p.em_aberto), 0),
    inad: new Set(v.filter((p) => p.situacao === "atrasado").map((p) => p.aluno_id)).size,
    bolEm: v.filter((p) => p.boleto_emitido).length, bolPend: v.filter((p) => !p.boleto_emitido && p.situacao !== "pago").length,
    nfEm: v.filter((p) => p.nf_emitida).length, nfPend: v.filter((p) => !p.nf_emitida && Number(p.valor_pago) > 0).length, n: v.length,
  };
}

function registrarPagamento(p, depois) {
  modal({
    title: `Registrar pagamento — parcela ${p.numero}`,
    body: `<p class="muted">${esc(p.aluno_nome || "")} · vencimento ${dataBR(p.vencimento)} · valor ${money(p.valor)} · já pago ${money(p.valor_pago)}</p>
      <div class="grid"><div class="c6"><label class="req">Valor recebido (R$)</label><input name="v" data-mask="money" inputmode="decimal" value="${numIn(p.em_aberto)}"></div>
      <div class="c6"><label class="req">Data do pagamento</label><input type="date" name="d" value="${hojeISO()}"></div>
      <div class="c6"><label>Forma</label><select name="f">${opts(["Boleto", "PIX", "Cartão", "Dinheiro", "Transferência", "Outro"], "Boleto")}</select></div>
      <div><label>Observação</label><input name="o" placeholder="Ex.: pagamento parcial combinado"></div></div>
      <p class="hint">Se o valor for menor que o devido, a parcela fica como “parcial”.</p>`,
    acts: [{ label: "Cancelar", cls: "sec" }, { label: "Confirmar recebimento", cls: "ok", onClick: async (r) => {
      const f = lerForm(r); if (!f.v || f.v <= 0 || !f.d) { toast("Informe valor e data.", true); return false; }
      const pago = Math.round((Number(p.valor_pago) + f.v) * 100) / 100;
      const upd = { valor_pago: pago, data_pagamento: f.d, forma_pagamento: f.f, status: pago >= Number(p.valor) - 0.009 ? "paga" : "parcial" };
      if (f.o) upd.obs = (p.obs ? p.obs + " | " : "") + `${dataBR(f.d)}: ${f.o}`;
      const ok = await tenta(() => q(sb.from("parcelas").update(upd).eq("id", p.id)), "Pagamento registrado.");
      if (ok === undefined) return false; depois && depois(); } }],
  });
}

async function editarParcela(p, depois) {
  const hist = await sb.rpc("historico", { p_tabela: "parcelas", p_id: p.id }).then((r) => r.data || []);
  modal({
    title: `Ajustar parcela ${p.numero} — ${p.aluno_nome || ""}`, size: "lg",
    body: `<div class="grid">
      <div class="c4"><label>Vencimento</label><input type="date" name="vencimento" value="${p.vencimento}"></div>
      <div class="c4"><label>Valor bruto</label><input name="valor_bruto" data-mask="money" value="${numIn(p.valor_bruto)}"></div>
      <div class="c4"><label>Desconto</label><input name="desconto" data-mask="money" value="${numIn(p.desconto)}"></div>
      <div class="c4"><label>Valor pago</label><input name="valor_pago" data-mask="money" value="${numIn(p.valor_pago)}"></div>
      <div class="c4"><label>Data pagamento</label><input type="date" name="data_pagamento" value="${p.data_pagamento || ""}"></div>
      <div class="c4"><label>Situação</label><select name="status">${opts([["aberta", "Em aberto"], ["parcial", "Parcial"], ["paga", "Paga"], ["cancelada", "Cancelada"]], p.status)}</select></div>
      <div class="c4"><label class="chk" style="margin-top:34px"><input type="checkbox" name="boleto_emitido" ${p.boleto_emitido ? "checked" : ""}> Boleto emitido</label></div>
      <div class="c4"><label>Data do boleto</label><input type="date" name="boleto_data" value="${p.boleto_data || ""}"></div>
      <div class="c4"><label>Situação do boleto</label><input name="boleto_situacao" value="${esc(p.boleto_situacao)}" placeholder="Ex.: enviado, registrado"></div>
      <div class="c4"><label class="chk" style="margin-top:34px"><input type="checkbox" name="nf_emitida" ${p.nf_emitida ? "checked" : ""}> Nota fiscal emitida</label></div>
      <div class="c4"><label>Nº da nota</label><input name="nf_numero" value="${esc(p.nf_numero)}"></div>
      <div class="c4"><label>Data da nota</label><input type="date" name="nf_data" value="${p.nf_data || ""}"></div>
      <div><label class="req">Motivo do ajuste</label><input name="motivo" placeholder="Fica registrado na trilha de auditoria"></div>
      <div><label>Observações</label><textarea name="obs">${esc(p.obs)}</textarea></div></div>
      ${hist.length ? `<details style="margin-top:12px"><summary class="link">Histórico de alterações (${hist.length})</summary><div class="small" style="margin-top:8px">${hist.map((h) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)">${dataHora(h.em)} — <b>${esc(h.usuario_nome)}</b><br>${difTexto(h)}</div>`).join("")}</div></details>` : ""}`,
    acts: [{ label: "Cancelar", cls: "sec" }, { label: "Salvar ajuste", onClick: async (r) => {
      const f = lerForm(r);
      const mudouValor = f.valor_bruto !== Number(p.valor_bruto) || f.desconto !== Number(p.desconto) || f.valor_pago !== Number(p.valor_pago) || f.status !== p.status || f.vencimento !== p.vencimento;
      if (mudouValor && !f.motivo) { toast("Informe o motivo do ajuste.", true); return false; }
      const { motivo, ...upd } = f; upd.valor = Math.max(0, f.valor_bruto - f.desconto);
      if (motivo) upd.obs = (f.obs ? f.obs + " | " : "") + `${dataBR(hojeISO())} ${S.perfil.nome}: ${motivo}`;
      if (upd.nf_emitida && !upd.nf_data) upd.nf_data = hojeISO();
      if (upd.boleto_emitido && !upd.boleto_data) upd.boleto_data = hojeISO();
      const ok = await tenta(() => q(sb.from("parcelas").update(upd).eq("id", p.id)), "Parcela ajustada.");
      if (ok === undefined) return false; depois && depois(); } }],
  });
}

function novaParcela(ref, depois) {
  modal({
    title: "Parcela avulsa",
    body: `<p class="muted">Ex.: material, uniforme, acordo. Fica na mesma matrícula de ${ref.ano_letivo}.</p><div class="grid">
      <div><label class="req">Descrição</label><input name="descricao"></div>
      <div class="c6"><label class="req">Valor (R$)</label><input name="valor" data-mask="money"></div><div class="c6"><label class="req">Vencimento</label><input type="date" name="vencimento"></div></div>`,
    acts: [{ label: "Cancelar", cls: "sec" }, { label: "Criar parcela", onClick: async (r) => {
      const f = lerForm(r); if (!f.descricao || !f.valor || !f.vencimento) { toast("Preencha todos os campos.", true); return false; }
      const max = await q(sb.from("parcelas").select("numero").eq("matricula_id", ref.matricula_id).order("numero", { ascending: false }).limit(1));
      const ok = await tenta(() => q(sb.from("parcelas").insert({ matricula_id: ref.matricula_id, aluno_id: ref.aluno_id, escola_id: ref.escola_id, numero: (max[0]?.numero || 0) + 1, descricao: f.descricao, vencimento: f.vencimento, valor_bruto: f.valor, desconto: 0, valor: f.valor })), "Parcela criada.");
      if (ok === undefined) return false; depois && depois(); } }],
  });
}

/* ---------- painel financeiro geral ---------- */
rota("financeiro", async (main, _, p) => {
  if (!veMod("financeiro")) { main.innerHTML = vazio("Seu perfil não acessa o painel financeiro.", "lock"); return; }
  const ano = "ano" in p ? p.ano : String(S.anoAtual);
  const familia = p.familia;
  let famNome = "";
  if (familia) famNome = (await q(sb.from("familias").select("nome").eq("id", familia).maybeSingle()))?.nome || "";
  main.innerHTML = pageHead("wallet", familia ? `Mensalidades — ${famNome}` : "Painel financeiro", familia ? "Todas as mensalidades dos irmãos (respeitando o seu acesso por escola)." : "Resumo por escola e consolidado. O sistema só controla boletos e notas, não emite.",
    familia ? `<button class="btn sec" onclick="ir('#/financeiro')">Ver painel geral</button>` : "") +
    `<div class="bar-tools">
      <select id="fAno">${opts(["", ...[S.anoAtual - 2, S.anoAtual - 1, S.anoAtual, S.anoAtual + 1].map(String)].map((x) => [x, x || "Todos os anos"]), familia ? p.ano || "" : ano)}</select>
      <select id="fMes">${opts(MESES.map((m, i) => [String(i + 1), m[0].toUpperCase() + m.slice(1)]), p.mes, "Todos os meses")}</select>
      <select id="fTurma"><option value="">Todas as turmas</option></select>
      <select id="fSit">${opts(Object.entries(SIT_PARC).map(([k, v]) => [k, v[0]]), p.sit, "Todas as situações")}<option value="aberto">Em aberto (pendente+atrasado+parcial)</option><option value="semboleto">Sem boleto</option><option value="semnf">Pago sem NF</option></select>
      <input id="fAluno" class="grow" placeholder="Aluno ou responsável" value="${esc(p.q || "")}">
    </div><div id="fKpis"></div>
    <div class="bar-tools"><span class="muted small" id="fCount"></span><div class="grow"></div>
      <button class="btn sec sm" id="bBol"><i data-lucide="receipt"></i>Marcar boleto emitido</button>
      <button class="btn sec sm" id="bNf"><i data-lucide="file-check-2"></i>Marcar NF emitida</button>
      <button class="btn sec sm" id="bXl"><i data-lucide="sheet"></i>Excel</button><button class="btn sec sm" id="bPdf"><i data-lucide="printer"></i>PDF</button></div>
    <div id="fTab">${carregando()}</div>`;
  icons();
  const anoSel = familia ? (p.ano || "") : ano;
  let todos = await fetchAll(() => {
    let r = sb.from("v_parcelas").select("*").order("vencimento").order("aluno_nome");
    if (familia) r = r.eq("familia_id", familia); else r = filtraEscola(r);
    if (anoSel) r = r.eq("ano_letivo", Number(anoSel));
    return r;
  });
  const turmas = [...new Map(todos.filter((x) => x.turma_id).map((x) => [x.turma_id, x.turma_nome + (S.escola ? "" : " — " + x.escola_nome)])).entries()];
  $("#fTurma").innerHTML = opts(turmas.sort((a, b) => a[1].localeCompare(b[1])), p.turma, "Todas as turmas");
  let vis = [];
  const atualizar = () => {
    const mes = $("#fMes").value, tu = $("#fTurma").value, sit = $("#fSit").value, txt = normal($("#fAluno").value);
    vis = todos.filter((x) => (!mes || Number(x.vencimento.slice(5, 7)) === Number(mes)) && (!tu || x.turma_id === tu)
      && (!sit || (sit === "aberto" ? ["pendente", "atrasado", "parcial"].includes(x.situacao) : sit === "semboleto" ? !x.boleto_emitido && x.status !== "cancelada" && x.situacao !== "pago" : sit === "semnf" ? !x.nf_emitida && Number(x.valor_pago) > 0 && x.status !== "cancelada" : x.situacao === sit))
      && (!txt || normal(x.aluno_nome + " " + (x.resp_nome || "")).includes(txt)));
    const blocos = (S.escola || familia ? [] : S.escolas.map((e) => [e.nome, vis.filter((x) => x.escola_id === e.id)])).concat([[S.escola ? escolaNome(S.escola) : familia ? "Família" : "Consolidado", vis]]);
    $("#fKpis").innerHTML = blocos.map(([nome, ps], i) => { const t = resumo(ps); const esc_ = S.escolas.find((e) => e.nome === nome);
      return `<section class="bloco${i === blocos.length - 1 && blocos.length > 1 ? " consolidado" : ""}"><header class="bloco-h">${esc_?.logo ? `<img src="${esc(esc_.logo)}" alt="">` : '<i data-lucide="layers"></i>'}<h3>${esc(nome)}</h3><span class="muted small">${t.n} parcela(s)</span></header>
      <div class="kpis">
        ${kpiCard({ ic: "calendar", cor: "blue", valor: money(t.previsto), rotulo: "Previsto", dinheiro: true })}
        ${kpiCard({ ic: "check-circle-2", cor: "green", valor: money(t.recebido), rotulo: "Recebido", detalhe: t.previsto ? Math.round(t.recebido / t.previsto * 100) + "% do previsto" : "", dinheiro: true })}
        ${kpiCard({ ic: "clock", cor: "amber", valor: money(t.aberto), rotulo: "Em aberto", dinheiro: true })}
        ${kpiCard({ ic: "alert-triangle", cor: "red", valor: money(t.vencido), rotulo: "Vencido", detalhe: `${t.inad} inadimplente(s)`, dinheiro: true })}
        ${kpiCard({ ic: "receipt", cor: "navy", valor: t.bolEm, rotulo: "Boletos emitidos", detalhe: `${t.bolPend} pendente(s)` })}
        ${kpiCard({ ic: "file-check-2", cor: "navy", valor: t.nfEm, rotulo: "Notas emitidas", detalhe: `${t.nfPend} pendente(s)` })}
      </div></section>`; }).join("");
    $("#fCount").textContent = `${vis.length} parcela(s)`;
    painelParcelas($("#fTab"), vis.slice(0, 600), { selecionavel: true, mostrarAluno: true, recarregar: recarregar });
    if (vis.length > 600) $("#fTab").insertAdjacentHTML("beforeend", `<p class="muted small">Mostrando 600 de ${vis.length}. Use os filtros ou exporte para Excel.</p>`);
    icons();
  };
  const recarregar = async () => {
    todos = await fetchAll(() => { let r = sb.from("v_parcelas").select("*").order("vencimento").order("aluno_nome"); if (familia) r = r.eq("familia_id", familia); else r = filtraEscola(r); if (anoSel) r = r.eq("ano_letivo", Number(anoSel)); return r; });
    atualizar();
  };
  ["fMes", "fTurma", "fSit", "fAluno"].forEach((i) => $("#" + i).addEventListener("input", atualizar));
  $("#fAno").onchange = (e) => ir(`#/financeiro?ano=${e.target.value}${familia ? "&familia=" + familia : ""}`);
  const selecionadas = () => $$(".selP:checked").map((c) => c.value);
  $("#bBol").onclick = async () => {
    const ids = selecionadas(); if (!ids.length) return toast("Selecione parcelas na tabela.", true);
    await tenta(() => q(sb.from("parcelas").update({ boleto_emitido: true, boleto_data: hojeISO() }).in("id", ids)), `${ids.length} boleto(s) marcado(s) como emitido(s).`); recarregar();
  };
  $("#bNf").onclick = () => {
    const ids = selecionadas(); if (!ids.length) return toast("Selecione parcelas na tabela.", true);
    modal({ title: `Registrar nota fiscal (${ids.length} parcela(s))`, body: `<label>Data de emissão</label><input type="date" name="nf_data" value="${hojeISO()}"><label>Nº da nota (opcional)</label><input name="nf_numero" placeholder="Se for uma nota para várias parcelas">`,
      acts: [{ label: "Cancelar", cls: "sec" }, { label: "Registrar", onClick: async (r) => { const f = lerForm(r); await tenta(() => q(sb.from("parcelas").update({ nf_emitida: true, nf_data: f.nf_data || hojeISO(), ...(f.nf_numero ? { nf_numero: f.nf_numero } : {}) }).in("id", ids)), "Notas registradas."); recarregar(); } }] });
  };
  const exportar = () => vis.map((x) => ({ Escola: x.escola_nome, Aluno: x.aluno_nome, Turma: x.turma_nome || x.serie, "Resp. financeiro": x.resp_nome || "", Ano: x.ano_letivo, Parcela: x.numero, Descrição: x.descricao || "", Vencimento: dataBR(x.vencimento), "Valor bruto": Number(x.valor_bruto), Desconto: Number(x.desconto), Valor: Number(x.valor), "Valor pago": Number(x.valor_pago), "Data pagamento": dataBR(x.data_pagamento), "Em aberto": Number(x.em_aberto), Situação: SIT_PARC[x.situacao][0], Boleto: x.boleto_emitido ? "Sim" : "Não", "Nota fiscal": x.nf_emitida ? "Sim" : "Não", "Nº NF": x.nf_numero || "", Observações: x.obs || "" }));
  $("#bXl").onclick = () => exportXLSX(exportar(), "financeiro");
  $("#bPdf").onclick = () => relatorioPDF("Parcelas — painel financeiro", vis.map((x) => ({ Aluno: x.aluno_nome, Turma: x.turma_nome || x.serie, Parc: x.numero, Venc: dataBR(x.vencimento), Valor: money(x.valor), Pago: money(x.valor_pago), Situação: SIT_PARC[x.situacao][0], Boleto: x.boleto_emitido ? "S" : "N", NF: x.nf_emitida ? "S" : "N" })));
  atualizar();
});

/* ---------- relatórios ---------- */
rota("relatorios", async (main, _, p) => {
  if (!veMod("relatorios") && !veMod("financeiro")) { main.innerHTML = vazio("Seu perfil não acessa relatórios.", "lock"); return; }
  const tipo = p.t || (veMod("financeiro") ? "recebimentos" : "indicacoes");
  const tipos = [...(veMod("financeiro") ? [["recebimentos", "Recebimentos", "banknote"], ["inadimplencia", "Inadimplência", "alert-triangle"], ["pendencias", "Boletos e notas pendentes", "receipt"]] : []),
    ["indicacoes", "Matrículas por indicação", "megaphone"], ["documentacao", "Documentação incompleta", "folder-x"]];
  const de = p.de || `${S.anoAtual}-01-01`, ate = p.ate || hojeISO();
  main.innerHTML = pageHead("file-bar-chart", "Relatórios", "Exporte em PDF ou Excel.") +
    `<div class="tabs">${tipos.map(([k, t, ic]) => `<button class="${k === tipo ? "on" : ""}" data-t="${k}"><i data-lucide="${ic}"></i>${t}</button>`).join("")}</div>
    <div class="bar-tools"><label class="muted">De</label><input type="date" id="rDe" value="${de}"><label class="muted">Até</label><input type="date" id="rAte" value="${ate}">
      <button class="btn sec" id="rAplicar">Aplicar</button><div class="grow"></div><button class="btn sec" id="rXl"><i data-lucide="sheet"></i>Excel</button><button class="btn sec" id="rPdf"><i data-lucide="printer"></i>PDF</button></div>
    <div id="rBox">${carregando()}</div>`;
  icons();
  $$(".tabs [data-t]").forEach((b) => (b.onclick = () => ir(`#/relatorios?t=${b.dataset.t}&de=${$("#rDe").value}&ate=${$("#rAte").value}`)));
  $("#rAplicar").onclick = () => ir(`#/relatorios?t=${tipo}&de=${$("#rDe").value}&ate=${$("#rAte").value}`);
  let linhas = [], titulo = "", totais = null, nota = "";
  if (tipo === "recebimentos") {
    const r = await fetchAll(() => filtraEscola(sb.from("v_parcelas").select("*").gt("valor_pago", 0).gte("data_pagamento", de).lte("data_pagamento", ate)).order("data_pagamento"));
    titulo = `Recebimentos de ${dataBR(de)} a ${dataBR(ate)}`;
    linhas = r.map((x) => ({ Data: dataBR(x.data_pagamento), Escola: x.escola_nome, Aluno: x.aluno_nome, Parcela: `${x.numero} (${x.ano_letivo})`, Vencimento: dataBR(x.vencimento), Forma: x.forma_pagamento || "", "Valor pago": money(x.valor_pago), NF: x.nf_emitida ? "Sim" : "Não" }));
    totais = { Data: "Total", "Valor pago": money(r.reduce((s, x) => s + Number(x.valor_pago), 0)) };
    nota = "Considera a data do último pagamento registrado na parcela.";
  } else if (tipo === "inadimplencia") {
    const r = await fetchAll(() => filtraEscola(sb.from("v_parcelas").select("*").lt("vencimento", hojeISO()).in("status", ["aberta", "parcial"]).gte("vencimento", de).lte("vencimento", ate)).order("aluno_nome"));
    const g = {}; r.forEach((x) => { const k = x.aluno_id; (g[k] ||= { a: x, n: 0, v: 0, mais: x.vencimento }); g[k].n++; g[k].v += Number(x.em_aberto); if (x.vencimento < g[k].mais) g[k].mais = x.vencimento; });
    titulo = `Inadimplência — vencimentos de ${dataBR(de)} a ${dataBR(ate)}`;
    linhas = Object.values(g).sort((a, b) => b.v - a.v).map(({ a, n, v, mais }) => ({ Aluno: a.aluno_nome, Escola: a.escola_nome, Turma: a.turma_nome || a.serie, "Resp. financeiro": a.resp_nome || "", "Parcelas vencidas": n, "Vencida desde": dataBR(mais), "Dias de atraso": Math.round((new Date(hojeISO()) - new Date(mais)) / 864e5), "Valor em aberto": money(v) }));
    totais = { Aluno: `${linhas.length} inadimplente(s)`, "Valor em aberto": money(Object.values(g).reduce((s, x) => s + x.v, 0)) };
  } else if (tipo === "pendencias") {
    const r = await fetchAll(() => filtraEscola(sb.from("v_parcelas").select("*").neq("status", "cancelada").gte("vencimento", de).lte("vencimento", ate)).order("vencimento"));
    const pend = r.filter((x) => (!x.boleto_emitido && x.situacao !== "pago") || (!x.nf_emitida && Number(x.valor_pago) > 0));
    titulo = `Boletos e notas pendentes — vencimentos de ${dataBR(de)} a ${dataBR(ate)}`;
    linhas = pend.map((x) => ({ Vencimento: dataBR(x.vencimento), Escola: x.escola_nome, Aluno: x.aluno_nome, Parcela: x.numero, Valor: money(x.valor), Situação: SIT_PARC[x.situacao][0], "Boleto pendente": !x.boleto_emitido && x.situacao !== "pago" ? "Sim" : "", "NF pendente": !x.nf_emitida && Number(x.valor_pago) > 0 ? "Sim" : "" }));
  } else if (tipo === "indicacoes") {
    const r = await fetchAll(() => filtraEscola(sb.from("v_matriculas").select("*").eq("indicacao", true).gte("data_matricula", de).lte("data_matricula", ate)).order("data_matricula"));
    titulo = `Matrículas por indicação — ${dataBR(de)} a ${dataBR(ate)}`;
    const quem = {}; r.forEach((m) => { const k = m.indicador_aluno_nome ? "Família de " + m.indicador_aluno_nome : m.indicador_nome || "(não informado)"; quem[k] = (quem[k] || 0) + 1; });
    linhas = r.map((m) => ({ Data: dataBR(m.data_matricula), Escola: m.escola_nome, Aluno: m.aluno_nome, Série: m.serie, Ano: m.ano_letivo, "Quem indicou": m.indicador_nome || "", "Aluno/família indicadora": m.indicador_aluno_nome || "", Observações: m.indicacao_obs || "", Situação: STATUS_MAT[m.status][0] }));
    totais = { Data: "Total", Aluno: `${r.length} indicação(ões)` };
    nota = Object.entries(quem).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="chip">${esc(k)}: <b>${n}</b></span>`).join(" ");
  } else if (tipo === "documentacao") {
    const [al, chk] = await Promise.all([fetchAll(() => filtraEscola(sb.from("alunos").select("id,nome,escola_id").eq("ativo", true)).order("nome")), fetchAll(() => sb.from("doc_checklist").select("*").eq("status", "pendente"))]);
    const pend = {}; chk.forEach((c) => (pend[c.aluno_id] ||= []).push(CHECK[c.item]));
    titulo = "Documentação incompleta (alunos ativos)";
    linhas = al.filter((a) => pend[a.id]).map((a) => ({ Aluno: a.nome, Escola: escolaNome(a.escola_id), "Itens pendentes": pend[a.id].length, Documentos: pend[a.id].join(", ") }));
    nota = "Itens marcados como “pendente” no checklist de cada aluno. Datas não se aplicam a este relatório.";
  }
  $("#rBox").innerHTML = (nota ? `<p class="muted small" style="margin-bottom:10px">${nota}</p>` : "") + (linhas.length ? `<div class="scroll"><table><thead><tr>${Object.keys(linhas[0]).map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
    ${linhas.map((l) => `<tr>${Object.values(l).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}${totais ? `<tr>${Object.keys(linhas[0]).map((c) => `<th>${esc(totais[c] ?? "")}</th>`).join("")}</tr>` : ""}</tbody></table></div>` : vazio("Nada encontrado no período.", "search"));
  icons();
  $("#rXl").onclick = () => exportXLSX(linhas, tipo);
  $("#rPdf").onclick = () => relatorioPDF(titulo, linhas, { totais });
});
