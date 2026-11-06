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

/* CEP: ao completar 8 dígitos busca rua, bairro e cidade (ViaCEP, com BrasilAPI de reserva) */
async function buscarCEP(cep) {
  try { const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const j = await r.json(); if (!j.erro) return { rua: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf }; } catch (_) {}
  try { const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`); if (r.ok) { const j = await r.json(); return { rua: j.street, bairro: j.neighborhood, cidade: j.city, uf: j.state }; } } catch (_) {}
  return null;
}
document.addEventListener("input", async (e) => {
  const el = e.target; if (el.dataset?.mask !== "cep") return;
  const cep = soDig(el.value); if (cep.length !== 8 || el.dataset.ultimo === cep) return;
  el.dataset.ultimo = cep;
  const box = el.closest(".grid") || el.closest(".card") || document;
  const campo = (n) => $(`[name="${n}"]`, box);
  el.style.backgroundImage = "linear-gradient(90deg,#eef1f8,#fff)";
  const d = await buscarCEP(cep);
  el.style.backgroundImage = "";
  if (soDig(el.value) !== cep) return;
  if (!d) { toast("CEP não encontrado. Preencha o endereço manualmente.", true); return; }
  const temUF = !!campo("uf");
  const end = campo("endereco");
  if (end && d.rua && (!end.value.trim() || end.dataset.auto === "1")) { end.value = d.rua + ", "; end.dataset.auto = "1"; }
  if (campo("bairro") && d.bairro) campo("bairro").value = d.bairro;
  if (campo("cidade") && d.cidade) campo("cidade").value = temUF ? d.cidade : `${d.cidade}/${d.uf}`;
  if (temUF && d.uf) campo("uf").value = d.uf;
  if (end) { end.focus(); end.setSelectionRange(end.value.length, end.value.length); }
  toast("Endereço preenchido pelo CEP. Complete o número.");
});
document.addEventListener("input", (e) => { if (e.target.name === "endereco" && e.isTrusted) e.target.dataset.auto = ""; }, true);

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
/* nível do usuário em cada área: "editar" | "ver" | "nenhum" (direção = editar em tudo) */
const nivel = (m) => (ehDirecao() ? "editar" : S.perfil?.permissoes?.[m] || (S.modulos.has(m) ? "editar" : "ver"));
const pode = (m) => nivel(m) === "editar";
const veMod = (m) => nivel(m) !== "nenhum";
/* área exigida para abrir cada tela (visualizar) */
const ROTA_MODULO = { alunos: "cadastro", aluno: "cadastro", matricula: "matricula", rematricula: "matricula", matriculas: "matricula", espera: "espera",
  contratos: "contratos", documentos: "documentos", declaracoes: "declaracoes", financeiro: "financeiro", relatorios: "relatorios", turmas: "turmas", modelos: "modelos" };
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
/* indicador (card de número) padronizado: kpiCard({ic, cor, valor, rotulo, detalhe, href, dinheiro}) */
function kpiCard({ ic, cor = "blue", valor, rotulo, detalhe = "", href = "", dinheiro = false }) {
  const tag_ = href ? "a" : "div";
  return `<${tag_} class="card kpi k-${cor}"${href ? ` href="${esc(href)}"` : ""}>
    <div class="ic ${cor}"><i data-lucide="${ic}"></i></div>
    <div class="kv-num${dinheiro ? " money" : ""}" title="${esc(valor)}">${esc(valor)}</div>
    <div class="kv-rot">${esc(rotulo)}</div>
    ${detalhe ? `<div class="kv-det">${esc(detalhe)}</div>` : ""}
  </${tag_}>`;
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
  if (ROTA_MODULO[nome] && !veMod(ROTA_MODULO[nome])) { main.innerHTML = vazio("Seu usuário não tem acesso a esta área. Fale com a administração.", "lock"); icons(); return; }
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
const temaDe = (e) => (/mef/i.test(e?.logo || e?.nome || "") ? "mef" : "estacao");
const urlAbs = (p) => (p ? new URL(p, location.href.split("#")[0]).href : "");
function folha(escola, corpo, rodape = "") {
  const logos = escola?.logos || (escola?.logo ? [escola] : []);
  const logo = logos.map((x) => `<img class="cab-logo" src="${esc(urlAbs(x.logo))}" alt="${esc(x.nome)}">`).join("");
  return `<div class="folha" style="--doc-cor:${esc(escola?.cor || "#222")}"><div class="cab">${logo}<div class="cab-txt"><b>${esc(escola?.razao_social || escola?.nome || "")}</b>
    <small>${esc([escola?.endereco, escola?.cidade].filter(Boolean).join(" · "))}</small>
    <small>${esc([escola?.telefone, escola?.email, escola?.cnpj && "CNPJ " + escola.cnpj].filter(Boolean).join(" · "))}</small></div></div>${corpo}${rodape ? `<div class="rodape">${rodape}</div>` : ""}</div>`;
}
const DOC_PAGINA = (html, titulo, auto) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
<link rel="stylesheet" href="${CSS_DOC()}"><style>body{background:#fff;margin:0;padding:16px}.folha{box-shadow:none;max-width:800px;margin:0 auto}@media print{body{padding:0}.folha{padding:0;max-width:none}.folha p{orphans:3;widows:3}.folha tr,.folha .cert,.folha .assinaturas{break-inside:avoid}.folha h3{break-after:avoid}}@page{margin:16mm 14mm}</style></head>
<body>${html}${auto ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},300);});<\/script>` : ""}</body></html>`;
/* imprimir / salvar como PDF pelo próprio navegador: abre o documento numa aba e chama a impressão
   (funciona também no celular, onde a impressão de quadros escondidos falha) */
function imprimir(html, titulo = "Documento") {
  const w = window.open("", "_blank");
  if (w) { w.document.open(); w.document.write(DOC_PAGINA(html, titulo, true)); w.document.close(); return; }
  const f = document.createElement("iframe"); f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  f.onload = () => { setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => f.remove(), 3000); } }, 400); };
  f.srcdoc = DOC_PAGINA(html, titulo, false);
}
/* gera o PDF. O elemento entregue ao gerador NÃO pode estar posicionado fora da tela (isso deixava o PDF em branco);
   a escala é limitada para não estourar o tamanho máximo de imagem do celular (iPhone).
   O gerador "fatia" uma imagem em páginas A4; para nenhuma linha ser cortada ao meio na virada da página,
   paginarSemCorte() mede cada linha de texto e empurra para a página seguinte a que ficaria dividida. */
const PDF_MARGEM = [12, 10, 14, 10]; // mm: topo, esquerda, base, direita
const PDF_LARG = 718;                // px = (210 - 10 - 10) mm, como o gerador calcula
const PDF_PAG = PDF_LARG * (297 - PDF_MARGEM[0] - PDF_MARGEM[2]) / (210 - PDF_MARGEM[1] - PDF_MARGEM[3]); // altura útil em px

function paginarSemCorte(el) {
  const INTEIROS = "tr,img,h1,h2,h3,h4,.assinaturas,.cert,.cab,.rodape,hr,li";
  const base = () => el.getBoundingClientRect().top;
  // unidades que não podem ser cortadas: cada linha de texto e os blocos inteiros acima
  const unidades = () => {
    const t0 = base(), us = [];
    el.querySelectorAll(INTEIROS).forEach((x) => {
      if (x.parentElement.closest(INTEIROS)) return;
      const r = x.getBoundingClientRect(); if (r.height) us.push({ top: r.top - t0, bottom: r.bottom - t0, el: x });
    });
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rg = document.createRange();
    for (let n; (n = tw.nextNode());) {
      if (!n.data.trim() || n.parentElement.closest(INTEIROS)) continue;
      let linhaTop = null, re = /\S+/g, m;
      while ((m = re.exec(n.data))) {
        rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        const r = rg.getClientRects()[0]; if (!r) continue;
        if (linhaTop === null || r.top - t0 > linhaTop + 2) { linhaTop = r.top - t0; us.push({ top: linhaTop, bottom: r.bottom - t0, node: n, off: m.index }); }
        else { const u = us[us.length - 1]; u.bottom = Math.max(u.bottom, r.bottom - t0); }
      }
    }
    return us.sort((a, b) => a.top - b.top);
  };
  for (let fim = PDF_PAG, guarda = 0; fim < el.scrollHeight && guarda < 60; guarda++) {
    const u = unidades().find((x) => x.top < fim - 1 && x.bottom > fim - 2 && x.bottom - x.top < PDF_PAG * 0.9);
    if (u) {
      const h = Math.ceil(fim - u.top) + 2;
      if (u.node) {
        // linha no meio de um parágrafo: quebra o texto naquele ponto e insere um espaço até a próxima página
        const resto = u.off > 0 ? u.node.splitText(u.off) : u.node;
        const sp = document.createElement("span"); sp.className = "pg-salto"; sp.style.cssText = `display:block;height:${h}px`;
        resto.parentNode.insertBefore(sp, resto);
      } else if (u.el.tagName === "TR") {
        const tr = document.createElement("tr"); tr.className = "pg-salto";
        tr.innerHTML = `<td colspan="99" style="height:${h}px;padding:0;border:0;border-bottom:1px solid #999;background:#fff"></td>`;
        u.el.parentNode.insertBefore(tr, u.el);
      } else {
        const sp = document.createElement("div"); sp.className = "pg-salto"; sp.style.height = h + "px";
        u.el.parentNode.insertBefore(sp, u.el);
      }
    }
    fim += PDF_PAG;
  }
}

async function pdfBlob(html) {
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;left:0;top:0;width:${PDF_LARG}px;height:0;overflow:hidden;opacity:0;pointer-events:none`;
  box.innerHTML = html; document.body.appendChild(box);
  const el = box.firstElementChild || box;
  el.style.boxShadow = "none"; el.style.maxWidth = "none"; el.style.margin = "0"; el.style.padding = "0"; el.style.width = PDF_LARG + "px"; el.classList.add("pdf");
  try {
    await Promise.all([...el.querySelectorAll("img")].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    if (document.fonts?.ready) await document.fonts.ready;
    try { paginarSemCorte(el); } catch (e) { console.warn("paginação", e); }
    const alt = Math.max(el.scrollHeight, 1123);
    const escala = Math.max(1, Math.min(2, Math.sqrt(15e6 / (PDF_LARG * alt))));
    return await html2pdf().set({
      margin: PDF_MARGEM, image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: escala, useCORS: true, backgroundColor: "#ffffff", scrollX: 0, scrollY: 0 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["legacy"] }, // as quebras já foram calculadas acima
    }).from(el).outputPdf("blob");
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
  "aluno.nome", "aluno.nascimento", "aluno.idade", "aluno.sexo", "aluno.cpf", "aluno.rg", "aluno.naturalidade", "aluno.nacionalidade",
  "aluno.endereco", "aluno.bairro", "aluno.cidade", "aluno.cep", "aluno.endereco_completo", "aluno.email", "aluno.telefones", "aluno.mae", "aluno.pai", "aluno.filiacao",
  "matricula.ano_letivo", "matricula.curso", "matricula.serie", "matricula.turma", "matricula.periodo", "matricula.entrada", "matricula.saida", "matricula.horario", "matricula.tipo", "matricula.data", "matricula.status", "matricula.obs",
  "responsavel.nome", "responsavel.parentesco", "responsavel.cpf", "responsavel.rg", "responsavel.nascimento", "responsavel.endereco", "responsavel.bairro", "responsavel.cidade", "responsavel.cep", "responsavel.telefone", "responsavel.telefones", "responsavel.email",
  "responsaveis.lista", "responsaveis.tabela",
  "financeiro.valor_curso", "financeiro.anuidade", "financeiro.mensalidade", "financeiro.desconto", "financeiro.valor_parcela", "financeiro.primeira_parcela", "financeiro.primeira_parcela_bruta", "financeiro.primeira_vencimento",
  "financeiro.parcelas", "financeiro.parcelas_extenso", "financeiro.dia_vencimento", "financeiro.dia_extenso", "financeiro.inicio_demais", "financeiro.meses", "financeiro.primeiro_vencimento",
  "financeiro.condicoes", "financeiro.condicao_primeira", "financeiro.cond_valor_curso", "financeiro.cond_primeira", "financeiro.cond_demais", "financeiro.material", "financeiro.material_forma", "financeiro.tabela_parcelas", "financeiro.total_pago",
  "data.hoje", "data.extenso", "usuario.nome",
  "campo.frequencia", "campo.periodo_referencia", "campo.serie_destino", "campo.texto",
];
const RAW_KEYS = new Set(["responsaveis.tabela", "financeiro.tabela_parcelas", "escola.cnpj_texto"]);
const chaveOpcao = (s) => normal(s).replace(/[^a-z0-9]/g, "");
/* {{campo}} vira o dado; vazio vira uma linha em branco (para preencher à mão).
   {{marcar campo: A | B | C}} imprime ( X ) na opção igual ao dado. */
function aplicarModelo(html, ctx) {
  return html
    .replace(/\{\{\s*marcar\s+([\w.]+)\s*:\s*([^}]+)\}\}/g, (_, k, ops) => {
      const v = chaveOpcao(ctx[k]);
      return ops.split("|").map((o) => o.trim()).filter(Boolean)
        .map((o) => `<span class="marca${v && chaveOpcao(o) === v ? " on" : ""}">(${v && chaveOpcao(o) === v ? "X" : "&nbsp;&nbsp;"}) ${esc(o)}</span>`).join(" ");
    })
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
      const v = ctx[k];
      if (v == null || v === "") return RAW_KEYS.has(k) ? "" : `<span class="vazio" title="${esc(k)}"></span>`;
      return RAW_KEYS.has(k) ? v : esc(v);
    });
}
const UNID = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const extenso = (n) => { n = Number(n); if (!Number.isInteger(n) || n < 0 || n > 99) return ""; return n < 20 ? UNID[n] : DEZ[Math.floor(n / 10)] + (n % 10 ? " e " + UNID[n % 10] : ""); };
const mesAno = (d) => (d ? `${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}` : "");
/* reúne todos os dados de uma matrícula para preencher documentos */
async function contextoMatricula(matriculaId, campos = {}) {
  const m = await q(sb.from("matriculas").select("*").eq("id", matriculaId).single());
  const a = await q(sb.from("alunos").select("*").eq("id", m.aluno_id).single());
  const [e, t, t2, resps, parc] = await Promise.all([
    q(sb.from("escolas").select("*").eq("id", m.escola_id).single()),
    m.turma_id ? q(sb.from("turmas").select("*").eq("id", m.turma_id).single()) : null,
    m.turma2_id ? q(sb.from("turmas").select("*").eq("id", m.turma2_id).single()) : null,
    q(sb.from("responsaveis").select("*").eq("familia_id", a.familia_id).order("created_at")),
    sb.from("parcelas").select("*").eq("matricula_id", matriculaId).neq("status", "cancelada").order("numero").then((r) => r.data || []),
  ]);
  const rf = resps.find((r) => r.id === m.resp_financeiro_id) || {};
  const sep = Number(m.valor_primeira_parcela) > 0;
  const n = m.num_parcelas;
  const descCalc = m.desconto_tipo === "percentual" ? m.valor_mensalidade * m.desconto_valor / 100 : m.desconto_tipo === "valor" ? Number(m.desconto_valor) : 0;
  const cond = m.cond_primeira && m.cond_primeira.modo && m.cond_primeira.modo !== "integral" ? m.cond_primeira : null;
  const p1s = parc.filter((p) => p.numero === 1).sort((a, b) => (a.parte || 0) - (b.parte || 0));
  const p1 = p1s[0];
  const demais = sep || cond ? parc.filter((p) => p.numero > 1) : parc;
  const desc = demais.length ? Number(demais[0].desconto) : descCalc;
  const valorDemais = demais.length ? Number(demais[0].valor) : Number(m.valor_mensalidade) - desc;
  const primeira = p1s.length ? p1s.reduce((s, p) => s + Number(p.valor), 0) : cond?.valor_final != null ? Number(cond.valor_final) : sep ? Number(m.valor_primeira_parcela) : valorDemais;
  const primeiraBruta = cond ? Number(cond.valor_original) : sep ? Number(m.valor_primeira_parcela) : Number(m.valor_mensalidade);
  const valorCurso = primeiraBruta + Number(m.valor_mensalidade) * Math.max(0, n - 1);
  const anuidade = parc.length ? parc.reduce((s, p) => s + Number(p.valor), 0) : primeira + valorDemais * Math.max(0, n - 1);
  const pago = parc.reduce((s, p) => s + Number(p.valor_pago || 0), 0);
  const venc = parc.map((p) => p.vencimento).sort();
  const vencP1 = p1?.vencimento || (sep ? m.vencimento_primeira || m.data_matricula : m.primeiro_vencimento);
  // 1ª parcela dividida: "10/01/2027 e 10/02/2027, em 2 pagamentos de R$ 450,00"
  const partesP1 = p1s.length > 1 ? p1s : cond?.modo?.startsWith("parcelado") ? (cond.partes || []) : [];
  const listaE = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " e " + xs[xs.length - 1] : xs[0] || "");
  const vencP1Txt = partesP1.length > 1 ? `${listaE(partesP1.map((p) => dataBR(p.vencimento)))}, em ${partesP1.length} pagamentos ${partesP1.every((p) => Number(p.valor) === Number(partesP1[0].valor)) ? "de " + money(partesP1[0].valor) : "(" + listaE(partesP1.map((p) => money(p.valor))) + ")"}` : dataBR(vencP1);
  const inicioDemais = demais[0]?.vencimento || m.primeiro_vencimento;
  const temCond = desc > 0 || !!m.condicoes_especiais || !!cond;
  const filiacao = [a.mae_nome, a.pai_nome].filter(Boolean).join(" e ");
  const tels = (...xs) => [...new Set(xs.filter(Boolean))].join(" / ");
  const ctx = {
    "escola.nome": e.nome, "escola.razao_social": e.razao_social || e.nome, "escola.cnpj": e.cnpj, "escola.cnpj_texto": e.cnpj ? `, CNPJ ${esc(e.cnpj)}` : "",
    "escola.endereco": e.endereco, "escola.cidade": e.cidade, "escola.telefone": e.telefone, "escola.email": e.email,
    "aluno.nome": a.nome, "aluno.nascimento": dataBR(a.nascimento), "aluno.idade": a.nascimento ? idade(a.nascimento) + " anos" : "", "aluno.sexo": a.sexo, "aluno.cpf": fmtCPF(a.cpf), "aluno.rg": a.rg,
    "aluno.naturalidade": a.naturalidade, "aluno.nacionalidade": a.nacionalidade,
    "aluno.endereco": a.endereco, "aluno.bairro": a.bairro, "aluno.cidade": a.cidade ? a.cidade + (a.uf ? "/" + a.uf : "") : "", "aluno.cep": a.cep,
    "aluno.endereco_completo": [a.endereco, a.bairro, a.cidade && `${a.cidade}${a.uf ? "/" + a.uf : ""}`, a.cep && "CEP " + a.cep].filter(Boolean).join(", "),
    "aluno.email": a.email || resps.find((r) => r.email)?.email, "aluno.telefones": tels(a.telefone, ...resps.flatMap((r) => [r.telefone, r.telefone2])),
    "aluno.mae": a.mae_nome, "aluno.pai": a.pai_nome, "aluno.filiacao": filiacao,
    "matricula.ano_letivo": m.ano_letivo, "matricula.curso": /ano/i.test(m.serie || "") ? "Ensino Fundamental" : "Educação Infantil", "matricula.serie": m.serie,
    "matricula.turma": t2 ? `${t.nome} e ${t2.nome}` : t?.nome, "matricula.periodo": m.periodo, "matricula.entrada": hora(m.hora_entrada), "matricula.saida": hora(m.hora_saida),
    "matricula.horario": m.hora_entrada ? `${hora(m.hora_entrada)} às ${hora(m.hora_saida)}` : "", "matricula.tipo": m.tipo === "rematricula" ? "Rematrícula" : "Matrícula nova",
    "matricula.data": dataBR(m.data_matricula), "matricula.status": STATUS_MAT[m.status]?.[0], "matricula.obs": m.obs,
    "responsavel.nome": rf.nome, "responsavel.parentesco": rf.parentesco, "responsavel.cpf": fmtCPF(rf.cpf), "responsavel.rg": rf.rg,
    "responsavel.nascimento": dataBR(rf.nascimento), "responsavel.endereco": rf.endereco, "responsavel.bairro": rf.bairro, "responsavel.cidade": rf.cidade, "responsavel.cep": rf.cep,
    "responsavel.telefone": rf.telefone, "responsavel.telefones": tels(rf.telefone, rf.telefone2), "responsavel.email": rf.email,
    "responsaveis.lista": resps.map((r) => `${r.nome} (${r.parentesco || "responsável"}${r.telefone ? ", " + r.telefone : ""})`).join("; "),
    "responsaveis.tabela": `<table><tr><th>Nome</th><th>Parentesco</th><th>CPF</th><th>Telefone</th><th>E-mail</th></tr>${resps.map((r) => `<tr><td>${esc(r.nome)}</td><td>${esc(r.parentesco)}</td><td>${esc(fmtCPF(r.cpf))}</td><td>${esc(r.telefone)}</td><td>${esc(r.email)}</td></tr>`).join("")}</table>`,
    "financeiro.valor_curso": money(valorCurso), "financeiro.anuidade": money(anuidade), "financeiro.mensalidade": money(m.valor_mensalidade),
    "financeiro.desconto": money(desc), "financeiro.valor_parcela": money(valorDemais), "financeiro.primeira_parcela": money(primeira), "financeiro.primeira_parcela_bruta": money(primeiraBruta),
    "financeiro.primeira_vencimento": vencP1Txt, "financeiro.parcelas": n, "financeiro.parcelas_extenso": extenso(n),
    "financeiro.dia_vencimento": m.dia_vencimento || (inicioDemais ? Number(inicioDemais.slice(8)) : ""), "financeiro.dia_extenso": extenso(m.dia_vencimento || (inicioDemais ? Number(inicioDemais.slice(8)) : "")),
    "financeiro.inicio_demais": mesAno(inicioDemais), "financeiro.primeiro_vencimento": dataBR(m.primeiro_vencimento || venc[0]),
    "financeiro.meses": venc.length ? (venc[0].slice(0, 7) === venc[venc.length - 1].slice(0, 7) ? mesAno(venc[0]) : `${mesAno(venc[0])} a ${mesAno(venc[venc.length - 1])}`) : "",
    "financeiro.condicoes": [cond && textoCond(cond), m.desconto_motivo && "Desconto: " + m.desconto_motivo, m.condicoes_especiais].filter(Boolean).join(". "),
    "financeiro.condicao_primeira": cond ? textoCond(cond) : "",
    "financeiro.cond_valor_curso": temCond && (desc > 0 || cond) ? money(anuidade) : "", "financeiro.cond_primeira": temCond && (desc > 0 || cond) ? money(primeira) : "", "financeiro.cond_demais": temCond && (desc > 0 || cond) ? money(valorDemais) : "",
    "financeiro.material": m.valor_material ? money(m.valor_material) : "", "financeiro.material_forma": m.material_forma,
    "financeiro.tabela_parcelas": parc.length ? `<table><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr>${parc.map((p) => `<tr><td>${p.numero}/${n}${p.partes ? ` (pagamento ${p.parte}/${p.partes})` : ""}</td><td>${dataBR(p.vencimento)}</td><td>${money(p.valor)}</td></tr>`).join("")}</table>` : "",
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
