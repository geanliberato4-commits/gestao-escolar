/* ==========================================================================
   Controle de notas fiscais das mensalidades pagas.
   Mensalidade paga (baixada no financeiro) sem NF → aparece em PENDENTES.
   Clicou em EMITIDA → sai das pendentes e vai para EMITIDAS (com data e nº).
   O sistema só controla; a nota é emitida fora dele.
   ========================================================================== */
const mesRef = (d) => { const t = mesAno(d); return t ? t[0].toUpperCase() + t.slice(1) : ""; };

rota("notas", async (main, _, p) => {
  if (!veMod("financeiro")) { main.innerHTML = vazio("Seu perfil não acessa o financeiro.", "lock"); return; }
  const fin = pode("financeiro");
  const st = p.st || "pendente", ano = "ano" in p ? p.ano : String(S.anoAtual), mes = p.mes || "";
  main.innerHTML = pageHead("file-check-2", "Notas fiscais", "Mensalidades pagas e a situação da nota fiscal de cada uma. Clique em EMITIDA quando a nota for feita.") +
    `<div class="tabs" id="nTabs">${[["pendente", "Pendentes"], ["emitida", "Emitidas"], ["", "Todas"]].map(([k, t]) => `<button class="${k === st ? "on" : ""}" data-st="${k}">${t}</button>`).join("")}</div>
    <div class="bar-tools">
      <select id="nAno">${opts(["", ...[S.anoAtual - 2, S.anoAtual - 1, S.anoAtual, S.anoAtual + 1].map(String)].map((x) => [x, x || "Todos os anos"]), ano)}</select>
      <select id="nMes">${opts(MESES.map((m, i) => [String(i + 1), m[0].toUpperCase() + m.slice(1)]), mes, "Todos os meses")}</select>
      <input id="nQ" class="grow" placeholder="Aluno ou responsável" value="${esc(p.q || "")}">
    </div>
    <div id="nKpis"></div>
    <div class="bar-tools"><span class="muted small" id="nCount"></span><div class="grow"></div>
      ${fin && st !== "emitida" ? `<button class="btn sm" id="nMarcar" disabled><i data-lucide="check-check"></i>Marcar selecionadas como EMITIDAS</button>` : ""}
      <button class="btn sec sm" id="nXl"><i data-lucide="sheet"></i>Excel</button><button class="btn sec sm" id="nPdf"><i data-lucide="printer"></i>PDF</button></div>
    <div id="nTab">${carregando()}</div>`;
  icons();
  const nav = (o) => ir("#/notas?" + new URLSearchParams({ st, ano: $("#nAno").value, mes: $("#nMes").value, q: $("#nQ").value, ...o }).toString());
  $$("#nTabs [data-st]").forEach((b) => (b.onclick = () => nav({ st: b.dataset.st })));
  $("#nAno").onchange = () => nav({}); $("#nMes").onchange = () => nav({});

  // mês de referência = mês de vencimento da mensalidade
  let todos = await fetchAll(() => {
    let r = filtraEscola(sb.from("v_parcelas").select("*")).gt("valor_pago", 0).neq("status", "cancelada").order("vencimento").order("aluno_nome");
    if (ano) r = r.gte("vencimento", `${ano}-01-01`).lte("vencimento", `${ano}-12-31`);
    if (mes) { const a = ano || S.anoAtual; const ult = new Date(a, Number(mes), 0).getDate(); if (ano) r = r.gte("vencimento", `${a}-${mes.padStart(2, "0")}-01`).lte("vencimento", `${a}-${mes.padStart(2, "0")}-${ult}`); }
    return r;
  });
  if (mes && !ano) todos = todos.filter((x) => Number(x.vencimento.slice(5, 7)) === Number(mes));

  let vis = [];
  const desenhar = () => {
    const t = normal($("#nQ").value);
    const base = todos.filter((x) => !t || normal(`${x.aluno_nome} ${x.resp_nome || ""}`).includes(t));
    vis = base.filter((x) => (st === "pendente" ? !x.nf_emitida : st === "emitida" ? x.nf_emitida : true));
    const pend = base.filter((x) => !x.nf_emitida), emit = base.filter((x) => x.nf_emitida);
    const soma = (l) => l.reduce((s, x) => s + Number(x.valor_pago), 0);
    $("#nKpis").innerHTML = `<div class="kpis">
      ${kpiCard({ ic: "file-clock", cor: "red", valor: pend.length, rotulo: "NF pendentes", detalhe: money(soma(pend)) })}
      ${kpiCard({ ic: "file-check-2", cor: "green", valor: emit.length, rotulo: "NF emitidas", detalhe: money(soma(emit)) })}
      ${kpiCard({ ic: "banknote", cor: "blue", valor: base.length, rotulo: "Mensalidades pagas", detalhe: money(soma(base)) })}</div>`;
    $("#nCount").textContent = `${vis.length} registro(s)`;
    if (!vis.length) {
      $("#nTab").innerHTML = vazio(st === "pendente" ? "Nenhuma nota fiscal pendente neste período. Tudo em dia!" : "Nenhum registro encontrado.", st === "pendente" ? "party-popper" : "file-search");
      icons(); return;
    }
    const sel = fin && st !== "emitida";
    $("#nTab").innerHTML = `<div class="scroll"><table><thead><tr>
        ${sel ? '<th><input type="checkbox" id="nAll" style="width:auto"></th>' : ""}
        <th>Aluno</th><th>Resp. financeiro</th>${S.escola ? "" : "<th>Escola</th>"}<th>Mês de referência</th><th class="num">Valor</th><th>Pagamento</th><th>Nota fiscal</th>${fin ? "<th></th>" : ""}</tr></thead><tbody>
      ${vis.map((x) => `<tr>
        ${sel ? `<td>${x.nf_emitida ? "" : `<input type="checkbox" class="nSel" value="${x.id}" style="width:auto">`}</td>` : ""}
        <td><a class="link" href="#/aluno/${x.aluno_id}?aba=financeiro">${esc(x.aluno_nome)}</a><div class="small muted">${esc(x.turma_nome || x.serie || "")} · parcela ${esc(numParcTxt(x))}</div></td>
        <td>${esc(x.resp_nome || "—")}</td>
        ${S.escola ? "" : `<td>${esc(x.escola_nome)}</td>`}
        <td>${esc(mesRef(x.vencimento))}</td>
        <td class="num money">${money(x.valor_pago)}${Number(x.valor_pago) < Number(x.valor) ? `<div class="small muted">de ${money(x.valor)} (parcial)</div>` : ""}</td>
        <td>${dataBR(x.data_pagamento)}<div class="small muted">${esc(x.forma_pagamento || "")}</div></td>
        <td>${x.nf_emitida ? `<span class="tag ok">EMITIDA</span><div class="small muted">${dataBR(x.nf_data)}</div>` : '<span class="tag warn">PENDENTE</span>'}</td>
        ${fin ? `<td class="act">${x.nf_emitida
          ? `<input class="nNum" data-id="${x.id}" value="${esc(x.nf_numero || "")}" placeholder="nº da nota" style="width:110px;padding:6px 8px" title="Número da nota (salva ao sair do campo)">
             <button class="btn sm sec" data-desf="${x.id}" title="Voltar para pendente"><i data-lucide="undo-2"></i></button>`
          : `<button class="btn sm ok" data-emit="${x.id}"><i data-lucide="check"></i>EMITIDA</button>`}</td>` : ""}
      </tr>`).join("")}</tbody></table></div>`;
    icons();
    const marcar = async (ids) => {
      const upd = { nf_emitida: true, nf_data: hojeISO() };
      const { error } = await sb.from("parcelas").update(upd).in("id", ids);
      if (error) return toast(erroAmigavel(error), true);
      todos.forEach((x) => ids.includes(x.id) && Object.assign(x, upd));
      toast(ids.length > 1 ? `${ids.length} notas marcadas como emitidas.` : "Nota fiscal marcada como emitida.");
      desenhar();
    };
    $$("[data-emit]").forEach((b) => (b.onclick = () => { b.disabled = true; marcar([b.dataset.emit]); }));
    $$("[data-desf]").forEach((b) => (b.onclick = async () => {
      const x = todos.find((y) => y.id === b.dataset.desf);
      if (!(await confirmar(`Voltar a nota de <b>${esc(x.aluno_nome)}</b> (${esc(mesAno(x.vencimento))}) para PENDENTE?`, { ok: "Voltar para pendente" }))) return;
      const upd = { nf_emitida: false, nf_data: null, nf_numero: null };
      const { error } = await sb.from("parcelas").update(upd).eq("id", x.id);
      if (error) return toast(erroAmigavel(error), true);
      Object.assign(x, upd); toast("Nota voltou para pendente."); desenhar();
    }));
    $$(".nNum").forEach((i) => (i.onchange = async () => {
      const x = todos.find((y) => y.id === i.dataset.id), v = i.value.trim() || null;
      const { error } = await sb.from("parcelas").update({ nf_numero: v }).eq("id", x.id);
      if (error) return toast(erroAmigavel(error), true);
      x.nf_numero = v; toast("Número da nota salvo.");
    }));
    const bm = $("#nMarcar");
    const conta = () => { if (bm) { const n = $$(".nSel:checked").length; bm.disabled = !n; bm.innerHTML = `<i data-lucide="check-check"></i>Marcar ${n || ""} selecionada(s) como EMITIDA(S)`; icons(); } };
    $$(".nSel").forEach((c) => (c.onchange = conta));
    if ($("#nAll")) $("#nAll").onchange = (e) => { $$(".nSel").forEach((c) => (c.checked = e.target.checked)); conta(); };
    if (bm) bm.onclick = () => { const ids = $$(".nSel:checked").map((c) => c.value); if (ids.length) marcar(ids); };
  };
  $("#nQ").oninput = desenhar;
  desenhar();
  const linhas = () => vis.map((x) => ({ Aluno: x.aluno_nome, "Resp. financeiro": x.resp_nome || "", Escola: x.escola_nome, "Mês de referência": mesRef(x.vencimento), Parcela: numParcTxt(x), "Valor pago": Number(x.valor_pago), "Data pagamento": dataBR(x.data_pagamento), "Nota fiscal": x.nf_emitida ? "EMITIDA" : "PENDENTE", "Data da NF": dataBR(x.nf_data), "Nº NF": x.nf_numero || "" }));
  $("#nXl").onclick = () => exportXLSX(linhas(), `notas-fiscais-${st || "todas"}`);
  $("#nPdf").onclick = () => relatorioPDF(`Notas fiscais — ${st === "pendente" ? "pendentes" : st === "emitida" ? "emitidas" : "todas"}`, linhas().map((l) => ({ ...l, "Valor pago": money(l["Valor pago"]) })));
});
