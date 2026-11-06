/* ==========================================================================
   Livro Caixa — acesso exclusivo (mesma lista dos Pagamentos de prestadores).
   Entradas de mensalidades e saídas de prestadores chegam sozinhas pelo banco
   (gatilhos), na data efetiva do pagamento. Lançamentos manuais completam.
   ========================================================================== */
const CAT_ENTRADA = ["Mensalidades", "Matrícula / taxa de reserva", "Material didático", "Uniforme", "Eventos", "Horas extras", "Outras receitas"];
const CAT_SAIDA = ["Prestadores de serviço", "Fornecedores", "Salários e encargos", "Impostos e taxas", "Aluguel", "Água, luz e internet", "Manutenção", "Material de consumo", "Alimentação", "Outras despesas"];
const ORIGEM_CX = { manual: "Manual", mensalidade: "Mensalidade (automático)", prestador: "Prestador (automático)" };
const fimDoMes = (ym) => { const [y, m] = ym.split("-").map(Number); return vencNoMes(y, m - 1, 31); };

async function dadosCaixa(escolas, ate) {
  const [lanc, aberturas] = await Promise.all([
    fetchAll(() => sb.from("caixa_lancamentos").select("*").in("escola_id", escolas).lte("data", ate).order("data").order("created_at")),
    q(sb.from("caixa_abertura").select("*").in("escola_id", escolas)),
  ]);
  return { lanc, aberturas };
}

function editarLancamento(l, escolaPadrao, depois) {
  const auto = l?.origem && l.origem !== "manual";
  const tipo = l?.tipo || "entrada";
  modal({
    title: l?.id ? (auto ? "Lançamento automático" : "Editar lançamento") : "Novo lançamento", size: "lg",
    body: `${auto ? `<div class="msg warn"><i data-lucide="link"></i><div>Vem de <b>${esc(ORIGEM_CX[l.origem])}</b>. Data, valor e escola seguem o registro original: para corrigir, altere o pagamento na origem e o caixa se atualiza sozinho. Aqui você pode ajustar descrição, categoria e observações.</div></div>` : ""}
      <div class="grid">
      <div class="c4"><label class="req">Tipo</label><div class="radio-row">${[["entrada", "Entrada"], ["saida", "Saída"]].map(([v, t]) => `<label><input type="radio" name="tipo" value="${v}" ${tipo === v ? "checked" : ""} ${auto ? "disabled" : ""}> ${t}</label>`).join("")}</div></div>
      <div class="c4"><label class="req">Escola</label><select name="escola_id" ${auto ? "disabled" : ""}>${escolaOpts(l?.escola_id || escolaPadrao || S.escolas[0]?.id)}</select></div>
      <div class="c4"><label class="req">Data</label><input type="date" name="data" value="${l?.data || hojeISO()}" ${auto ? "disabled" : ""}></div>
      <div class="c8"><label class="req">Descrição</label><input name="descricao" value="${esc(l?.descricao)}"></div>
      <div class="c4"><label class="req">Valor (R$)</label><input name="valor" data-mask="money" value="${numIn(l?.valor)}" ${auto ? "disabled" : ""}></div>
      <div class="c6"><label>Categoria</label><input name="categoria" list="cxCats" value="${esc(l?.categoria)}" placeholder="Escolha ou digite"><datalist id="cxCats"></datalist></div>
      <div class="c6"><label>Forma de pagamento/recebimento</label><select name="forma_pagamento" ${auto ? "disabled" : ""}>${opts(FORMAS, l?.forma_pagamento, "—")}</select></div>
      ${auto ? "" : `<div><label>Comprovante (PDF, JPG ou PNG)</label><input type="file" name="arq" accept=".pdf,.jpg,.jpeg,.png">${l?.comprovante_path ? `<div class="hint">Já existe um comprovante; enviar outro substitui.</div>` : ""}</div>`}
      <div><label>Observações</label><textarea name="obs">${esc(l?.obs)}</textarea></div></div>`,
    onOpen: (r) => {
      const cats = () => { const t = $('[name="tipo"]:checked', r)?.value || tipo; $("#cxCats", r).innerHTML = (t === "saida" ? CAT_SAIDA : CAT_ENTRADA).map((c) => `<option value="${esc(c)}">`).join(""); };
      $$('[name="tipo"]', r).forEach((x) => (x.onchange = cats)); cats();
    },
    acts: [
      ...(l?.comprovante_path ? [{ label: "Ver comprovante", cls: "sec", icon: "paperclip", close: false, onClick: async () => { verComprovante(l.comprovante_path); return false; } }] : []),
      { label: "Cancelar", cls: "sec" },
      { label: "Salvar", onClick: async (r) => {
        const f = lerForm(r); const arq = $('[name="arq"]', r)?.files?.[0];
        if (!f.descricao) { toast("Informe a descrição.", true); return false; }
        const dados = auto ? { descricao: f.descricao, categoria: f.categoria, obs: f.obs } : { tipo: f.tipo, escola_id: f.escola_id, data: f.data, descricao: f.descricao, valor: f.valor, categoria: f.categoria, forma_pagamento: f.forma_pagamento, obs: f.obs };
        if (!auto && (!dados.data || !(dados.valor > 0))) { toast("Informe data e valor.", true); return false; }
        const ok = await tenta(async () => {
          if (arq) {
            if (!/^(application\/pdf|image\/(jpeg|png))$/.test(arq.type) || arq.size > 10485760) throw new Error("Comprovante deve ser PDF, JPG ou PNG de até 10 MB.");
            const path = `caixa/${uid()}.${arq.name.split(".").pop().toLowerCase()}`;
            const { error } = await sb.storage.from("prestadores").upload(path, arq, { contentType: arq.type }); if (error) throw error;
            dados.comprovante_path = path;
          }
          return l?.id ? q(sb.from("caixa_lancamentos").update(dados).eq("id", l.id)) : q(sb.from("caixa_lancamentos").insert({ ...dados, origem: "manual" }));
        }, "Lançamento salvo.");
        if (ok === undefined) return false; depois(); } }],
  });
}
async function cancelarLancamento(l, depois) {
  if (l.cancelado) {
    if (l.origem !== "manual") return toast("Este lançamento automático foi cancelado porque o pagamento foi desfeito na origem. Registre o pagamento de novo lá.", true);
    if (!(await confirmar("Reativar este lançamento?"))) return;
    await tenta(() => q(sb.from("caixa_lancamentos").update({ cancelado: false, motivo_cancelamento: null }).eq("id", l.id)), "Lançamento reativado."); return depois();
  }
  if (l.origem !== "manual") return toast("Lançamentos automáticos são cancelados na origem: estorne o pagamento da mensalidade ou do prestador e o caixa se atualiza sozinho.", true);
  const mot = await confirmar(`Cancelar <b>${esc(l.descricao)}</b> (${money(l.valor)})? Ele deixa de somar no saldo, mas continua no histórico.`, { pedirMotivo: true, perigo: true, ok: "Cancelar lançamento" });
  if (!mot) return;
  await tenta(() => q(sb.from("caixa_lancamentos").update({ cancelado: true, motivo_cancelamento: mot }).eq("id", l.id)), "Lançamento cancelado."); depois();
}
async function historicoLancamento(l) {
  const hs = await q(sb.from("caixa_historico").select("*").eq("lancamento_id", l.id).order("em", { ascending: false }));
  const rot = { valor: "Valor", data: "Data", descricao: "Descrição", categoria: "Categoria", cancelado: "Cancelado", motivo_cancelamento: "Motivo", forma_pagamento: "Forma", obs: "Observações", escola_id: "Escola", tipo: "Tipo", comprovante_path: "Comprovante" };
  const f = (k, v) => (v == null || v === "" ? "vazio" : k === "escola_id" ? escolaNome(v) : k === "valor" ? money(v) : k === "data" ? dataBR(v) : typeof v === "boolean" ? (v ? "sim" : "não") : k === "comprovante_path" ? "arquivo" : v);
  modal({ title: "Histórico do lançamento", size: "lg", body: hs.length ? `<ul class="list">${hs.map((h) => `<li><div><b>${dataHora(h.em)}</b> · ${esc(h.usuario_nome || "sistema")} · ${h.acao === "INSERT" ? "criado" : h.acao === "DELETE" ? "excluído" : "alterado"}
      ${h.acao === "UPDATE" ? `<div class="small">${Object.keys(h.depois || {}).filter((k) => rot[k]).map((k) => `${rot[k]}: ${esc(f(k, h.antes?.[k]))} → <b>${esc(f(k, h.depois[k]))}</b>`).join("<br>")}</div>` : ""}</div></li>`).join("")}</ul>` : '<div class="empty-sm">Sem registros.</div>', acts: [{ label: "Fechar", cls: "sec" }] });
}
function aberturaCaixa(depois, aberturas) {
  modal({
    title: "Saldo de abertura do caixa", size: "lg",
    body: `<p class="muted">Valor em caixa na data em que o livro começa. Lançamentos anteriores a essa data não entram no saldo.</p>
      ${S.escolas.map((e) => { const a = aberturas.find((x) => x.escola_id === e.id); return `<div class="grid" data-esc="${e.id}"><div class="c4"><label><b>${esc(e.nome)}</b></label><div class="hint">Data de início</div><input type="date" name="data" value="${a?.data || hojeISO().slice(0, 8) + "01"}"></div><div class="c4"><label>&nbsp;</label><div class="hint">Saldo inicial (R$)</div><input name="valor" data-mask="money" value="${numIn(a?.valor ?? 0)}"></div></div>`; }).join("")}`,
    acts: [{ label: "Cancelar", cls: "sec" }, { label: "Salvar", onClick: async (r) => {
      const ok = await tenta(() => q(sb.from("caixa_abertura").upsert($$("[data-esc]", r).map((g) => ({ escola_id: g.dataset.esc, ...lerForm(g) })))), "Saldo de abertura salvo.");
      if (ok === undefined) return false; depois(); } }],
  });
}

rota("caixa", async (main, _, p) => {
  if (!S.prestadores) { main.innerHTML = vazio("Página não encontrada.", "lock"); return; }
  const visao = p.v || (S.escola || "todas");
  const hoje = hojeISO();
  const de = p.de || hoje.slice(0, 8) + "01", ate = p.ate || fimDoMes(hoje.slice(0, 7));
  const escolas = visao === "todas" ? S.escolas.map((e) => e.id) : [visao];
  const navURL = (o) => { const x = { v: visao, de, ate, cat: p.cat || "", tipo: p.tipo || "", forma: p.forma || "", canc: p.canc || "", modo: p.modo || "", ...o }; return "#/caixa?" + new URLSearchParams(x).toString(); };
  const titulo = visao === "todas" ? "Consolidado (Estação Criança + Colégio MEF)" : "Livro Caixa — " + escolaNome(visao);
  main.innerHTML = pageHead("book-open", "Livro Caixa", "Mensalidades recebidas e pagamentos a prestadores entram sozinhos, na data efetiva.",
    `<div class="row"><button class="btn sec" id="cxAbert"><i data-lucide="landmark"></i>Saldo de abertura</button><button class="btn" id="cxNovo"><i data-lucide="plus"></i>Novo lançamento</button></div>`) +
    `<div class="tabs">${[...S.escolas.map((e) => [e.id, e.nome]), ["todas", "Consolidado"]].map(([k, t]) => `<button class="${k === visao ? "on" : ""}" data-v="${k}">${esc(t)}</button>`).join("")}</div>
    <div class="bar-tools">
      <button class="btn sm sec" data-mesnav="-1" title="Mês anterior"><i data-lucide="chevron-left"></i></button>
      <input type="date" id="cxDe" value="${de}" style="width:auto"><span class="muted">até</span><input type="date" id="cxAte" value="${ate}" style="width:auto">
      <button class="btn sm sec" data-mesnav="1" title="Próximo mês"><i data-lucide="chevron-right"></i></button>
      <select id="cxTipo" style="width:auto">${opts([["", "Entradas e saídas"], ["entrada", "Só entradas"], ["saida", "Só saídas"]], p.tipo || "")}</select>
      <select id="cxCat" style="width:auto"><option value="">Todas as categorias</option></select>
      <select id="cxForma" style="width:auto">${opts(FORMAS, p.forma || "", "Todas as formas")}</select>
      <label class="chk"><input type="checkbox" id="cxCanc" ${p.canc ? "checked" : ""}> Cancelados</label>
    </div><div id="cxBox">${carregando()}</div>`;
  icons();
  $$("[data-v]").forEach((b) => (b.onclick = () => ir(navURL({ v: b.dataset.v }))));
  $$("[data-mesnav]").forEach((b) => (b.onclick = () => { const d = new Date(de + "T12:00"); d.setMonth(d.getMonth() + Number(b.dataset.mesnav), 1); const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; ir(navURL({ de: ym + "-01", ate: fimDoMes(ym) })); }));
  ["cxDe", "cxAte"].forEach((i) => ($("#" + i).onchange = () => ir(navURL({ de: $("#cxDe").value || de, ate: $("#cxAte").value || ate }))));
  $("#cxTipo").onchange = (e) => ir(navURL({ tipo: e.target.value })); $("#cxForma").onchange = (e) => ir(navURL({ forma: e.target.value }));
  $("#cxCanc").onchange = (e) => ir(navURL({ canc: e.target.checked ? "1" : "" }));
  const recarregar = () => render();
  const { lanc, aberturas } = await dadosCaixa(escolas, ate);
  $("#cxNovo").onclick = () => editarLancamento(null, visao === "todas" ? S.escolas[0]?.id : visao, recarregar);
  $("#cxAbert").onclick = () => aberturaCaixa(recarregar, aberturas);
  const cats = [...new Set([...lanc.map((l) => l.categoria).filter(Boolean)])].sort();
  $("#cxCat").innerHTML = opts(cats, p.cat || "", "Todas as categorias"); $("#cxCat").onchange = (e) => ir(navURL({ cat: e.target.value }));

  // saldo: abertura + movimentos válidos desde a data de abertura de cada escola
  const abertDe = (eid) => aberturas.find((a) => a.escola_id === eid);
  const conta = (l) => !l.cancelado && (!abertDe(l.escola_id) || l.data >= abertDe(l.escola_id).data);
  const sinal = (l) => (l.tipo === "entrada" ? 1 : -1) * Number(l.valor);
  const saldoInicial = escolas.reduce((s, eid) => s + Number(abertDe(eid)?.valor || 0), 0) + lanc.filter((l) => conta(l) && l.data < de).reduce((s, l) => s + sinal(l), 0);
  const periodo = lanc.filter((l) => l.data >= de && l.data <= ate);
  const validos = periodo.filter(conta);
  const ent = validos.filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
  const sai = validos.filter((l) => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);
  // lista filtrada com saldo acumulado
  let acc = saldoInicial;
  const linhas = periodo.map((l) => { if (conta(l)) acc += sinal(l); return { ...l, saldo: acc }; })
    .filter((l) => (p.canc || !l.cancelado) && (!p.tipo || l.tipo === p.tipo) && (!p.cat || l.categoria === p.cat) && (!p.forma || l.forma_pagamento === p.forma));
  const filtrado = p.tipo || p.cat || p.forma;
  const porCat = {}; validos.forEach((l) => { const k = (l.tipo === "entrada" ? "E" : "S") + "|" + (l.categoria || "Sem categoria"); porCat[k] = (porCat[k] || 0) + Number(l.valor); });
  const catLinhas = Object.entries(porCat).map(([k, v]) => ({ tipo: k[0] === "E" ? "Entrada" : "Saída", cat: k.slice(2), v })).sort((a, b) => a.tipo.localeCompare(b.tipo) || b.v - a.v);
  const periodoTxt = `${dataBR(de)} a ${dataBR(ate)}`;

  $("#cxBox").innerHTML = `<h3 style="margin:4px 0 12px">${esc(titulo)} <span class="muted small" style="font-weight:500">· ${periodoTxt}</span></h3>
    <div class="kpis">
      ${kpiCard({ ic: "landmark", cor: "navy", valor: money(saldoInicial), rotulo: "Saldo inicial", dinheiro: true })}
      ${kpiCard({ ic: "arrow-down-circle", cor: "green", valor: money(ent), rotulo: "Entradas", detalhe: `${validos.filter((l) => l.tipo === "entrada").length} lançamento(s)`, dinheiro: true })}
      ${kpiCard({ ic: "arrow-up-circle", cor: "red", valor: money(sai), rotulo: "Saídas", detalhe: `${validos.filter((l) => l.tipo === "saida").length} lançamento(s)`, dinheiro: true })}
      ${kpiCard({ ic: "wallet", cor: saldoInicial + ent - sai < 0 ? "red" : "blue", valor: money(saldoInicial + ent - sai), rotulo: "Saldo final", dinheiro: true })}
    </div>
    <div class="tabs" style="margin-bottom:12px">${[["", "Lançamentos"], ["cat", "Por categoria"]].map(([k, t]) => `<button class="${(p.modo || "") === k ? "on" : ""}" data-modo="${k}">${t}</button>`).join("")}
      <div class="right row" style="padding:4px 0"><button class="btn sm sec" id="cxXl"><i data-lucide="sheet"></i>Excel</button><button class="btn sm sec" id="cxPdf"><i data-lucide="printer"></i>PDF</button></div></div>
    <div id="cxTab"></div>`;
  $$("[data-modo]").forEach((b) => (b.onclick = () => ir(navURL({ modo: b.dataset.modo }))));
  if (p.modo === "cat") {
    $("#cxTab").innerHTML = catLinhas.length ? `<div class="scroll"><table><thead><tr><th>Tipo</th><th>Categoria</th><th class="num">Total</th><th class="num">% do tipo</th></tr></thead><tbody>
      ${catLinhas.map((c) => `<tr><td>${c.tipo === "Entrada" ? '<span class="tag ok">Entrada</span>' : '<span class="tag err">Saída</span>'}</td><td>${esc(c.cat)}</td><td class="num money">${money(c.v)}</td><td class="num">${Math.round(c.v / ((c.tipo === "Entrada" ? ent : sai) || 1) * 100)}%</td></tr>`).join("")}
      <tr><th></th><th>Total de entradas</th><th class="num money">${money(ent)}</th><th></th></tr><tr><th></th><th>Total de saídas</th><th class="num money">${money(sai)}</th><th></th></tr></tbody></table></div>` : vazio("Nenhuma movimentação no período.", "book-open");
  } else {
    $("#cxTab").innerHTML = (filtrado ? `<p class="hint" style="margin-bottom:8px">Com filtro, a coluna Saldo continua mostrando o saldo real do caixa naquela data (considera todos os lançamentos).</p>` : "") +
      (linhas.length ? `<div class="scroll"><table><thead><tr><th>Data</th>${visao === "todas" ? "<th>Escola</th>" : ""}<th>Descrição</th><th>Categoria</th><th>Forma</th><th class="num">Entrada</th><th class="num">Saída</th><th class="num">Saldo</th><th></th></tr></thead><tbody>
      ${linhas.map((l) => `<tr style="${l.cancelado ? "opacity:.55;text-decoration:line-through" : ""}"><td>${dataBR(l.data)}</td>${visao === "todas" ? `<td class="small">${esc(escolaNome(l.escola_id))}</td>` : ""}
        <td>${esc(l.descricao)}${l.origem !== "manual" ? ' <span class="tag blue" title="Lançamento automático">auto</span>' : ""}${l.cancelado ? `<div class="small" style="text-decoration:none">Cancelado: ${esc(l.motivo_cancelamento || "")}</div>` : ""}</td>
        <td class="small">${esc(l.categoria || "")}</td><td class="small">${esc(l.forma_pagamento || "")}</td>
        <td class="num money" style="color:var(--ok)">${l.tipo === "entrada" ? money(l.valor) : ""}</td><td class="num money" style="color:var(--err)">${l.tipo === "saida" ? money(l.valor) : ""}</td>
        <td class="num money"><b>${money(l.saldo)}</b></td>
        <td class="act">${l.comprovante_path ? `<button class="btn sm sec" data-comp="${esc(l.comprovante_path)}" title="Comprovante"><i data-lucide="paperclip"></i></button>` : ""}<button class="btn sm sec" data-ed="${l.id}" title="Editar"><i data-lucide="pencil"></i></button><button class="btn sm sec" data-cn="${l.id}" title="${l.cancelado ? "Reativar" : "Cancelar"}"><i data-lucide="${l.cancelado ? "undo-2" : "ban"}"></i></button><button class="btn sm sec" data-hi="${l.id}" title="Histórico"><i data-lucide="history"></i></button></td></tr>`).join("")}
      </tbody></table></div>` : vazio("Nenhum lançamento no período.", "book-open"));
    const acha = (id) => linhas.find((x) => x.id === id);
    $$("[data-ed]").forEach((b) => (b.onclick = () => editarLancamento(acha(b.dataset.ed), null, recarregar)));
    $$("[data-cn]").forEach((b) => (b.onclick = () => cancelarLancamento(acha(b.dataset.cn), recarregar)));
    $$("[data-hi]").forEach((b) => (b.onclick = () => historicoLancamento(acha(b.dataset.hi))));
    $$("[data-comp]").forEach((b) => (b.onclick = () => verComprovante(b.dataset.comp)));
  }
  const exp = () => p.modo === "cat"
    ? catLinhas.map((c) => ({ Tipo: c.tipo, Categoria: c.cat, Total: c.v }))
    : linhas.map((l) => ({ Data: dataBR(l.data), ...(visao === "todas" ? { Escola: escolaNome(l.escola_id) } : {}), Descrição: l.descricao, Categoria: l.categoria || "", Forma: l.forma_pagamento || "", Origem: ORIGEM_CX[l.origem], Entrada: l.tipo === "entrada" ? Number(l.valor) : "", Saída: l.tipo === "saida" ? Number(l.valor) : "", Saldo: l.saldo, Situação: l.cancelado ? "Cancelado: " + (l.motivo_cancelamento || "") : "" }));
  $("#cxXl").onclick = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Livro: titulo, Período: periodoTxt, "Saldo inicial": saldoInicial, Entradas: ent, Saídas: sai, "Saldo final": saldoInicial + ent - sai }]), "Resumo");
    const rows = exp(); if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), p.modo === "cat" ? "Por categoria" : "Lançamentos");
    XLSX.writeFile(wb, `livro-caixa-${visao === "todas" ? "consolidado" : normal(escolaNome(visao)).replace(/\W+/g, "-")}-${de}-a-${ate}.xlsx`);
  };
  $("#cxPdf").onclick = () => {
    const rows = exp().map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "Origem").map(([k, v]) => [k, typeof v === "number" ? money(v) : v])));
    const e = visao === "todas" ? { nome: S.escolas.map((x) => x.nome).join(" | "), logos: S.escolas.filter((x) => x.logo) } : S.escolas.find((x) => x.id === visao);
    const resumo = `<table><tr><th>Saldo inicial</th><th>Entradas</th><th>Saídas</th><th>Saldo final</th></tr><tr><td>${money(saldoInicial)}</td><td>${money(ent)}</td><td>${money(sai)}</td><td><b>${money(saldoInicial + ent - sai)}</b></td></tr></table>`;
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const tabela = rows.length ? `<table><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}</table>` : "<p>Nenhum lançamento no período.</p>";
    const html = folha(e, `<h2 class="titulo-doc">${p.modo === "cat" ? "RECEITAS E DESPESAS POR CATEGORIA" : "LIVRO CAIXA"}</h2><p style="text-align:center">${esc(titulo)} · ${periodoTxt}</p>${resumo}${tabela}`, `Emitido em ${dataHora(new Date())} por ${esc(S.perfil.nome)}`);
    verDocumento({ titulo: `Livro Caixa — ${periodoTxt}`, html });
  };
  icons();
});
