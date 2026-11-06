/* ==========================================================================
   Pagamentos de Prestadores de Serviços — acesso exclusivo (hoje: Jussara).
   O banco só entrega estes dados a quem está na lista acesso_prestadores;
   a tela apenas segue essa regra.
   ========================================================================== */
const SIT_PREST = { pago: ["Pago", "ok"], pendente: ["Pendente", "blue"], atrasado: ["Atrasado", "err"], cancelado: ["Cancelado", "off"] };
const TIPO_PREST = { unico: "Pagamento único", parcelado: "Parcelado", recorrente: "Mensal recorrente" };
const FORMAS = ["PIX", "Boleto", "Transferência", "Dinheiro", "Cartão", "Débito automático", "Outro"];

const vencNoMes = (ano, mes0, dia) => {
  const b = new Date(ano, mes0, 1); ano = b.getFullYear(); mes0 = b.getMonth(); // mês 12 vira janeiro do ano seguinte
  const ult = new Date(ano, mes0 + 1, 0).getDate();
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}-${String(Math.min(dia, ult)).padStart(2, "0")}`;
};
const prazoTxt = (d) => (d < 0 ? `atrasado há ${-d} dia${d === -1 ? "" : "s"}` : d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${d} dias`);

/* gera as datas de vencimento de um contrato */
function gerarVencimentos(c, aPartirDe, qtdMax) {
  const ini = new Date((aPartirDe || c.data_inicio) + "T12:00"); const dia = c.dia_vencimento || ini.getDate();
  if (c.tipo === "unico") return [{ vencimento: c.data_inicio, valor: Number(c.valor_total || c.valor_parcela) }];
  const n = c.tipo === "parcelado" ? Number(c.num_parcelas || 1) : (qtdMax || 12);
  const valor = c.tipo === "parcelado" && !Number(c.valor_parcela) && c.valor_total ? Math.round(c.valor_total / n * 100) / 100 : Number(c.valor_parcela);
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = vencNoMes(ini.getFullYear(), ini.getMonth() + i, dia);
    if (c.tipo === "recorrente" && c.data_fim && v > c.data_fim) break;
    out.push({ vencimento: v, valor });
  }
  return out;
}

async function alertasPrestadores() {
  if (!S.prestadores) return "";
  const lim = new Date(Date.now() + 5 * 864e5); const limISO = new Date(lim - lim.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const ps = await q(filtraEscola(sb.from("v_prest_parcelas").select("id,prestador,descricao,vencimento,valor,dias,situacao,escola_id").eq("status", "pendente").lte("vencimento", limISO)).order("vencimento"));
  S.alertasPrest = ps.length;
  const b = $('.nav button[data-r="prestadores"] .n'); if (b) { b.textContent = ps.length || ""; b.classList.toggle("hidden", !ps.length); }
  if (!ps.length) return "";
  return `<div class="card" style="margin-bottom:16px;border-left:5px solid var(--err)"><div class="row"><h3><i data-lucide="bell-ring"></i>Pagamentos a prestadores que pedem atenção</h3><a class="link right" href="#/prestadores">Abrir pagamentos</a></div>
    <ul class="list" style="margin-top:8px">${ps.map((p) => `<li><span class="tag ${p.dias < 0 ? "err" : p.dias <= 1 ? "warn" : "blue"}">${esc(prazoTxt(p.dias))}</span>
      <div style="flex:1"><b>${esc(p.prestador)}</b> <span class="muted small">${esc(p.descricao || "")}${S.escola ? "" : " · " + esc(escolaNome(p.escola_id))}</span></div>
      <span class="money"><b>${money(p.valor)}</b></span><span class="muted small">${dataBR(p.vencimento)}</span>
      <button class="btn sm ok" data-pagar-prest="${p.id}"><i data-lucide="check"></i>Pago</button></li>`).join("")}</ul></div>`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-pagar-prest]"); if (!b) return;
  const p = await q(sb.from("v_prest_parcelas").select("*").eq("id", b.dataset.pagarPrest).single());
  pagarPrestador(p, () => render());
});

function pagarPrestador(p, depois) {
  modal({
    title: `Registrar pagamento — ${p.prestador}`, size: "lg",
    body: `<p class="muted">${esc(p.descricao || "")} · parcela ${p.numero} · vencimento ${dataBR(p.vencimento)} · valor previsto ${money(p.valor)}</p><div class="grid">
      <div class="c4"><label class="req">Data do pagamento</label><input type="date" name="data_pagamento" value="${hojeISO()}"></div>
      <div class="c4"><label class="req">Valor pago (R$)</label><input name="valor_pago" data-mask="money" value="${numIn(p.valor)}"></div>
      <div class="c4"><label>Forma</label><select name="forma_pagamento">${opts(FORMAS, p.forma_pagamento || "PIX")}</select></div>
      <div><label>Comprovante (PDF, JPG ou PNG)</label><input type="file" name="arq" accept=".pdf,.jpg,.jpeg,.png"></div>
      <div><label>Observações</label><textarea name="obs">${esc(p.obs)}</textarea></div></div>`,
    acts: [{ label: "Cancelar", cls: "sec" }, { label: "Confirmar pagamento", cls: "ok", onClick: async (r) => {
      const f = lerForm(r); const arq = $('[name="arq"]', r).files[0];
      if (!f.data_pagamento || !(f.valor_pago > 0)) { toast("Informe data e valor pago.", true); return false; }
      const ok = await tenta(async () => {
        let comprovante_path = p.comprovante_path || null;
        if (arq) {
          if (!/^(application\/pdf|image\/(jpeg|png))$/.test(arq.type) || arq.size > 10485760) throw new Error("Comprovante deve ser PDF, JPG ou PNG de até 10 MB.");
          comprovante_path = `${p.id}/${uid()}.${arq.name.split(".").pop().toLowerCase()}`;
          const { error } = await sb.storage.from("prestadores").upload(comprovante_path, arq, { contentType: arq.type });
          if (error) throw error;
        }
        await q(sb.from("prest_parcelas").update({ status: "pago", data_pagamento: f.data_pagamento, valor_pago: f.valor_pago, forma_pagamento: f.forma_pagamento, obs: f.obs, comprovante_path }).eq("id", p.id));
      }, "Pagamento registrado. O alerta foi encerrado.");
      if (ok === undefined) return false; depois && depois(); } }],
  });
}
function editarParcelaPrest(p, depois) {
  modal({
    title: `Parcela ${p.numero} — ${p.prestador}`,
    body: `<div class="grid"><div class="c6"><label>Vencimento (data prevista)</label><input type="date" name="vencimento" value="${p.vencimento}"></div>
      <div class="c6"><label>Valor (R$)</label><input name="valor" data-mask="money" value="${numIn(p.valor)}"></div>
      <div class="c6"><label>Situação</label><select name="status">${opts([["pendente", "Pendente"], ["pago", "Pago"], ["cancelado", "Cancelado"]], p.status)}</select></div>
      <div class="c6"><label>Data efetiva do pagamento</label><input type="date" name="data_pagamento" value="${p.data_pagamento || ""}"></div>
      <div><label>Observações</label><textarea name="obs">${esc(p.obs)}</textarea></div></div>`,
    acts: [
      { label: "Excluir", cls: "ghost-danger", icon: "trash-2", onClick: async () => {
        if (!(await confirmar(`Excluir a parcela ${p.numero} de <b>${esc(p.prestador)}</b> (${dataBR(p.vencimento)}, ${money(p.valor)})? Não dá para desfazer.`, { perigo: true, ok: "Excluir" }))) return false;
        const ok = await tenta(async () => { if (p.comprovante_path) await sb.storage.from("prestadores").remove([p.comprovante_path]); await q(sb.from("prest_parcelas").delete().eq("id", p.id)); }, "Parcela excluída.");
        if (ok === undefined) return false; depois && depois(); } },
      ...(p.comprovante_path ? [{ label: "Ver comprovante", cls: "sec", icon: "paperclip", close: false, onClick: async () => { verComprovante(p.comprovante_path); return false; } }] : []),
      { label: "Cancelar", cls: "sec" },
      { label: "Salvar", onClick: async (r) => { const f = lerForm(r); if (f.status !== "pago") { f.data_pagamento = null; f.valor_pago = null; }
        const ok = await tenta(() => q(sb.from("prest_parcelas").update(f).eq("id", p.id)), "Parcela atualizada."); if (ok === undefined) return false; depois && depois(); } }],
  });
}
async function verComprovante(path) {
  const { data, error } = await sb.storage.from("prestadores").createSignedUrl(path, 120);
  if (error) return toast(erroAmigavel(error), true);
  window.open(data.signedUrl, "_blank", "noopener");
}

function formContratoPrest(c = {}) {
  return `<div class="grid">
    <div class="c8"><label class="req">Prestador de serviço ou empresa</label><input name="prestador" value="${esc(c.prestador)}"></div>
    <div class="c4"><label class="req">Escola que paga</label><select name="escola_id">${escolaOpts(c.escola_id || S.escola || S.escolas[0]?.id)}</select></div>
    <div><label>Descrição do serviço</label><input name="descricao" value="${esc(c.descricao)}" placeholder="Ex.: limpeza, contabilidade, manutenção do ar-condicionado"></div>
    <div class="c4"><label class="req">Tipo de pagamento</label><select name="tipo" id="pTipo" ${c.id ? "disabled" : ""}>${opts(Object.entries(TIPO_PREST), c.tipo || "recorrente")}</select></div>
    <div class="c4"><label>Valor total do contrato (R$)</label><input name="valor_total" data-mask="money" value="${numIn(c.valor_total)}" placeholder="quando houver"></div>
    <div class="c4"><label class="req" id="pLblValor">Valor da mensalidade/parcela (R$)</label><input name="valor_parcela" data-mask="money" value="${numIn(c.valor_parcela)}"></div>
    <div class="c4"><label id="pLblIni">Primeiro vencimento</label><input type="date" name="data_inicio" value="${c.data_inicio || hojeISO()}"></div>
    <div class="c4 pRec"><label>Dia de vencimento</label><input type="number" name="dia_vencimento" min="1" max="31" value="${c.dia_vencimento || ""}" placeholder="padrão: dia do 1º vencimento"></div>
    <div class="c4 pParc"><label>Quantidade de parcelas</label><input type="number" name="num_parcelas" min="1" max="120" value="${c.num_parcelas || ""}"></div>
    <div class="c4 pRecFim"><label>Fim do contrato</label><input type="date" name="data_fim" value="${c.data_fim || ""}"><div class="hint">Vazio = gera 12 meses e você estende depois.</div></div>
    <div class="c4"><label>Forma de pagamento</label><select name="forma_pagamento">${opts(FORMAS, c.forma_pagamento, "—")}</select></div>
    <div><label>Observações</label><textarea name="obs">${esc(c.obs)}</textarea></div></div>`;
}
function ajustarFormPrest(r) {
  const t = $("#pTipo", r).value;
  $$(".pParc", r).forEach((x) => x.classList.toggle("hidden", t !== "parcelado"));
  $$(".pRecFim", r).forEach((x) => x.classList.toggle("hidden", t !== "recorrente"));
  $$(".pRec", r).forEach((x) => x.classList.toggle("hidden", t === "unico"));
  $("#pLblIni", r).textContent = t === "unico" ? "Data prevista do pagamento" : "Primeiro vencimento";
  $("#pLblValor", r).textContent = t === "unico" ? "Valor (R$)" : "Valor da mensalidade/parcela (R$)";
}
function editarContratoPrest(c, depois) {
  modal({
    title: c?.id ? "Editar contrato de prestador" : "Novo pagamento a prestador", size: "lg", body: formContratoPrest(c || {}),
    onOpen: (r) => { $("#pTipo", r).onchange = () => ajustarFormPrest(r); ajustarFormPrest(r); },
    acts: [
      ...(c?.id ? [{ label: "Excluir", cls: "ghost-danger", icon: "trash-2", onClick: async () => {
        const ps = await q(sb.from("prest_parcelas").select("id,status,comprovante_path").eq("contrato_id", c.id));
        const pagas = ps.filter((x) => x.status === "pago").length;
        if (!(await confirmar(`Excluir <b>${esc(c.prestador)}</b> e ${ps.length} vencimento(s)${pagas ? `, incluindo <b>${pagas} pagamento(s) já registrado(s)</b> e seus comprovantes` : ""}? Não dá para desfazer.${pagas ? "<br><br>Se o contrato só terminou, prefira <b>Encerrar contrato</b>: o histórico fica guardado." : ""}`, { perigo: true, ok: "Excluir definitivamente" }))) return false;
        const ok = await tenta(async () => {
          const arqs = ps.map((x) => x.comprovante_path).filter(Boolean); if (arqs.length) await sb.storage.from("prestadores").remove(arqs);
          await q(sb.from("prest_contratos").delete().eq("id", c.id));
        }, "Prestador excluído.");
        if (ok === undefined) return false; depois(); } },
        { label: c.ativo ? "Encerrar contrato" : "Reativar", cls: "ghost-danger", onClick: async () => {
        if (c.ativo) {
          if (!(await confirmar("Encerrar este contrato? As parcelas futuras ainda não pagas serão canceladas; as pagas ficam no histórico.", { perigo: true, ok: "Encerrar" }))) return false;
          await tenta(async () => { await q(sb.from("prest_contratos").update({ ativo: false }).eq("id", c.id)); await q(sb.from("prest_parcelas").update({ status: "cancelado" }).eq("contrato_id", c.id).eq("status", "pendente").gte("vencimento", hojeISO())); }, "Contrato encerrado.");
        } else await tenta(() => q(sb.from("prest_contratos").update({ ativo: true }).eq("id", c.id)), "Contrato reativado.");
        depois(); } }] : []),
      { label: "Cancelar", cls: "sec" },
      { label: c?.id ? "Salvar" : "Salvar e gerar vencimentos", onClick: async (r) => {
        if (!exigir(r, ["prestador"])) return false;
        const o = lerForm(r); if (c?.id) delete o.tipo; else o.tipo = $("#pTipo", r).value;
        const tipo = o.tipo || c.tipo;
        if (!(o.valor_parcela > 0) && !(tipo !== "recorrente" && o.valor_total > 0)) { toast("Informe o valor.", true); return false; }
        if (tipo === "parcelado" && !(o.num_parcelas > 0)) { toast("Informe a quantidade de parcelas.", true); return false; }
        if (!o.valor_total) o.valor_total = null;
        const ok = await tenta(async () => {
          if (c?.id) return q(sb.from("prest_contratos").update(o).eq("id", c.id));
          const novo = await q(sb.from("prest_contratos").insert(o).select().single());
          const vs = gerarVencimentos(novo);
          try { await q(sb.from("prest_parcelas").insert(vs.map((v, i) => ({ contrato_id: novo.id, escola_id: novo.escola_id, numero: i + 1, vencimento: v.vencimento, valor: v.valor, forma_pagamento: novo.forma_pagamento })))); }
          catch (e) { await sb.from("prest_contratos").delete().eq("id", novo.id); throw e; } // não deixa cadastro pela metade
          toast(`${vs.length} vencimento(s) gerado(s).`);
        }, c?.id ? "Contrato atualizado. Ajuste parcelas já geradas na aba Parcelas, se precisar." : undefined);
        if (ok === undefined) return false; depois(); } }],
  });
}
async function estenderRecorrente(c, depois) {
  const ult = await q(sb.from("prest_parcelas").select("numero,vencimento").eq("contrato_id", c.id).order("numero", { ascending: false }).limit(1));
  const base = ult[0] ? new Date(ult[0].vencimento + "T12:00") : new Date(c.data_inicio + "T12:00");
  if (ult[0]) base.setMonth(base.getMonth() + 1, 1);
  const inicio = ult[0] ? vencNoMes(base.getFullYear(), base.getMonth(), c.dia_vencimento || new Date(c.data_inicio + "T12:00").getDate()) : c.data_inicio;
  const vs = gerarVencimentos({ ...c, data_inicio: inicio }, inicio, 12);
  if (!vs.length) return toast("O contrato já chegou à data de fim.", true);
  await tenta(() => q(sb.from("prest_parcelas").insert(vs.map((v, i) => ({ contrato_id: c.id, escola_id: c.escola_id, numero: (ult[0]?.numero || 0) + i + 1, vencimento: v.vencimento, valor: v.valor, forma_pagamento: c.forma_pagamento })))), `${vs.length} novo(s) vencimento(s).`);
  depois();
}

rota("prestadores", async (main, _, p) => {
  if (!S.prestadores) { main.innerHTML = vazio("Página não encontrada.", "lock"); return; }
  const aba = p.aba || "resumo";
  const hoje = hojeISO(); const mes = p.mes || hoje.slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const iniMes = `${mes}-01`, fimMes = vencNoMes(y, m - 1, 31);
  const recarregar = () => render();
  main.innerHTML = pageHead("hand-coins", "Pagamentos de Prestadores de Serviços", "Contratos e serviços pagos pelas escolas.", `<button class="btn" id="pNovo"><i data-lucide="plus"></i>Novo pagamento</button>`) +
    `<div class="tabs">${[["resumo", "Resumo", "layout-dashboard"], ["calendario", "Calendário", "calendar-days"], ["parcelas", "Vencimentos", "list-checks"], ["contratos", "Prestadores e contratos", "briefcase"]].map(([k, t, ic]) => `<button class="${k === aba ? "on" : ""}" data-a="${k}"><i data-lucide="${ic}"></i>${t}</button>`).join("")}</div><div id="prBox">${carregando()}</div>`;
  $$("[data-a]").forEach((b) => (b.onclick = () => ir(`#/prestadores?aba=${b.dataset.a}&mes=${mes}`)));
  $("#pNovo").onclick = () => editarContratoPrest(null, recarregar);
  icons();
  const box = $("#prBox");
  const mesNav = () => { const a = new Date(y, m - 2, 1), b = new Date(y, m, 1); const f = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `<div class="row" style="margin-bottom:14px"><button class="btn sm sec" data-mes="${f(a)}"><i data-lucide="chevron-left"></i></button><b style="min-width:180px;text-align:center">${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} de ${y}</b><button class="btn sm sec" data-mes="${f(b)}"><i data-lucide="chevron-right"></i></button>${mes !== hoje.slice(0, 7) ? `<button class="btn sm sec" data-mes="${hoje.slice(0, 7)}">Hoje</button>` : ""}</div>`; };
  const ligarMes = () => $$("[data-mes]", box).forEach((b) => (b.onclick = () => ir(`#/prestadores?aba=${aba}&mes=${b.dataset.mes}`)));

  if (aba === "resumo") {
    const [doMes, atrasadas, proximas, historico] = await Promise.all([
      q(filtraEscola(sb.from("v_prest_parcelas").select("*").gte("vencimento", iniMes).lte("vencimento", fimMes).neq("status", "cancelado"))),
      q(filtraEscola(sb.from("v_prest_parcelas").select("*").eq("status", "pendente").lt("vencimento", hoje)).order("vencimento")),
      q(filtraEscola(sb.from("v_prest_parcelas").select("*").eq("status", "pendente").gte("vencimento", hoje)).order("vencimento").limit(10)),
      q(filtraEscola(sb.from("v_prest_parcelas").select("*").eq("status", "pago")).order("data_pagamento", { ascending: false }).limit(15)),
    ]);
    const soma = (l, f = (x) => x.valor) => l.reduce((s, x) => s + Number(f(x) || 0), 0);
    const pagas = doMes.filter((x) => x.status === "pago");
    box.innerHTML = mesNav() + `<div class="kpis">
        ${kpiCard({ ic: "calendar", cor: "blue", valor: money(soma(doMes)), rotulo: "Previsto no mês", detalhe: `${doMes.length} vencimento(s)`, dinheiro: true })}
        ${kpiCard({ ic: "check-circle-2", cor: "green", valor: money(soma(pagas, (x) => x.valor_pago)), rotulo: "Pago no mês", detalhe: `${pagas.length} pagamento(s)`, dinheiro: true })}
        ${kpiCard({ ic: "clock", cor: "amber", valor: money(soma(doMes.filter((x) => x.situacao === "pendente"))), rotulo: "Pendente no mês", dinheiro: true })}
        ${kpiCard({ ic: "alert-triangle", cor: "red", valor: money(soma(atrasadas)), rotulo: "Total atrasado", detalhe: `${atrasadas.length} vencimento(s)`, dinheiro: true })}
      </div>
      <div class="two">
        <div class="card"><h3><i data-lucide="calendar-clock"></i>Próximos vencimentos</h3>${listaPrest([...atrasadas, ...proximas])}</div>
        <div class="card"><h3><i data-lucide="history"></i>Histórico de pagamentos</h3>${historico.length ? `<ul class="list">${historico.map((x) => `<li><div style="flex:1"><b>${esc(x.prestador)}</b><div class="small muted">${esc(x.descricao || "")} · pago em ${dataBR(x.data_pagamento)} · ${esc(x.forma_pagamento || "")}</div></div><span class="money">${money(x.valor_pago)}</span>${x.comprovante_path ? `<button class="btn sm sec" data-comp="${esc(x.comprovante_path)}" title="Comprovante"><i data-lucide="paperclip"></i></button>` : ""}</li>`).join("")}</ul>` : '<div class="empty-sm">Nenhum pagamento registrado ainda.</div>'}</div>
      </div>`;
  } else if (aba === "calendario") {
    const ps = await q(filtraEscola(sb.from("v_prest_parcelas").select("*").gte("vencimento", iniMes).lte("vencimento", fimMes).neq("status", "cancelado")).order("vencimento"));
    const primeiro = new Date(y, m - 1, 1).getDay(), dias = new Date(y, m, 0).getDate();
    const cel = [];
    for (let i = 0; i < primeiro; i++) cel.push(`<div class="cal-d vazio"></div>`);
    for (let d = 1; d <= dias; d++) {
      const iso = `${mes}-${String(d).padStart(2, "0")}`; const its = ps.filter((x) => x.vencimento === iso);
      cel.push(`<div class="cal-d${iso === hoje ? " hoje" : ""}"><div class="cal-n">${d}</div>${its.map((x) => `<button class="cal-it ${x.situacao}" data-p="${x.id}" title="${esc(x.prestador)} — ${money(x.valor)} — ${SIT_PREST[x.situacao][0]}"><b>${esc(x.prestador)}</b><span>${money(x.valor)} · ${SIT_PREST[x.situacao][0]}</span></button>`).join("")}</div>`);
    }
    box.innerHTML = mesNav() + `<div class="cal">${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => `<div class="cal-h">${d}</div>`).join("")}${cel.join("")}</div>
      <div class="row small muted" style="margin-top:10px"><span class="tag ok">Pago</span><span class="tag blue">Pendente</span><span class="tag err">Atrasado</span> Clique num pagamento para registrar ou ver.</div>`;
    $$("[data-p]", box).forEach((b) => (b.onclick = () => { const x = ps.find((z) => z.id === b.dataset.p); x.status === "pago" ? editarParcelaPrest(x, recarregar) : pagarPrestador(x, recarregar); }));
  } else if (aba === "parcelas") {
    const ps = await fetchAll(() => filtraEscola(sb.from("v_prest_parcelas").select("*")).order("vencimento"));
    box.innerHTML = `<div class="bar-tools"><select id="fSit">${opts([["", "Todas as situações"], ["aberto", "Em aberto (pendente + atrasado)"], ...Object.entries(SIT_PREST).map(([k, v]) => [k, v[0]])], p.sit || "aberto")}</select>
      <input type="month" id="fMes" value="${p.fmes || ""}" style="width:auto"><input id="fQ" class="grow" placeholder="Prestador ou serviço"><button class="btn sec" id="fXl"><i data-lucide="sheet"></i>Excel</button></div><div id="pTab"></div>`;
    let vis = [];
    const desenhar = () => {
      const s = $("#fSit").value, mm = $("#fMes").value, f = normal($("#fQ").value);
      vis = ps.filter((x) => (!s || (s === "aberto" ? ["pendente", "atrasado"].includes(x.situacao) : x.situacao === s)) && (!mm || x.vencimento.startsWith(mm)) && (!f || normal(x.prestador + " " + (x.descricao || "")).includes(f)));
      const tot = vis.filter((x) => x.status !== "cancelado").reduce((a, x) => a + Number(x.valor), 0);
      $("#pTab").innerHTML = vis.length ? `<div class="scroll"><table><thead><tr><th>Vencimento</th><th>Prestador</th>${S.escola ? "" : "<th>Escola</th>"}<th>Parcela</th><th class="num">Valor</th><th>Pagamento</th><th>Situação</th><th></th></tr></thead><tbody>
        ${vis.map((x) => `<tr class="${x.situacao === "atrasado" ? "alert-row" : ""}"><td>${dataBR(x.vencimento)}${x.situacao !== "pago" && x.situacao !== "cancelado" && x.dias <= 5 ? `<div class="small" style="color:${x.dias < 0 ? "var(--err)" : "#8a5a00"}">${esc(prazoTxt(x.dias))}</div>` : ""}</td>
          <td><b>${esc(x.prestador)}</b><div class="small muted">${esc(x.descricao || "")}</div></td>${S.escola ? "" : `<td class="small">${esc(escolaNome(x.escola_id))}</td>`}<td>${x.numero}</td><td class="num money">${money(x.valor)}</td>
          <td class="small">${x.data_pagamento ? `${dataBR(x.data_pagamento)}<br>${money(x.valor_pago)} · ${esc(x.forma_pagamento || "")}` : "—"}</td><td>${tag(SIT_PREST, x.situacao)}</td>
          <td class="act">${["pendente", "atrasado"].includes(x.situacao) ? `<button class="btn sm ok" data-pg="${x.id}"><i data-lucide="check"></i>Pagar</button>` : ""}${x.comprovante_path ? `<button class="btn sm sec" data-comp="${esc(x.comprovante_path)}" title="Comprovante"><i data-lucide="paperclip"></i></button>` : ""}<button class="btn sm sec" data-ed="${x.id}" title="Editar"><i data-lucide="pencil"></i></button></td></tr>`).join("")}
        </tbody></table></div><p class="small muted">${vis.length} vencimento(s) · total ${money(tot)}</p>` : vazio("Nenhum vencimento com esses filtros.", "list-checks");
      $$("[data-pg]", box).forEach((b) => (b.onclick = () => pagarPrestador(ps.find((x) => x.id === b.dataset.pg), recarregar)));
      $$("[data-ed]", box).forEach((b) => (b.onclick = () => editarParcelaPrest(ps.find((x) => x.id === b.dataset.ed), recarregar)));
      $$("[data-comp]", box).forEach((b) => (b.onclick = () => verComprovante(b.dataset.comp)));
      icons();
    };
    ["fSit", "fMes", "fQ"].forEach((i) => $("#" + i).addEventListener("input", desenhar));
    $("#fXl").onclick = () => exportXLSX(vis.map((x) => ({ Vencimento: dataBR(x.vencimento), Prestador: x.prestador, Serviço: x.descricao || "", Escola: escolaNome(x.escola_id), Parcela: x.numero, Valor: Number(x.valor), "Data do pagamento": dataBR(x.data_pagamento), "Valor pago": x.valor_pago != null ? Number(x.valor_pago) : "", Forma: x.forma_pagamento || "", Situação: SIT_PREST[x.situacao][0], Observações: x.obs || "" })), "pagamentos-prestadores");
    desenhar();
  } else {
    const [cs, ps] = await Promise.all([q(filtraEscola(sb.from("prest_contratos").select("*")).order("ativo", { ascending: false }).order("prestador")), fetchAll(() => filtraEscola(sb.from("v_prest_parcelas").select("contrato_id,valor,valor_pago,status,situacao,vencimento")))]);
    box.innerHTML = cs.length ? `<div class="scroll"><table><thead><tr><th>Prestador</th>${S.escola ? "" : "<th>Escola</th>"}<th>Tipo</th><th class="num">Parcela</th><th class="num">Pago</th><th class="num">Saldo pendente</th><th>Próximo vencimento</th><th></th></tr></thead><tbody>
      ${cs.map((c) => { const mp = ps.filter((x) => x.contrato_id === c.id && x.status !== "cancelado"); const pago = mp.reduce((a, x) => a + Number(x.valor_pago || 0), 0); const saldo = mp.filter((x) => x.status === "pendente").reduce((a, x) => a + Number(x.valor), 0);
        const prox = mp.filter((x) => x.status === "pendente").sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
        return `<tr><td><b>${esc(c.prestador)}</b> ${c.ativo ? "" : '<span class="tag off">Encerrado</span>'}<div class="small muted">${esc(c.descricao || "")}</div></td>${S.escola ? "" : `<td class="small">${esc(escolaNome(c.escola_id))}</td>`}
          <td class="small">${esc(TIPO_PREST[c.tipo])}${c.tipo === "parcelado" ? ` · ${c.num_parcelas}x` : ""}${c.valor_total ? `<br>total ${money(c.valor_total)}` : ""}</td><td class="num money">${money(c.valor_parcela || c.valor_total)}</td><td class="num money">${money(pago)}</td><td class="num money">${money(saldo)}</td>
          <td>${prox ? `${dataBR(prox.vencimento)} ${prox.situacao === "atrasado" ? '<span class="tag err">Atrasado</span>' : ""}` : "—"}</td>
          <td class="act">${c.tipo === "recorrente" && c.ativo ? `<button class="btn sm sec" data-est="${c.id}" title="Gerar mais 12 meses"><i data-lucide="calendar-plus"></i>+12 meses</button>` : ""}<button class="btn sm sec" data-ec="${c.id}"><i data-lucide="pencil"></i></button></td></tr>`; }).join("")}
      </tbody></table></div>` : vazio("Nenhum prestador cadastrado. Clique em Novo pagamento.", "briefcase");
    $$("[data-ec]", box).forEach((b) => (b.onclick = () => editarContratoPrest(cs.find((c) => c.id === b.dataset.ec), recarregar)));
    $$("[data-est]", box).forEach((b) => (b.onclick = () => estenderRecorrente(cs.find((c) => c.id === b.dataset.est), recarregar)));
  }
  $$("[data-comp]", box).forEach((b) => (b.onclick = () => verComprovante(b.dataset.comp)));
  $$("[data-pp]", box).forEach((b) => (b.onclick = async () => { const x = await q(sb.from("v_prest_parcelas").select("*").eq("id", b.dataset.pp).single()); pagarPrestador(x, recarregar); }));
  ligarMes(); icons();
});
function listaPrest(l) {
  if (!l.length) return '<div class="empty-sm">Nenhum vencimento pendente.</div>';
  return `<ul class="list">${l.map((x) => `<li><span class="tag ${x.dias < 0 ? "err" : x.dias <= 1 ? "warn" : x.dias <= 5 ? "blue" : "off"}">${esc(prazoTxt(x.dias))}</span>
    <div style="flex:1"><b>${esc(x.prestador)}</b><div class="small muted">${esc(x.descricao || "")} · ${dataBR(x.vencimento)}</div></div><span class="money"><b>${money(x.valor)}</b></span>
    <button class="btn sm ok" data-pp="${x.id}"><i data-lucide="check"></i>Pago</button></li>`).join("")}</ul>`;
}
