/* ==========================================================================
   Importação em massa de alunos antigos por planilha Excel.
   Uma linha = um aluno com sua matrícula. Irmãos são agrupados pela família
   (mesmo CPF do responsável financeiro, ou mesma mãe + mesmo telefone).
   ========================================================================== */
const COLS_IMP = [
  ["escola", "Escola", true, "Estação Criança", "Estação Criança ou Colégio MEF"],
  ["ano", "Ano letivo", true, "2026", "Ex.: 2026"],
  ["serie", "Série", true, "Maternal 1", "Igual ao cadastro de turmas (ver aba Séries)"],
  ["periodo", "Período", true, "Manhã", "Manhã, Tarde ou Integral"],
  ["entrada", "Entrada", false, "07:00", "hh:mm"],
  ["saida", "Saída", false, "12:00", "hh:mm"],
  ["nome", "Nome do aluno", true, "Helena Souza Lima", ""],
  ["nascimento", "Nascimento", true, "14/03/2023", "dd/mm/aaaa"],
  ["sexo", "Sexo", false, "Feminino", "Feminino ou Masculino"],
  ["cpf", "CPF do aluno", false, "", ""],
  ["rg", "RG do aluno", false, "", ""],
  ["mae", "Nome da mãe", true, "Ana Souza Lima", ""],
  ["pai", "Nome do pai", false, "Carlos Lima", ""],
  ["endereco", "Endereço (rua, nº)", false, "Rua das Flores, 45", ""],
  ["bairro", "Bairro", false, "Centro", ""],
  ["cidade", "Cidade", false, "Cosmópolis", ""],
  ["cep", "CEP", false, "13150-000", ""],
  ["email", "E-mail da família", false, "ana@email.com", ""],
  ["rf_parentesco", "Resp. financeiro - parentesco", true, "Mãe", "Mãe, Pai, Avó…"],
  ["rf_nome", "Resp. financeiro - nome", true, "Ana Souza Lima", ""],
  ["rf_cpf", "Resp. financeiro - CPF", false, "529.982.247-25", "Recomendado: agrupa irmãos e permite assinatura digital"],
  ["rf_rg", "Resp. financeiro - RG", false, "", ""],
  ["rf_nasc", "Resp. financeiro - nascimento", false, "", "dd/mm/aaaa"],
  ["rf_tel", "Resp. financeiro - telefone", true, "(19) 99999-0000", ""],
  ["rf_email", "Resp. financeiro - e-mail", false, "", ""],
  ["r2_nome", "2º responsável - nome", false, "Carlos Lima", ""],
  ["r2_parentesco", "2º responsável - parentesco", false, "Pai", ""],
  ["r2_cpf", "2º responsável - CPF", false, "", ""],
  ["r2_tel", "2º responsável - telefone", false, "", ""],
  ["mensalidade", "Mensalidade (R$)", true, "1300,00", "Valor cheio, sem desconto"],
  ["parcelas", "Nº de parcelas", false, "13", "Padrão 13"],
  ["p1_valor", "1ª parcela diferente (R$)", false, "", "Vazio = igual às demais"],
  ["p1_venc", "Vencimento da 1ª parcela", false, "", "dd/mm/aaaa"],
  ["dia", "Dia de vencimento", false, "10", ""],
  ["venc_ini", "1º vencimento das mensalidades", false, "10/01/2026", "dd/mm/aaaa (padrão: janeiro do ano letivo)"],
  ["desc_pct", "Desconto (%)", false, "", ""],
  ["desc_val", "Desconto (R$)", false, "", "Use % ou R$, não os dois"],
  ["desc_motivo", "Motivo do desconto", false, "", ""],
  ["material", "Material didático (R$)", false, "", ""],
  ["pagas", "Parcelas já pagas (quantidade)", false, "10", "As primeiras N parcelas entram como pagas"],
  ["contrato_papel", "Contrato assinado em papel? (Sim/Não)", false, "Sim", ""],
  ["contrato_data", "Data da assinatura do contrato", false, "15/11/2025", "dd/mm/aaaa"],
  ["docs_ok", "Documentos entregues? (Sim/Não)", false, "Sim", "Sim = marca o checklist como entregue"],
  ["obs", "Observações", false, "", ""],
];

function baixarModeloImportacao() {
  const wb = XLSX.utils.book_new();
  const ex = Object.fromEntries(COLS_IMP.map(([, h, , e]) => [h + (COLS_IMP.find((c) => c[1] === h)[2] ? " *" : ""), e]));
  const ws = XLSX.utils.json_to_sheet([ex]);
  ws["!cols"] = COLS_IMP.map(([, h]) => ({ wch: Math.max(14, h.length + 3) }));
  XLSX.utils.book_append_sheet(wb, ws, "Alunos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(COLS_IMP.map(([, h, req, , nota]) => ({ Coluna: h, Obrigatória: req ? "Sim" : "", Como_preencher: nota }))), "Instruções");
  q(sb.from("turmas").select("escola_id,ano_letivo,serie,periodo").order("serie")).then((ts) => {
    const vistos = new Set(); const linhas = [];
    ts.forEach((t) => { const k = t.escola_id + t.serie + t.periodo; if (vistos.has(k)) return; vistos.add(k); linhas.push({ Escola: escolaNome(t.escola_id), Série: t.serie, Período: t.periodo }); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Séries");
    XLSX.writeFile(wb, "modelo-importacao-alunos.xlsx");
  });
}

/* ---------- leitura e conversão ---------- */
const chaveCab = (s) => normal(String(s || "").replace(/\*/g, "")).replace(/[^a-z0-9]/g, "");
function dataISO(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0].slice(0, 10);
  return "invalida";
}
function horaTxt(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v < 1) { const min = Math.round(v * 1440); return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; }
  if (v instanceof Date) return `${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}`;
  const m = String(v).match(/(\d{1,2})[:h](\d{2})?/); return m ? `${m[1].padStart(2, "0")}:${m[2] || "00"}` : null;
}
const simNao = (v) => /^s/i.test(String(v || "").trim());
const txt = (v) => { const s = String(v ?? "").trim(); return s || null; };

async function lerPlanilha(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets["Alunos"] || wb.Sheets[wb.SheetNames[0]];
  const bruto = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
  const mapa = Object.fromEntries(COLS_IMP.map(([k, h]) => [chaveCab(h), k]));
  return bruto.map((r, i) => {
    const o = { _linha: i + 2 };
    for (const [h, v] of Object.entries(r)) { const k = mapa[chaveCab(h)]; if (k) o[k] = v; }
    return o;
  }).filter((o) => Object.keys(o).length > 1 && (o.nome || o.rf_nome));
}

/* ---------- validação ---------- */
async function validarLinhas(linhas) {
  const [turmas, existentes, respsCpf] = await Promise.all([
    fetchAll(() => sb.from("turmas").select("id,escola_id,ano_letivo,serie,periodo,hora_entrada,hora_saida,mensalidade_padrao")),
    fetchAll(() => sb.from("alunos").select("id,nome,nascimento,escola_id")),
    fetchAll(() => sb.from("responsaveis").select("id,familia_id,cpf,nome").not("cpf", "is", null)),
  ]);
  const jaTem = new Set(existentes.map((a) => normal(a.nome) + "|" + a.nascimento));
  const vistos = new Set();
  const escolaDe = (v) => {
    const n = normal(v || "");
    if (!n) return S.escola || (S.escolas.length === 1 ? S.escolas[0].id : null);
    return S.escolas.find((e) => normal(e.nome).includes(n) || n.includes(normal(e.nome).replace(/^escola |^colegio /, "")) || (n.includes("mef") && /mef/i.test(e.nome)) || (n.includes("estac") && /esta/i.test(normal(e.nome))))?.id || null;
  };
  return linhas.map((l) => {
    const erros = [], avisos = [];
    const r = { _linha: l._linha, erros, avisos };
    r.escola_id = escolaDe(l.escola); if (!r.escola_id) erros.push("Escola não reconhecida");
    r.ano = Number(String(l.ano || "").replace(/\D/g, "")) || null; if (!r.ano || r.ano < 2000 || r.ano > 2100) erros.push("Ano letivo inválido");
    r.serie = txt(l.serie); if (!r.serie) erros.push("Série vazia");
    const per = normal(l.periodo || ""); r.periodo = per.startsWith("man") ? "Manhã" : per.startsWith("tar") ? "Tarde" : per.startsWith("int") || per.startsWith("per") ? "Integral" : per.startsWith("noi") ? "Noite" : null;
    if (!r.periodo) erros.push("Período inválido (Manhã, Tarde ou Integral)");
    r.nome = txt(l.nome); if (!r.nome) erros.push("Nome do aluno vazio");
    r.nascimento = dataISO(l.nascimento); if (!r.nascimento || r.nascimento === "invalida") erros.push("Nascimento inválido");
    r.mae = txt(l.mae); if (!r.mae) erros.push("Nome da mãe vazio");
    r.rf_nome = txt(l.rf_nome); if (!r.rf_nome) erros.push("Responsável financeiro vazio");
    r.rf_parentesco = txt(l.rf_parentesco) || (r.rf_nome && r.mae && normal(r.rf_nome) === normal(r.mae) ? "Mãe" : null); if (!r.rf_parentesco) erros.push("Parentesco do responsável vazio");
    r.rf_tel = txt(l.rf_tel); if (!r.rf_tel) erros.push("Telefone do responsável vazio");
    r.rf_cpf = txt(l.rf_cpf); if (r.rf_cpf && !cpfValido(r.rf_cpf)) erros.push("CPF do responsável inválido"); if (!r.rf_cpf) avisos.push("Sem CPF do responsável");
    r.cpf = txt(l.cpf); if (r.cpf && !cpfValido(r.cpf)) erros.push("CPF do aluno inválido");
    r.r2_cpf = txt(l.r2_cpf); if (r.r2_cpf && !cpfValido(r.r2_cpf)) erros.push("CPF do 2º responsável inválido");
    r.mensalidade = num(l.mensalidade); if (!(r.mensalidade > 0)) erros.push("Mensalidade vazia");
    r.parcelas = Number(l.parcelas) || 13; if (r.parcelas < 1 || r.parcelas > 24) erros.push("Nº de parcelas inválido");
    r.p1_valor = num(l.p1_valor) || null; r.p1_venc = dataISO(l.p1_venc); if (r.p1_venc === "invalida") erros.push("Vencimento da 1ª parcela inválido");
    r.venc_ini = dataISO(l.venc_ini); if (r.venc_ini === "invalida") erros.push("1º vencimento inválido");
    r.dia = Number(l.dia) || (r.venc_ini && r.venc_ini !== "invalida" ? Number(r.venc_ini.slice(8)) : 10);
    if (!r.venc_ini) r.venc_ini = r.ano ? `${r.ano}-01-${String(Math.min(r.dia, 28)).padStart(2, "0")}` : null;
    r.desc_pct = num(l.desc_pct); r.desc_val = num(l.desc_val); if (r.desc_pct && r.desc_val) erros.push("Use desconto em % ou em R$, não os dois");
    r.pagas = Math.max(0, Number(l.pagas) || 0); if (r.pagas > r.parcelas) erros.push("Parcelas pagas maior que o total");
    r.contrato_papel = simNao(l.contrato_papel); r.contrato_data = dataISO(l.contrato_data); if (r.contrato_data === "invalida") erros.push("Data do contrato inválida");
    if (r.contrato_papel && !r.contrato_data) avisos.push("Contrato sem data: usará a data de hoje");
    const k = normal(r.nome || "") + "|" + r.nascimento;
    if (jaTem.has(k)) erros.push("Aluno já cadastrado no sistema");
    if (vistos.has(k)) erros.push("Aluno repetido na planilha"); vistos.add(k);
    const perBusca = r.periodo === "Integral" && !turmas.some((x) => x.escola_id === r.escola_id && x.ano_letivo === r.ano && chaveOpcao(x.serie) === chaveOpcao(r.serie) && x.periodo === "Integral") ? "Manhã" : r.periodo;
    const t = turmas.find((x) => x.escola_id === r.escola_id && x.ano_letivo === r.ano && chaveOpcao(x.serie) === chaveOpcao(r.serie) && x.periodo === perBusca);
    if (t && r.periodo === "Integral" && perBusca === "Manhã") {
      const tarde = turmas.find((x) => x.escola_id === r.escola_id && x.ano_letivo === r.ano && chaveOpcao(x.serie) === chaveOpcao(r.serie) && x.periodo === "Tarde");
      if (!tarde) avisos.push("Integral sem turma da tarde: entra só na turma da manhã");
      else if (!horaTxt(l.saida)) l.saida = hora(tarde.hora_saida);
    }
    r.turma = t || null; if (!t) avisos.push("Turma não encontrada: entra sem turma (não ocupa vaga)");
    r.entrada = horaTxt(l.entrada) || (t ? hora(t.hora_entrada) : null); r.saida = horaTxt(l.saida) || (t ? hora(t.hora_saida) : null);
    Object.assign(r, {
      sexo: txt(l.sexo), rg: txt(l.rg), pai: txt(l.pai), endereco: txt(l.endereco), bairro: txt(l.bairro), cidade: txt(l.cidade), cep: txt(l.cep), email: txt(l.email),
      rf_rg: txt(l.rf_rg), rf_nasc: dataISO(l.rf_nasc), rf_email: txt(l.rf_email), r2_nome: txt(l.r2_nome), r2_parentesco: txt(l.r2_parentesco), r2_tel: txt(l.r2_tel),
      desc_motivo: txt(l.desc_motivo), material: num(l.material) || null, docs_ok: simNao(l.docs_ok), obs: txt(l.obs),
    });
    if (r.rf_nasc === "invalida") r.rf_nasc = null;
    r.famKey = r.rf_cpf ? "cpf:" + soDig(r.rf_cpf) : "mae:" + normal(r.mae || "") + "|" + soDig(r.rf_tel || "");
    r.famExistente = r.rf_cpf ? respsCpf.find((x) => soDig(x.cpf) === soDig(r.rf_cpf))?.familia_id || null : null;
    return r;
  });
}

/* ---------- gravação ---------- */
async function importarLinha(r, cacheFam) {
  // família (irmãos juntos)
  let familia_id = cacheFam[r.famKey] || r.famExistente;
  if (!familia_id) familia_id = (await q(sb.from("familias").insert({ nome: "Família " + (r.rf_nome || r.nome).split(" ").slice(-1)[0] }).select("id").single())).id;
  cacheFam[r.famKey] = familia_id;
  const resps = await q(sb.from("responsaveis").select("id,nome,cpf").eq("familia_id", familia_id));
  const achar = (nome, cpf) => resps.find((x) => (cpf && soDig(x.cpf) === soDig(cpf)) || normal(x.nome) === normal(nome));
  const end = { endereco: r.endereco, bairro: r.bairro, cidade: r.cidade, cep: r.cep };
  let rf = achar(r.rf_nome, r.rf_cpf);
  if (!rf) rf = await q(sb.from("responsaveis").insert({ familia_id, nome: r.rf_nome, parentesco: r.rf_parentesco, cpf: r.rf_cpf ? fmtCPF(r.rf_cpf) : null, rg: r.rf_rg, nascimento: r.rf_nasc, telefone: r.rf_tel, email: r.rf_email || r.email, ...end }).select("id,nome,cpf").single());
  if (r.r2_nome && !achar(r.r2_nome, r.r2_cpf)) await q(sb.from("responsaveis").insert({ familia_id, nome: r.r2_nome, parentesco: r.r2_parentesco, cpf: r.r2_cpf ? fmtCPF(r.r2_cpf) : null, telefone: r.r2_tel, ...end }));
  // aluno
  const a = await q(sb.from("alunos").insert({ familia_id, escola_id: r.escola_id, nome: r.nome, nascimento: r.nascimento, sexo: r.sexo, cpf: r.cpf ? fmtCPF(r.cpf) : null, rg: r.rg, mae_nome: r.mae, pai_nome: r.pai, email: r.email, telefone: r.rf_tel, obs: r.obs, ...end }).select("id").single());
  await q(sb.from("doc_checklist").insert(Object.keys(CHECK).map((item) => ({ aluno_id: a.id, item, status: item === "historico_transferencia" ? "nao_aplicavel" : r.docs_ok ? "entregue" : "pendente" }))));
  // matrícula
  const mat = await q(sb.from("matriculas").insert({
    aluno_id: a.id, escola_id: r.escola_id, turma_id: r.turma?.id || null, ano_letivo: r.ano, serie: r.turma?.serie || r.serie, periodo: r.periodo,
    hora_entrada: r.entrada, hora_saida: r.saida, tipo: "nova", status: r.contrato_papel ? "concluida" : "em_andamento",
    data_matricula: r.contrato_data || hojeISO(), resp_financeiro_id: rf.id, valor_mensalidade: r.mensalidade, num_parcelas: r.parcelas,
    dia_vencimento: r.dia, primeiro_vencimento: r.venc_ini, valor_primeira_parcela: r.p1_valor, vencimento_primeira: r.p1_venc,
    desconto_tipo: r.desc_pct ? "percentual" : r.desc_val ? "valor" : "nenhum", desconto_valor: r.desc_pct || r.desc_val || 0, desconto_motivo: r.desc_motivo,
    valor_material: r.material, obs: "Importado da planilha em " + dataBR(hojeISO()),
  }).select("*").single());
  await q(sb.rpc("gerar_parcelas", { p_matricula: mat.id, p_regerar: false }));
  if (r.pagas > 0) {
    const ps = await q(sb.from("parcelas").select("id,valor,vencimento").eq("matricula_id", mat.id).order("numero").limit(r.pagas));
    for (const p of ps) await q(sb.from("parcelas").update({ status: "paga", valor_pago: p.valor, data_pagamento: p.vencimento, forma_pagamento: "Importação", obs: "Pago antes da implantação do sistema" }).eq("id", p.id));
  }
  if (r.contrato_papel) await registrarPapel({ mat: { ...mat, aluno_nome: r.nome }, data: r.contrato_data || hojeISO(), signatario_nome: r.rf_nome, signatario_cpf: r.rf_cpf });
  return a.id;
}

rota("importar", async (main) => {
  if (!(ehDirecao() && pode("financeiro"))) { main.innerHTML = vazio("Apenas a direção importa alunos.", "lock"); return; }
  main.innerHTML = pageHead("file-up", "Importar alunos", "Para trazer os alunos que já estudam nas escolas, a partir de uma planilha Excel.") +
    `<div class="two">
      <div class="card"><h3><i data-lucide="download"></i>1. Baixe o modelo</h3><p class="sub">Uma linha por aluno. Irmãos ficam na mesma família automaticamente (mesmo CPF do responsável financeiro, ou mesma mãe e telefone).</p>
        <a class="btn sec" href="modelos/modelo-importacao-alunos.xlsx" download><i data-lucide="sheet"></i>Baixar modelo de planilha</a></div>
      <div class="card"><h3><i data-lucide="upload"></i>2. Envie a planilha preenchida</h3><p class="sub">Nada é gravado antes da conferência. Linhas com erro ficam de fora até serem corrigidas.</p>
        <label class="drop" id="impDrop"><input type="file" id="impArq" accept=".xlsx,.xls,.csv" hidden><i data-lucide="upload-cloud"></i><br>Clique ou arraste a planilha aqui</label></div>
    </div><div id="impBox" style="margin-top:16px"></div>`;
  icons();
  const processar = async (f) => {
    const box = $("#impBox"); box.innerHTML = carregando("Lendo e conferindo a planilha…");
    let linhas;
    try { linhas = await validarLinhas(await lerPlanilha(f)); } catch (e) { console.error(e); box.innerHTML = `<div class="msg err">Não consegui ler a planilha: ${esc(erroAmigavel(e))}</div>`; return; }
    if (!linhas.length) { box.innerHTML = vazio("Nenhum aluno encontrado na planilha.", "sheet"); return; }
    const ok = linhas.filter((r) => !r.erros.length), ruins = linhas.filter((r) => r.erros.length);
    const familias = new Set(ok.map((r) => r.famKey)).size;
    box.innerHTML = `<div class="kpis">
        ${kpiCard({ ic: "users", cor: "blue", valor: linhas.length, rotulo: "Linhas lidas" })}
        ${kpiCard({ ic: "check-circle-2", cor: "green", valor: ok.length, rotulo: "Prontas para importar" })}
        ${kpiCard({ ic: "alert-triangle", cor: "red", valor: ruins.length, rotulo: "Com erro" })}
        ${kpiCard({ ic: "home", cor: "navy", valor: familias, rotulo: "Famílias" })}</div>
      <div class="card"><div class="row"><h3>Conferência</h3><div class="right row">
        ${ruins.length ? `<button class="btn sec" id="impErros"><i data-lucide="sheet"></i>Baixar linhas com erro</button>` : ""}
        <button class="btn" id="impGo" ${ok.length ? "" : "disabled"}><i data-lucide="database"></i>Importar ${ok.length} aluno(s)</button></div></div>
        <div class="scroll" style="margin-top:12px"><table><thead><tr><th>Linha</th><th>Aluno</th><th>Escola / série</th><th>Resp. financeiro</th><th>Mensal.</th><th>Pagas</th><th>Contrato</th><th>Situação</th></tr></thead><tbody>
        ${linhas.map((r) => `<tr class="${r.erros.length ? "alert-row" : ""}"><td>${r._linha}</td><td><b>${esc(r.nome || "—")}</b><div class="small muted">${dataBR(r.nascimento && r.nascimento !== "invalida" ? r.nascimento : "")}</div></td>
          <td>${esc(escolaNome(r.escola_id) || "?")}<div class="small muted">${esc(r.serie || "")} · ${esc(r.periodo || "")} · ${r.ano || ""}</div></td><td>${esc(r.rf_nome || "")}<div class="small muted">${esc(r.rf_cpf || "sem CPF")}</div></td>
          <td class="money">${r.mensalidade ? money(r.mensalidade) : "—"}</td><td>${r.pagas}/${r.parcelas}</td><td>${r.contrato_papel ? '<span class="tag ok">Papel</span>' : "—"}</td>
          <td class="small">${r.erros.map((e) => `<div class="neg">✕ ${esc(e)}</div>`).join("")}${r.avisos.map((e) => `<div style="color:#8a5a00">! ${esc(e)}</div>`).join("")}${!r.erros.length && !r.avisos.length ? '<span class="tag ok">OK</span>' : ""}</td></tr>`).join("")}
        </tbody></table></div></div>`;
    icons();
    if ($("#impErros")) $("#impErros").onclick = () => exportXLSX(ruins.map((r) => ({ Linha: r._linha, Aluno: r.nome || "", Erros: r.erros.join("; "), Avisos: r.avisos.join("; ") })), "erros-importacao");
    $("#impGo").onclick = async () => {
      if (!(await confirmar(`Importar ${ok.length} aluno(s) com matrícula e mensalidades? Linhas com erro ficam de fora.`, { ok: "Importar" }))) return;
      const btn = $("#impGo"); btn.disabled = true; const cache = {}; let feitos = 0; const falhas = [];
      for (const r of ok) {
        btn.innerHTML = `<div class="spin" style="border-top-color:#fff"></div>Importando ${feitos + falhas.length + 1} de ${ok.length}…`;
        try { await importarLinha(r, cache); feitos++; } catch (e) { console.error(e); falhas.push({ Linha: r._linha, Aluno: r.nome, Erro: erroAmigavel(e) }); }
      }
      box.innerHTML = `<div class="msg ${falhas.length ? "warn" : "ok"}"><i data-lucide="${falhas.length ? "alert-circle" : "check-circle-2"}"></i><div><b>${feitos} aluno(s) importado(s).</b>${falhas.length ? ` ${falhas.length} falharam.` : ""} Os contratos em papel ficaram registrados; anexe as digitalizações pela ficha de cada aluno quando puder.</div></div>
        ${falhas.length ? `<button class="btn sec" id="impFalhas"><i data-lucide="sheet"></i>Baixar lista de falhas</button>` : ""} <a class="btn" href="#/alunos">Ver alunos</a>`;
      icons(); if ($("#impFalhas")) $("#impFalhas").onclick = () => exportXLSX(falhas, "falhas-importacao");
    };
  };
  const inp = $("#impArq"), drop = $("#impDrop");
  inp.onchange = () => inp.files[0] && processar(inp.files[0]);
  drop.addEventListener("dragover", (e) => e.preventDefault());
  drop.addEventListener("drop", (e) => { e.preventDefault(); e.dataTransfer.files[0] && processar(e.dataTransfer.files[0]); });
});
