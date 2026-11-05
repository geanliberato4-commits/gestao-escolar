/* ==========================================================================
   Núcleo: conexão, estado, utilitários, interface (modal, toast), rotas,
   modelos de documentos (requerimento, contrato, declarações), PDF e Excel.
   ========================================================================== */
const sb = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
const S = { user: null, perfil: null, escolas: [], escola: "", modulos: new Set(), anoAtual: new Date().getFullYear() };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ------------------------------------------------------------------ texto e formatos */
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (v) => BRL.format(Number(v || 0));
const num = (v) => {
  if (v === "" || v == null) return 0; if (typeof v === "number") return v;
  let s = String(v).replace(/[^\d,.-]/g, "");
  s = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : (/^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s);
  const n = Number(s); return isNaN(n) ? 0 : Math.round(n * 100) / 100;
};
const numIn = (v) => (v == null || v === "" ? "" : Number(v).toFixed(2).replace(".", ","));
const dataBR = (d) => { if (!d) return ""; const [y, m, dd] = String(d).slice(0, 10).split("-"); return `${dd}/${m}/${y}`; };
const dataHora = (t) => t ? new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dataExtenso = (d = hojeISO()) => { const [y, m, dd] = d.split("-"); return `${Number(dd)} de ${MESES[Number(m) - 1]} de ${y}`; };
const hora = (t) => (t ? String(t).slice(0, 5) : "");
const idade = (d) => { if (!d) return ""; const n = new Date(d + "T12:00"); const h = new Date(); let a = h.getFullYear() - n.getFullYear(); if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) a--; return a; };
const soDig = (s) => String(s || "").replace(/\D/g, "");
const fmtCPF = (s) => { const d = soDig(s); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : (s || ""); };
const cpfValido = (s) => {
  const c = soDig(s); if (!c) return true; if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let t = 0; for (let i = 0; i < 9; i++) t += c[i] * (10 - i); let d1 = (t * 10) % 11 % 10;
  t = 0; for (let i = 0; i < 10; i++) t += c[i] * (11 - i); let d2 = (t * 10) % 11 % 10;
  return d1 == c[9] && d2 == c[10];
};
const iniciais = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const normal = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const uid = () => crypto.randomUUID();

/* máscaras: <input data-mask="cpf|tel|cep|money"> */
document.addEventListener("input", (e) => {
  const el = e.target; const m = el.dataset?.mask; if (!m) return;
  let d = soDig(el.value);
  if (m === "cpf") { d = d.slice(0, 11); el.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); }
  if (m === "tel") { d = d.slice(0, 11); el.value = d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3") : d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/[-\s(]+$/, ""); if (d.length < 3) el.value = d; }
  if (m === "cep") { d = d.slice(0, 8); el.value = d.replace(/(\d{5})(\d)/, "$1-$2"); }
});

/* ------------------------------------------------------------------ constantes */
const STATUS_MAT = {
  em_andamento: ["Em andamento", "blue"], aguardando_documentos: ["Aguardando documentos", "warn"],
  aguardando_assinatura: ["Aguardando assinatura", "warn"], concluida: ["Concluída", "ok"],
  rematricula_pendente: ["Rematrícula pendente", "warn"], cancelada: ["Cancelada", "off"], transferida: ["Transferida", "off"],
};
const SIT_PARC = { pago: ["Pago", "ok"], pendente: ["Pendente", "blue"], atrasado: ["Atrasado", "err"], parcial: ["Parcial", "warn"], cancelada: ["Cancelada", "off"] };
const STATUS_CON = { rascunho: ["Rascunho", "off"], aguardando: ["Aguardando assinatura", "warn"], assinado: ["Assinado", "ok"], cancelado: ["Cancelado", "err"] };
const STATUS_ESP = { aguardando: ["Aguardando", "blue"], vaga_disponivel: ["Vaga disponível", "ok"], contatado: ["Contatado", "warn"], em_matricula: ["Em matrícula", "warn"], matriculado: ["Matriculado", "ok"], desistencia: ["Desistência", "off"] };
const CHECK = { certidao: "Certidão de nascimento", rg_cpf_aluno: "RG/CPF do aluno", docs_responsavel: "Documentos dos responsáveis", comprovante_residencia: "Comprovante de residência", vacinacao: "Carteira de vacinação", historico_transferencia: "Histórico / transferência" };
const CATEG = { ...CHECK, requerimento: "Requerimento", contrato: "Contrato", contrato_assinado: "Contrato assinado", declaracao: "Declaração", outro: "Outro" };
const PAPEL = { direcao: "Direção", secretaria: "Secretaria", financeiro: "Financeiro" };
const DECL = { matricula: "Matrícula", frequencia: "Frequência", quitacao: "Quitação de mensalidades", transferencia: "Transferência", escolaridade: "Escolaridade", personalizada: "Personalizada" };
const PERIODOS = ["Manhã", "Tarde", "Integral", "Noite"];
const PARENTESCOS = ["Mãe", "Pai", "Avó", "Avô", "Tia", "Tio", "Responsável legal", "Outro"];
const tag = (map, k) => { const v = map[k] || [k || "—", "off"]; return `<span class="tag ${v[1]}">${esc(v[0])}</span>`; };

/* ------------------------------------------------------------------ permissões */
const ehDirecao = () => S.perfil?.papel === "direcao";
const pode = (m) => ehDirecao() || S.modulos.has(m);
const escolaNome = (id) => S.escolas.find((e) => e.id === id)?.nome || "";
const escolasVisiveis = () => S.escolas;
const filtraEscola = (q, col = "escola_id") => (S.escola ? q.eq(col, S.escola) : q);

/* ------------------------------------------------------------------ banco */
function erroAmigavel(e) {
  const m = e?.message || String(e);
  if (e?.code === "23505" || /duplicate key/.test(m)) {
    if (/matricula_unica_ano/.test(m)) return "Este aluno já tem matrícula ativa neste ano letivo.";
    return "Registro duplicado.";
  }
  if (e?.code === "42501" || /row-level security|permission denied/.test(m)) return "Seu perfil não tem permissão para esta ação.";
  if (e?.code === "23503") return "Este registro está ligado a outros e não pode ser removido.";
  if (/Failed to fetch|NetworkError/.test(m)) return "Sem conexão com o servidor. Verifique a internet.";
  return m;
}
async function q(p) { const { data, error, count } = await p; if (error) throw error; return count != null && data == null ? count : data; }
async function fetchAll(build, page = 1000) {
  let out = [], from = 0;
  for (;;) { const { data, error } = await build().range(from, from + page - 1); if (error) throw error; out = out.concat(data); if (data.length < page) break; from += page; }
  return out;
}
async function tenta(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast(erroAmigavel(e), true); return undefined; }
}

/* ------------------------------------------------------------------ interface */
function icons() { try { lucide.createIcons(); } catch (_) {} }
function toast(msg, err) {
  const t = document.createElement("div"); t.className = "toast" + (err ? " err" : "");
  t.innerHTML = `<i data-lucide="${err ? "alert-circle" : "check-circle-2"}"></i><span>${esc(msg)}</span>`;
  document.body.appendChild(t); icons(); setTimeout(() => t.remove(), err ? 6000 : 3200);
}
function modal({ title = "", body = "", size = "", acts = [], onOpen } = {}) {
  const root = document.createElement("div"); root.className = "modal";
  root.innerHTML = `<div class="card ${size}" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><div class="mbody">${body}</div><div class="acts"></div></div>`;
  const close = () => { root.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  root.addEventListener("mousedown", (e) => { if (e.target === root) close(); });
  const box = $(".acts", root);
  acts.forEach((a) => {
    const b = document.createElement("button"); b.className = "btn " + (a.cls || ""); b.innerHTML = (a.icon ? `<i data-lucide="${a.icon}"></i>` : "") + esc(a.label);
    b.onclick = async () => { if (!a.onClick) return close(); b.disabled = true; try { const r = await a.onClick(root, close); if (r !== false && a.close !== false) close(); } finally { b.disabled = false; } };
    box.appendChild(b);
  });
  if (!acts.length) box.remove();
  $("#modalRoot").appendChild(root); icons(); onOpen && onOpen(root, close);
  setTimeout(() => $("input,select,textarea", root)?.focus(), 30);
  return { el: root, close };
}
function confirmar(msg, { titulo = "Confirmar", ok = "Confirmar", perigo = false, pedirMotivo = false } = {}) {
  return new Promise((res) => {
    let feito = false;
    const m = modal({
      title: titulo,
      body: `<p>${msg}</p>${pedirMotivo ? `<label>Motivo</label><textarea id="cfMot" placeholder="Descreva o motivo"></textarea>` : ""}`,
      acts: [
        { label: "Voltar", cls: "sec", onClick: () => { feito = true; res(pedirMotivo ? null : false); } },
        { label: ok, cls: perigo ? "danger" : "", onClick: (r) => {
          if (pedirMotivo) { const v = $("#cfMot", r).value.trim(); if (!v) { toast("Informe o motivo.", true); return false; } feito = true; res(v); }
          else { feito = true; res(true); } } },
      ],
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!feito) res(pedirMotivo ? null : false); } });
    obs.observe($("#modalRoot"), { childList: true });
  });
}
const carregando = (txt = "Carregando…") => `<div class="loading"><div class="spin"></div>${esc(txt)}</div>`;
const vazio = (txt, ic = "inbox") => `<div class="empty"><i data-lucide="${ic}"></i>${esc(txt)}</div>`;
const pageHead = (ic, titulo, sub, extra = "") => `<div class="page-head"><div class="ph-ic"><i data-lucide="${ic}"></i></div><div class="ph-t"><h2>${esc(titulo)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div>${extra}</div>`;
const opts = (arr, sel, vazioTxt) => (vazioTxt != null ? `<option value="">${esc(vazioTxt)}</option>` : "") +
  arr.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(sel ?? "") ? " selected" : ""}>${esc(t)}</option>`; }).join("");
const escolaOpts = (sel, todas) => opts(S.escolas.map((e) => [e.id, e.nome]), sel, todas ? "Todas as escolas" : undefined);
const anosOpts = (sel) => { const a = S.anoAtual; return opts([a - 2, a - 1, a, a + 1, a + 2].map(String), sel); };
/* lê campos [name] de um container -> objeto */
function lerForm(root) {
  const o = {};
  $$("[name]", root).forEach((el) => {
    if (el.type === "radio") { if (el.checked) o[el.name] = el.value; return; }
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (typeof v === "string") v = v.trim();
    if (el.dataset.mask === "money") v = num(v);
    else if (el.type === "number") v = v === "" ? null : Number(v);
    else if (v === "" && el.type !== "checkbox") v = null;
    o[el.name] = v;
  });
  return o;
}
function exigir(root, nomes) {
  for (const n of nomes) { const el = $(`[name="${n}"]`, root); if (el && !String(el.value || "").trim()) { el.focus(); toast("Preencha os campos obrigatórios (*).", true); return false; } }
  return true;
}

/* ------------------------------------------------------------------ rotas */
const ROTAS = {};
function rota(nome, fn) { ROTAS[nome] = fn; }
function ir(h) { if (location.hash === h) render(); else location.hash = h; }
function parseHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const [nome, ...resto] = path.split("/");
  return { nome: nome || "painel", arg: resto.join("/"), params: Object.fromEntries(new URLSearchParams(qs || "")) };
}
async function render() {
  if (!S.perfil) return;
  const { nome, arg, params } = parseHash();
  $$(".nav button").forEach((b) => b.classList.toggle("on", b.dataset.r === nome || (b.dataset.alias || "").split(",").includes(nome)));
  $(".shell")?.classList.remove("open");
  const main = $("#main"); main.innerHTML = carregando();
  const fn = ROTAS[nome] || ROTAS.painel;
  try { await fn(main, arg, params); } catch (e) { console.error(e); main.innerHTML = `<div class="msg err"><i data-lucide="alert-triangle"></i>${esc(erroAmigavel(e))}</div>`; }
  icons(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", render);

/* ------------------------------------------------------------------ Excel / PDF / impressão */
function exportXLSX(linhas, nome) {
  if (!linhas.length) return toast("Nada para exportar.", true);
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws["!cols"] = Object.keys(linhas[0]).map((k) => ({ wch: Math.min(40, Math.max(10, k.length + 2, ...linhas.slice(0, 200).map((l) => String(l[k] ?? "").length))) }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, `${nome}-${hojeISO()}.xlsx`);
}
const CSS_DOC = () => new URL("css/style.css", location.href).href;
function folha(escola, corpo, rodape = "") {
  return `<div class="folha"><div class="cab"><div><b>${esc(escola?.nome || "")}</b><br><small>${esc([escola?.endereco, escola?.telefone].filter(Boolean).join(" · "))}</small></div><small>${escola?.cnpj ? "CNPJ " + esc(escola.cnpj) : ""}</small></div>${corpo}${rodape ? `<div class="rodape">${rodape}</div>` : ""}</div>`;
}
function imprimir(html, titulo = "Documento") {
  const f = document.createElement("iframe"); f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><link rel="stylesheet" href="${CSS_DOC()}"><style>body{background:#fff}.folha{box-shadow:none;padding:0;max-width:none}@page{margin:18mm 16mm}</style></head><body>${html}</body></html>`); d.close();
  f.onload = () => { setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 250); };
}
async function pdfBlob(html) {
  const box = document.createElement("div"); box.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff";
  box.innerHTML = html; const el = box.firstElementChild; if (el) { el.style.boxShadow = "none"; el.style.maxWidth = "none"; }
  document.body.appendChild(box);
  try {
    return await html2pdf().set({ margin: [12, 10, 14, 10], image: { type: "jpeg", quality: 0.96 }, html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".cert", ".assinaturas"] } }).from(box).outputPdf("blob");
  } finally { box.remove(); }
}
async function baixarPDF(html, nome) {
  const b = await pdfBlob(html); const a = document.createElement("a"); a.href = URL.createObjectURL(b);
  a.download = nome.replace(/[\\/:*?"<>|]+/g, "-") + ".pdf"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/* guarda um arquivo no armazenamento e registra na ficha */
async function guardarArquivo({ aluno_id, escola_id, categoria, titulo, ano, blob, nomeArq, mime }) {
  const ext = (nomeArq?.split(".").pop() || "pdf").toLowerCase();
  const path = `${escola_id}/${aluno_id}/${uid()}.${ext}`;
  const { error } = await sb.storage.from("documentos").upload(path, blob, { contentType: mime || blob.type || "application/pdf", upsert: false });
  if (error) throw error;
  return await q(sb.from("documentos").insert({ aluno_id, escola_id, categoria, titulo, ano: ano || S.anoAtual, path, mime: mime || blob.type || "application/pdf", tamanho: blob.size }).select().single());
}
async function arquivarPDF({ aluno_id, escola_id, categoria, titulo, ano, html }) {
  const blob = await pdfBlob(html);
  return guardarArquivo({ aluno_id, escola_id, categoria, titulo, ano, blob, nomeArq: "doc.pdf", mime: "application/pdf" });
}
async function abrirArquivo(doc, baixar) {
  const { data, error } = await sb.storage.from("documentos").createSignedUrl(doc.path, 120, baixar ? { download: doc.titulo + "." + doc.path.split(".").pop() } : undefined);
  if (error) return toast(erroAmigavel(error), true);
  window.open(data.signedUrl, "_blank", "noopener");
}

/* ------------------------------------------------------------------ modelos de documento */
const PLACEHOLDERS = [
  "escola.nome", "escola.razao_social", "escola.cnpj", "escola.endereco", "escola.cidade", "escola.telefone", "escola.email",
  "aluno.nome", "aluno.nascimento", "aluno.idade", "aluno.sexo", "aluno.cpf", "aluno.rg", "aluno.naturalidade", "aluno.nacionalidade", "aluno.endereco_completo", "aluno.mae", "aluno.pai", "aluno.filiacao",
  "matricula.ano_letivo", "matricula.serie", "matricula.turma", "matricula.periodo", "matricula.horario", "matricula.tipo", "matricula.data", "matricula.status",
  "responsavel.nome", "responsavel.parentesco", "responsavel.cpf", "responsavel.rg", "responsavel.nascimento", "responsavel.endereco", "responsavel.telefone", "responsavel.email",
  "responsaveis.lista", "responsaveis.tabela",
  "financeiro.mensalidade", "financeiro.desconto", "financeiro.valor_parcela", "financeiro.parcelas", "financeiro.anuidade", "financeiro.dia_vencimento", "financeiro.primeiro_vencimento", "financeiro.condicoes", "financeiro.tabela_parcelas", "financeiro.total_pago",
  "data.hoje", "data.extenso", "usuario.nome",
  "campo.frequencia", "campo.periodo_referencia", "campo.serie_destino", "campo.texto",
];
const RAW_KEYS = new Set(["responsaveis.tabela", "financeiro.tabela_parcelas", "escola.cnpj_texto"]);
function aplicarModelo(html, ctx) {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = ctx[k];
    if (v == null || v === "") return RAW_KEYS.has(k) ? "" : `<span style="background:#fff1b8">[${esc(k)}]</span>`;
    return RAW_KEYS.has(k) ? v : esc(v);
  });
}
/* reúne todos os dados de uma matrícula para preencher documentos */
async function contextoMatricula(matriculaId, campos = {}) {
  const m = await q(sb.from("matriculas").select("*").eq("id", matriculaId).single());
  const [a, e, t, resps, parc] = await Promise.all([
    q(sb.from("alunos").select("*").eq("id", m.aluno_id).single()),
    q(sb.from("escolas").select("*").eq("id", m.escola_id).single()),
    m.turma_id ? q(sb.from("turmas").select("*").eq("id", m.turma_id).single()) : null,
    q(sb.from("responsaveis").select("*").eq("familia_id", (await q(sb.from("alunos").select("familia_id").eq("id", m.aluno_id).single())).familia_id).order("created_at")),
    sb.from("parcelas").select("*").eq("matricula_id", matriculaId).neq("status", "cancelada").order("numero").then((r) => r.data || []),
  ]);
  const rf = resps.find((r) => r.id === m.resp_financeiro_id) || {};
  const descTotal = parc.length ? Number(parc[0].desconto) : (m.desconto_tipo === "percentual" ? m.valor_mensalidade * m.desconto_valor / 100 : m.desconto_tipo === "valor" ? m.desconto_valor : 0);
  const valorParc = parc.length ? Number(parc[0].valor) : m.valor_mensalidade - descTotal;
  const anuidade = parc.length ? parc.reduce((s, p) => s + Number(p.valor), 0) : valorParc * m.num_parcelas;
  const pago = parc.reduce((s, p) => s + Number(p.valor_pago || 0), 0);
  const filiacao = [a.mae_nome, a.pai_nome].filter(Boolean).join(" e ");
  const ctx = {
    "escola.nome": e.nome, "escola.razao_social": e.razao_social || e.nome, "escola.cnpj": e.cnpj, "escola.cnpj_texto": e.cnpj ? `, CNPJ ${esc(e.cnpj)}` : "",
    "escola.endereco": e.endereco, "escola.cidade": e.cidade, "escola.telefone": e.telefone, "escola.email": e.email,
    "aluno.nome": a.nome, "aluno.nascimento": dataBR(a.nascimento), "aluno.idade": a.nascimento ? idade(a.nascimento) + " anos" : "", "aluno.sexo": a.sexo, "aluno.cpf": fmtCPF(a.cpf) || "não informado", "aluno.rg": a.rg || "não informado",
    "aluno.naturalidade": a.naturalidade, "aluno.nacionalidade": a.nacionalidade,
    "aluno.endereco_completo": [a.endereco, a.bairro, a.cidade && `${a.cidade}${a.uf ? "/" + a.uf : ""}`, a.cep && "CEP " + a.cep].filter(Boolean).join(", "),
    "aluno.mae": a.mae_nome, "aluno.pai": a.pai_nome || "não declarado", "aluno.filiacao": filiacao,
    "matricula.ano_letivo": m.ano_letivo, "matricula.serie": m.serie, "matricula.turma": t?.nome || "a definir", "matricula.periodo": m.periodo,
    "matricula.horario": m.hora_entrada ? `${hora(m.hora_entrada)} às ${hora(m.hora_saida)}` : "", "matricula.tipo": m.tipo === "rematricula" ? "Rematrícula" : "Matrícula nova",
    "matricula.data": dataBR(m.data_matricula), "matricula.status": STATUS_MAT[m.status]?.[0],
    "responsavel.nome": rf.nome, "responsavel.parentesco": rf.parentesco, "responsavel.cpf": fmtCPF(rf.cpf), "responsavel.rg": rf.rg || "não informado",
    "responsavel.nascimento": dataBR(rf.nascimento), "responsavel.endereco": rf.endereco, "responsavel.telefone": rf.telefone, "responsavel.email": rf.email,
    "responsaveis.lista": resps.map((r) => `${r.nome} (${r.parentesco || "responsável"}${r.telefone ? ", " + r.telefone : ""})`).join("; "),
    "responsaveis.tabela": `<table><tr><th>Nome</th><th>Parentesco</th><th>CPF</th><th>Telefone</th><th>E-mail</th></tr>${resps.map((r) => `<tr><td>${esc(r.nome)}</td><td>${esc(r.parentesco)}</td><td>${esc(fmtCPF(r.cpf))}</td><td>${esc(r.telefone)}</td><td>${esc(r.email)}</td></tr>`).join("")}</table>`,
    "financeiro.mensalidade": money(m.valor_mensalidade), "financeiro.desconto": money(descTotal), "financeiro.valor_parcela": money(valorParc),
    "financeiro.parcelas": m.num_parcelas, "financeiro.anuidade": money(anuidade), "financeiro.dia_vencimento": m.dia_vencimento || (m.primeiro_vencimento ? Number(m.primeiro_vencimento.slice(8)) : ""),
    "financeiro.primeiro_vencimento": dataBR(m.primeiro_vencimento || parc[0]?.vencimento),
    "financeiro.condicoes": [m.desconto_motivo && "Desconto: " + m.desconto_motivo, m.condicoes_especiais].filter(Boolean).join(". ") || " ",
    "financeiro.tabela_parcelas": parc.length ? `<table><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr>${parc.map((p) => `<tr><td>${p.numero}/${parc.length}</td><td>${dataBR(p.vencimento)}</td><td>${money(p.valor)}</td></tr>`).join("")}</table>` : "",
    "financeiro.total_pago": money(pago),
    "data.hoje": dataBR(hojeISO()), "data.extenso": dataExtenso(), "usuario.nome": S.perfil.nome,
  };
  for (const [k, v] of Object.entries(campos)) ctx["campo." + k] = v;
  return { ctx, m, a, e, t, rf, resps, parc };
}
async function modeloDe(escola_id, tipo, subtipo) {
  let r = sb.from("modelos").select("*").eq("escola_id", escola_id).eq("tipo", tipo).eq("ativo", true);
  if (subtipo) r = r.eq("subtipo", subtipo);
  const l = await q(r.order("updated_at", { ascending: false }).limit(1));
  return l[0];
}
/* janela padrão de documento: prévia + imprimir + PDF (+ ações extras) */
function verDocumento({ titulo, html, extras = [], editavel = false, onEditar }) {
  return modal({
    title: titulo, size: "xl",
    body: `<div class="doc-prev" id="docPrev">${html}</div>`,
    acts: [
      ...(editavel ? [{ label: "Ajustar texto", cls: "sec", icon: "pencil", close: false, onClick: async () => onEditar && onEditar() }] : []),
      { label: "Imprimir", cls: "sec", icon: "printer", close: false, onClick: () => { imprimir(html, titulo); return false; } },
      { label: "Baixar PDF", cls: "sec", icon: "download", close: false, onClick: async () => { await baixarPDF(html, titulo); return false; } },
      ...extras,
      { label: "Fechar", cls: "sec" },
    ],
  });
}
/* editor simples de HTML de um documento (ajustes autorizados) */
function editarHTML(titulo, html) {
  return new Promise((res) => {
    let feito = false;
    const m = modal({
      title: titulo, size: "xl",
      body: `<p class="hint">Ajuste o texto antes de emitir. O documento final fica registrado com data e emissor.</p>
        <div class="row" style="gap:6px;margin:8px 0"><button class="btn sec sm" data-c="bold"><b>N</b></button><button class="btn sec sm" data-c="italic"><i>I</i></button><button class="btn sec sm" data-c="underline"><u>S</u></button></div>
        <div class="doc-prev"><div class="folha" id="edArea" contenteditable="true">${html}</div></div>`,
      onOpen: (r) => $$("[data-c]", r).forEach((b) => (b.onclick = () => document.execCommand(b.dataset.c))),
      acts: [{ label: "Cancelar", cls: "sec", onClick: () => { feito = true; res(null); } },
             { label: "Usar este texto", onClick: (r) => { feito = true; res($("#edArea", r).innerHTML); } }],
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!feito) res(null); } });
    obs.observe($("#modalRoot"), { childList: true });
  });
}
