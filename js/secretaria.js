/* ==========================================================================
   Secretaria: contratos e assinatura, documentos digitais e checklist,
   declarações automáticas e lista de espera.
   ========================================================================== */

/* ================================ CONTRATOS ================================ */
const linkAssinatura = (token) => new URL("assinar.html?t=" + token, location.href.split("#")[0]).href;

function certificadoHTML(c) {
  if (c.status !== "assinado") return "";
  const ev = c.evidencias || {};
  return `<div class="cert"><h4>Registro de assinatura eletrônica</h4>
    <b>Signatário:</b> ${esc(c.signatario_nome)} — CPF ${esc(fmtCPF(c.signatario_cpf))}${c.signatario_email ? " — " + esc(c.signatario_email) : ""}<br>
    <b>Data/hora:</b> ${esc(new Date(c.assinado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))} (horário de Brasília)<br>
    <b>IP:</b> ${esc(c.assinatura_ip || "—")} · <b>Navegador:</b> ${esc((c.assinatura_ua || "").slice(0, 120))}<br>
    <b>Método:</b> ${esc(ev.metodo || "Link individual")} · CPF conferido com o cadastro: ${ev.cpf_conferido_com_cadastro ? "sim" : "não"}<br>
    <b>Hash SHA-256 do documento:</b> <span style="word-break:break-all">${esc(c.conteudo_hash)}</span><br>
    <b>Código de verificação:</b> ${esc(c.codigo_verificacao)}</div>`;
}
const contratoHTML = (c) => c.conteudo + certificadoHTML(c);

async function gerarContrato(matriculaId) {
  const { ctx, m, e } = await contextoMatricula(matriculaId);
  const modelos = await q(sb.from("modelos").select("*").eq("escola_id", m.escola_id).eq("tipo", "contrato").eq("ativo", true).order("nome"));
  if (!modelos.length) return toast("Cadastre um modelo de contrato em Modelos.", true);
  const existentes = await q(sb.from("contratos").select("id,status").eq("matricula_id", matriculaId).in("status", ["rascunho", "aguardando", "assinado"]));
  if (existentes.some((c) => c.status === "assinado") && !(await confirmar("Esta matrícula já tem contrato assinado. Gerar um novo (ex.: aditivo)? O assinado continua guardado sem alterações."))) return;
  let modelo = modelos[0];
  if (modelos.length > 1) {
    modelo = await new Promise((res) => modal({ title: "Escolha o modelo", body: `<select id="mSel">${opts(modelos.map((x) => [x.id, x.nome]))}</select>`, acts: [{ label: "Cancelar", cls: "sec", onClick: () => res(null) }, { label: "Usar", onClick: (r) => res(modelos.find((x) => x.id === $("#mSel", r).value)) }] }));
    if (!modelo) return;
  }
  if (!ctx["responsavel.nome"]) toast("Atenção: a matrícula está sem responsável financeiro.", true);
  const titulo = `${modelo.nome} — ${ctx["aluno.nome"]} — ${m.ano_letivo}`;
  const html = folha(e, aplicarModelo(modelo.conteudo, ctx));
  const c = await tenta(() => q(sb.from("contratos").insert({ matricula_id: m.id, aluno_id: m.aluno_id, escola_id: m.escola_id, modelo_id: modelo.id, titulo, conteudo: html }).select().single()), "Contrato gerado como rascunho.");
  if (c) { abrirContrato(c.id); if (location.hash.includes("aba=contratos")) render(); }
}

async function abrirContrato(id, depois) {
  const c = await q(sb.from("contratos").select("*").eq("id", id).single());
  const edit = pode("contratos") || pode("matricula");
  const extras = [];
  if (edit && c.status === "rascunho") {
    extras.push({ label: "Ajustar texto", cls: "sec", icon: "pencil", close: false, onClick: async (root) => {
      const tmp = document.createElement("div"); tmp.innerHTML = c.conteudo;
      const n = await editarHTML("Ajustar contrato (rascunho)", tmp.firstElementChild?.classList.contains("folha") ? tmp.firstElementChild.innerHTML : c.conteudo);
      if (!n) return false;
      const novo = `<div class="folha">${n}</div>`;
      const ok = await tenta(() => q(sb.from("contratos").update({ conteudo: novo }).eq("id", c.id)), "Contrato ajustado.");
      if (ok !== undefined) { root.remove(); abrirContrato(id, depois); }
      return false;
    } });
    extras.push({ label: "Enviar para assinatura", icon: "send", onClick: async () => { await enviarParaAssinatura(c, depois); } });
  }
  if (edit && c.status === "aguardando") extras.push({ label: "Reenviar link", icon: "send", cls: "sec", onClick: async () => { compartilharLink(c); } });
  if (c.status === "assinado") extras.push({ label: c.documento_id ? "Abrir PDF arquivado" : "Arquivar PDF assinado", icon: "archive", cls: "sec", close: false, onClick: async () => {
    if (c.documento_id) { const d = await q(sb.from("documentos").select("*").eq("id", c.documento_id).single()); abrirArquivo(d); }
    else { await arquivarContratoAssinado(c); depois && depois(); }
    return false;
  } });
  if (edit && ["rascunho", "aguardando"].includes(c.status)) extras.push({ label: "Cancelar contrato", cls: "ghost-danger", onClick: async () => {
    const mot = await confirmar("Cancelar este contrato? O link de assinatura deixa de funcionar.", { pedirMotivo: true, perigo: true, ok: "Cancelar contrato" });
    if (!mot) return false;
    await tenta(() => q(sb.from("contratos").update({ status: "cancelado", cancelado_motivo: mot }).eq("id", c.id)), "Contrato cancelado."); depois && depois();
  } });
  verDocumento({ titulo: `${c.titulo} · ${STATUS_CON[c.status][0]}`, html: contratoHTML(c), extras });
}

async function enviarParaAssinatura(c, depois) {
  const token = uid(), exp = new Date(Date.now() + (CONFIG.diasLinkAssinatura || 15) * 864e5).toISOString();
  const r = await tenta(() => q(sb.from("contratos").update({ status: "aguardando", token, token_expira: exp, enviado_em: new Date().toISOString(), tentativas: 0 }).eq("id", c.id).select().single()));
  if (!r) return;
  await sb.from("matriculas").update({ status: "aguardando_assinatura" }).eq("id", c.matricula_id).in("status", ["em_andamento", "aguardando_documentos"]);
  compartilharLink(r); depois && depois();
}
async function compartilharLink(c) {
  const m = await q(sb.from("matriculas").select("resp_financeiro_id").eq("id", c.matricula_id).single());
  const rf = m.resp_financeiro_id ? await q(sb.from("responsaveis").select("nome,telefone,email").eq("id", m.resp_financeiro_id).single()) : {};
  const link = linkAssinatura(c.token);
  const msg = `Olá, ${rf.nome || ""}! Segue o link individual e seguro para ler e assinar o contrato escolar de ${c.titulo.split(" — ")[1] || ""}: ${link} (válido até ${dataBR((c.token_expira || "").slice(0, 10))}). Para assinar, informe seu nome completo e CPF.`;
  const tel = soDig(rf.telefone); const wa = tel ? `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}` : "";
  modal({
    title: "Link de assinatura", size: "lg",
    body: `<p>Envie este link <b>somente</b> para ${esc(rf.nome || "o responsável financeiro")}. Não é preciso criar conta. O link vale até <b>${dataBR((c.token_expira || "").slice(0, 10))}</b>.</p>
      <div class="field" style="margin-top:10px"><i data-lucide="link"></i><input id="lnk" value="${esc(link)}" readonly></div>
      <div class="row" style="margin-top:12px"><button class="btn sec" id="cp"><i data-lucide="copy"></i>Copiar link</button>
      ${wa ? `<a class="btn ok" href="${esc(wa)}" target="_blank" rel="noopener"><i data-lucide="message-circle"></i>Enviar por WhatsApp</a>` : ""}
      ${rf.email ? `<a class="btn sec" href="mailto:${esc(rf.email)}?subject=${encodeURIComponent("Contrato escolar para assinatura")}&body=${encodeURIComponent(msg)}"><i data-lucide="mail"></i>Enviar por e-mail</a>` : ""}</div>`,
    onOpen: (r) => ($("#cp", r).onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copiado."); } catch (_) { $("#lnk", r).select(); document.execCommand("copy"); toast("Link copiado."); } }),
    acts: [{ label: "Fechar", cls: "sec" }],
  });
}
async function arquivarContratoAssinado(c, silencioso) {
  const fn = async () => {
    const d = await arquivarPDF({ aluno_id: c.aluno_id, escola_id: c.escola_id, categoria: "contrato_assinado", titulo: c.titulo + " (assinado)", ano: Number(c.titulo.match(/(\d{4})$/)?.[1]) || S.anoAtual, html: contratoHTML(c) });
    await q(sb.from("contratos").update({ documento_id: d.id }).eq("id", c.id));
  };
  return silencioso ? fn().catch((e) => console.warn("arquivo automático", e)) : tenta(fn, "PDF assinado arquivado na ficha.");
}
/* guarda automaticamente os contratos assinados ainda não arquivados */
async function autoArquivar(lista) { for (const c of lista.filter((x) => x.status === "assinado" && !x.documento_id)) await arquivarContratoAssinado(c, true); }

async function listaContratosAluno(box, a, mats) {
  const cs = await q(sb.from("contratos").select("*").eq("aluno_id", a.id).order("created_at", { ascending: false }));
  const edit = pode("contratos") || pode("matricula");
  const ativas = mats.filter((m) => !["cancelada", "transferida"].includes(m.status));
  box.innerHTML = `<div class="row" style="margin-bottom:12px">${edit && ativas.length ? `<select id="gcMat" style="width:auto">${opts(ativas.map((m) => [m.id, `Matrícula ${m.ano_letivo} · ${m.serie}`]))}</select><button class="btn" id="gc"><i data-lucide="file-plus"></i>Gerar contrato</button>` : ""}</div>` +
    (cs.length ? `<div class="scroll"><table><thead><tr><th>Contrato</th><th>Situação</th><th>Gerado</th><th>Assinatura</th><th></th></tr></thead><tbody>
    ${cs.map((c) => `<tr><td><b>${esc(c.titulo)}</b><div class="small muted">por ${esc(c.gerado_por || "")}</div></td><td>${tag(STATUS_CON, c.status)}</td><td class="small">${dataHora(c.created_at)}</td>
      <td class="small">${c.status === "assinado" ? `${esc(c.signatario_nome)}<br>${dataHora(c.assinado_em)}` : c.status === "aguardando" ? `Enviado ${dataHora(c.enviado_em)}<br>expira ${dataBR((c.token_expira || "").slice(0, 10))}` : c.cancelado_motivo ? esc(c.cancelado_motivo) : ""}</td>
      <td class="act"><button class="btn sm sec" data-c="${c.id}"><i data-lucide="eye"></i>Abrir</button></td></tr>`).join("")}</tbody></table></div>` : vazio("Nenhum contrato gerado.", "file-signature"));
  $$("[data-c]", box).forEach((b) => (b.onclick = () => abrirContrato(b.dataset.c, () => render())));
  if ($("#gc", box)) $("#gc", box).onclick = () => gerarContrato($("#gcMat", box).value);
  icons(); autoArquivar(cs);
}

rota("contratos", async (main, _, p) => {
  const ano = Number(p.ano || S.anoAtual), st = p.st || "";
  main.innerHTML = pageHead("file-signature", "Contratos", "Gerados a partir da matrícula. Assinatura por link individual, sem portal de pais.") +
    `<div class="bar-tools"><select id="cAno">${anosOpts(ano)}</select><select id="cSt">${opts(Object.entries(STATUS_CON).map(([k, v]) => [k, v[0]]), st, "Todas as situações")}<option value="sem" ${st === "sem" ? "selected" : ""}>Matrículas sem contrato</option></select><input id="cQ" class="grow" placeholder="Filtrar por aluno"></div><div id="cBox">${carregando()}</div>`;
  icons();
  const nav = () => ir(`#/contratos?ano=${$("#cAno").value}&st=${$("#cSt").value}`);
  $("#cAno").onchange = nav; $("#cSt").onchange = nav;
  const mats = await fetchAll(() => filtraEscola(sb.from("v_matriculas").select("id,aluno_id,aluno_nome,serie,escola_nome,status,resp_nome").eq("ano_letivo", ano).not("status", "in", "(cancelada,transferida)")));
  const cs = mats.length ? await fetchAll(() => sb.from("contratos").select("id,matricula_id,aluno_id,titulo,status,created_at,enviado_em,assinado_em,token_expira,documento_id,signatario_nome,conteudo,conteudo_hash,codigo_verificacao,evidencias,assinatura_ip,assinatura_ua,signatario_cpf,signatario_email,escola_id").in("matricula_id", mats.map((m) => m.id)).order("created_at", { ascending: false })) : [];
  const desenhar = () => {
    const f = normal($("#cQ").value); const mm = Object.fromEntries(mats.map((m) => [m.id, m]));
    if (st === "sem") {
      const com = new Set(cs.filter((c) => c.status !== "cancelado").map((c) => c.matricula_id));
      const sem = mats.filter((m) => !com.has(m.id) && (!f || normal(m.aluno_nome).includes(f)));
      $("#cBox").innerHTML = sem.length ? `<div class="scroll"><table><thead><tr><th>Aluno</th><th>Série</th><th>Resp. financeiro</th><th>Matrícula</th><th></th></tr></thead><tbody>${sem.map((m) => `<tr><td><a class="link" href="#/aluno/${m.aluno_id}?aba=contratos">${esc(m.aluno_nome)}</a></td><td>${esc(m.serie)}</td><td>${esc(m.resp_nome || "—")}</td><td>${tag(STATUS_MAT, m.status)}</td>
        <td class="act">${pode("contratos") || pode("matricula") ? `<button class="btn sm" data-g="${m.id}"><i data-lucide="file-plus"></i>Gerar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : vazio("Todas as matrículas têm contrato.", "check-circle-2");
      $$("[data-g]").forEach((b) => (b.onclick = () => gerarContrato(b.dataset.g)));
    } else {
      const l = cs.filter((c) => (!st || c.status === st) && (!f || normal(mm[c.matricula_id]?.aluno_nome).includes(f)));
      const cnt = (s) => cs.filter((c) => c.status === s).length;
      $("#cBox").innerHTML = `<div class="kpis">${Object.entries(STATUS_CON).map(([k, v]) => kpiCard({ ic: { rascunho: "file-pen", aguardando: "send", assinado: "badge-check", cancelado: "file-x" }[k], cor: v[1] === "ok" ? "green" : v[1] === "warn" ? "amber" : v[1] === "err" ? "red" : "navy", valor: cnt(k), rotulo: v[0], href: "#/contratos?st=" + k })).join("")}</div>` +
        (l.length ? `<div class="scroll"><table><thead><tr><th>Aluno</th><th>Contrato</th><th>Situação</th><th>Movimento</th><th></th></tr></thead><tbody>${l.map((c) => `<tr><td><a class="link" href="#/aluno/${c.aluno_id}?aba=contratos">${esc(mm[c.matricula_id]?.aluno_nome)}</a><div class="small muted">${esc(mm[c.matricula_id]?.escola_nome || "")}</div></td><td class="small">${esc(c.titulo)}</td><td>${tag(STATUS_CON, c.status)}</td>
          <td class="small">${c.assinado_em ? "Assinado " + dataHora(c.assinado_em) : c.enviado_em ? "Enviado " + dataHora(c.enviado_em) : "Gerado " + dataHora(c.created_at)}</td><td class="act"><button class="btn sm sec" data-c="${c.id}"><i data-lucide="eye"></i>Abrir</button></td></tr>`).join("")}</tbody></table></div>` : vazio("Nenhum contrato com esses filtros.", "file-signature"));
      $$("[data-c]").forEach((b) => (b.onclick = () => abrirContrato(b.dataset.c, () => render())));
    }
    icons();
  };
  $("#cQ").oninput = desenhar; desenhar(); autoArquivar(cs);
});

/* ================================ DOCUMENTOS ================================ */
async function documentosAluno(box, a) {
  const [docs, chk] = await Promise.all([
    q(sb.from("documentos").select("*").eq("aluno_id", a.id).order("ano", { ascending: false }).order("created_at", { ascending: false })),
    q(sb.from("doc_checklist").select("*").eq("aluno_id", a.id)),
  ]);
  const st = Object.fromEntries(chk.map((c) => [c.item, c.status]));
  const edit = pode("documentos") || pode("matricula");
  box.innerHTML = `<div class="two">
    <div class="card"><h3>Checklist de documentos</h3><p class="sub">Marque o que foi entregue. Pendências aparecem no relatório de documentação incompleta.</p>
      <ul class="list">${Object.entries(CHECK).map(([k, t]) => `<li><div style="flex:1">${esc(t)}</div><select data-ck="${k}" style="width:auto" ${edit ? "" : "disabled"}>${opts([["pendente", "Pendente"], ["entregue", "Entregue"], ["nao_aplicavel", "Não se aplica"]], st[k] || "pendente")}</select></li>`).join("")}</ul></div>
    <div class="card"><h3>Enviar arquivo</h3><p class="sub">PDF, JPG ou PNG até 10 MB.</p>
      ${`<div class="grid"><div class="c6"><label>Categoria</label><select id="upCat">${opts(Object.entries(CATEG).map(([k, v]) => [k, v]), "certidao")}</select></div>
        <div class="c6"><label>Ano</label><select id="upAno">${anosOpts(S.anoAtual)}</select></div>
        <div><label>Título</label><input id="upTit" placeholder="Opcional (usa a categoria)"></div></div>
        <label class="drop" id="upDrop" style="margin-top:12px"><input type="file" id="upFile" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple hidden><i data-lucide="upload-cloud"></i><br>Clique ou arraste arquivos aqui</label>`}
    </div></div>
    <div class="card" style="margin-top:14px"><h3>Arquivos da ficha</h3>
    ${docs.length ? `<div class="scroll" style="box-shadow:none;margin-top:10px"><table><thead><tr><th>Ano</th><th>Categoria</th><th>Título</th><th>Enviado</th><th></th></tr></thead><tbody>${docs.map((d) => `<tr><td>${d.ano}</td><td>${esc(CATEG[d.categoria])}</td><td>${esc(d.titulo)}</td><td class="small">${dataHora(d.created_at)}<br>${esc(d.enviado_por || "")}</td>
      <td class="act"><button class="btn sm sec" data-v="${d.id}" title="Visualizar / imprimir"><i data-lucide="eye"></i></button><button class="btn sm sec" data-b="${d.id}" title="Baixar"><i data-lucide="download"></i></button>${pode("documentos") ? `<button class="btn sm sec" data-x="${d.id}" title="Excluir"><i data-lucide="trash-2"></i></button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : vazio("Nenhum arquivo anexado.", "folder-open")}</div>`;
  icons();
  $$("[data-ck]", box).forEach((s) => (s.onchange = () => tenta(() => q(sb.from("doc_checklist").upsert({ aluno_id: a.id, item: s.dataset.ck, status: s.value })), "Checklist atualizado.")));
  $$("[data-v]", box).forEach((b) => (b.onclick = () => abrirArquivo(docs.find((d) => d.id === b.dataset.v))));
  $$("[data-b]", box).forEach((b) => (b.onclick = () => abrirArquivo(docs.find((d) => d.id === b.dataset.b), true)));
  $$("[data-x]", box).forEach((b) => (b.onclick = async () => {
    const d = docs.find((x) => x.id === b.dataset.x);
    if (!(await confirmar(`Excluir “${esc(d.titulo)}”? Esta ação não pode ser desfeita.`, { perigo: true, ok: "Excluir" }))) return;
    await tenta(async () => { await sb.storage.from("documentos").remove([d.path]); await q(sb.from("documentos").delete().eq("id", d.id)); }, "Arquivo excluído."); render();
  }));
  const enviar = async (files) => {
    for (const f of files) {
      if (!/^(application\/pdf|image\/(jpeg|png))$/.test(f.type)) { toast(`${f.name}: formato não aceito (use PDF, JPG ou PNG).`, true); continue; }
      if (f.size > 10 * 1024 * 1024) { toast(`${f.name}: maior que 10 MB.`, true); continue; }
      const cat = $("#upCat").value;
      const ok = await tenta(() => guardarArquivo({ aluno_id: a.id, escola_id: a.escola_id, categoria: cat, titulo: $("#upTit").value.trim() || `${CATEG[cat]}${files.length > 1 ? " — " + f.name : ""}`, ano: Number($("#upAno").value), blob: f, nomeArq: f.name, mime: f.type }), `${f.name} enviado.`);
      if (ok && CHECK[cat] && edit) await sb.from("doc_checklist").upsert({ aluno_id: a.id, item: cat, status: "entregue" });
    }
    render();
  };
  const inp = $("#upFile", box), drop = $("#upDrop", box);
  if (inp) {
    inp.onchange = () => enviar([...inp.files]);
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.style.borderColor = "var(--royal)"; });
    drop.addEventListener("drop", (e) => { e.preventDefault(); enviar([...e.dataTransfer.files]); });
  }
}

rota("documentos", async (main) => {
  main.innerHTML = pageHead("folder-open", "Documentos", "Pendências de documentação por aluno. Os arquivos ficam na ficha de cada aluno.",
    `<button class="btn sec" onclick="ir('#/relatorios?t=documentacao')"><i data-lucide="file-bar-chart"></i>Relatório</button>`) + `<div class="bar-tools"><input id="dQ" class="grow" placeholder="Filtrar por aluno"><select id="dF">${opts([["pend", "Com pendências"], ["todos", "Todos os alunos ativos"]], "pend")}</select></div><div id="dBox">${carregando()}</div>`;
  icons();
  const [al, chk, docs] = await Promise.all([
    fetchAll(() => filtraEscola(sb.from("alunos").select("id,nome,escola_id").eq("ativo", true)).order("nome")),
    fetchAll(() => sb.from("doc_checklist").select("*")),
    fetchAll(() => filtraEscola(sb.from("documentos").select("aluno_id"))),
  ]);
  const por = {}; chk.forEach((c) => ((por[c.aluno_id] ||= {})[c.item] = c.status));
  const nd = {}; docs.forEach((d) => (nd[d.aluno_id] = (nd[d.aluno_id] || 0) + 1));
  const desenhar = () => {
    const f = normal($("#dQ").value), so = $("#dF").value === "pend";
    const l = al.filter((a) => (!f || normal(a.nome).includes(f)) && (!so || Object.keys(CHECK).some((k) => (por[a.id]?.[k] || "pendente") === "pendente")));
    $("#dBox").innerHTML = l.length ? `<div class="scroll"><table><thead><tr><th>Aluno</th>${Object.values(CHECK).map((t) => `<th title="${esc(t)}">${esc(t.split(" ")[0])}</th>`).join("")}<th class="num">Arquivos</th></tr></thead><tbody>
      ${l.map((a) => `<tr><td><a class="link" href="#/aluno/${a.id}?aba=documentos">${esc(a.nome)}</a>${S.escola ? "" : `<div class="small muted">${esc(escolaNome(a.escola_id))}</div>`}</td>${Object.keys(CHECK).map((k) => { const s = por[a.id]?.[k] || "pendente"; return `<td>${s === "entregue" ? '<span class="tag ok">OK</span>' : s === "nao_aplicavel" ? '<span class="tag off">N/A</span>' : '<span class="tag warn">Pend.</span>'}</td>`; }).join("")}<td class="num">${nd[a.id] || 0}</td></tr>`).join("")}
      </tbody></table></div><p class="small muted">${l.length} aluno(s)</p>` : vazio("Nenhuma pendência de documentação.", "check-circle-2");
    icons();
  };
  $("#dQ").oninput = desenhar; $("#dF").onchange = desenhar; desenhar();
});

/* ================================ DECLARAÇÕES ================================ */
async function emitirDeclaracao(aluno, mats, subtipoIni) {
  if (!pode("declaracoes")) return toast("Seu perfil não emite declarações.", true);
  const validas = mats.filter((m) => m.status !== "cancelada");
  if (!validas.length) return toast("O aluno não tem matrícula para basear a declaração.", true);
  modal({
    title: "Emitir declaração", size: "lg",
    body: `<div class="grid"><div class="c6"><label>Tipo</label><select id="dTipo">${opts(Object.entries(DECL), subtipoIni || "matricula")}</select></div>
      <div class="c6"><label>Matrícula de referência</label><select id="dMat">${opts(validas.map((m) => [m.id, `${m.ano_letivo} · ${m.serie} · ${STATUS_MAT[m.status][0]}`]))}</select></div></div>
      <div id="dCampos"></div>`,
    onOpen: (r) => {
      const campos = () => {
        const t = $("#dTipo", r).value;
        $("#dCampos", r).innerHTML = t === "frequencia" ? `<div class="grid"><div class="c6"><label class="req">Frequência conferida (ex.: 95%)</label><input name="frequencia"></div><div class="c6"><label class="req">Período de referência</label><input name="periodo_referencia" placeholder="ex.: fevereiro a junho de ${S.anoAtual}"></div>
            <div><label class="chk"><input type="checkbox" name="conferido"> Confirmo que a frequência foi conferida pela secretaria nos registros existentes</label></div></div>`
          : t === "transferencia" ? `<label class="req">Série/ano de destino (direito a cursar)</label><input name="serie_destino">`
          : t === "personalizada" ? `<label class="req">Texto (completa a frase após os dados do aluno)</label><textarea name="texto" placeholder="frequenta as aulas no período da manhã, de segunda a sexta-feira."></textarea>`
          : t === "quitacao" ? `<p class="hint">O sistema confere se todas as parcelas do ano estão pagas antes de emitir.</p>` : "";
      };
      $("#dTipo", r).onchange = campos; campos();
    },
    acts: [{ label: "Cancelar", cls: "sec" }, { label: "Gerar prévia", onClick: async (r) => {
      const tipo = $("#dTipo", r).value, matId = $("#dMat", r).value, campos = lerForm($("#dCampos", r));
      if (tipo === "frequencia" && (!campos.frequencia || !campos.periodo_referencia || !campos.conferido)) { toast("Preencha a frequência, o período e confirme a conferência.", true); return false; }
      if (tipo === "transferencia" && !campos.serie_destino) { toast("Informe a série de destino.", true); return false; }
      if (tipo === "personalizada" && !campos.texto) { toast("Escreva o texto da declaração.", true); return false; }
      if (tipo === "quitacao") {
        const ps = await q(sb.from("v_parcelas").select("situacao,em_aberto").eq("matricula_id", matId).neq("status", "cancelada"));
        const aberto = ps.filter((p) => p.situacao !== "pago");
        if (!ps.length) { toast("Não há mensalidades registradas para conferir.", true); return false; }
        if (aberto.length) { toast(`Não é possível emitir: ${aberto.length} parcela(s) em aberto (${money(aberto.reduce((s, p) => s + Number(p.em_aberto), 0))}). Fale com o financeiro.`, true); return false; }
      }
      delete campos.conferido;
      previaDeclaracao(matId, tipo, campos);
    } }],
  });
}
async function previaDeclaracao(matId, tipo, campos) {
  const { ctx, m, e } = await contextoMatricula(matId, campos);
  const mod = await modeloDe(m.escola_id, "declaracao", tipo);
  if (!mod) return toast("Modelo desta declaração não encontrado em Modelos.", true);
  let corpo = aplicarModelo(mod.conteudo, ctx);
  const titulo = `${mod.nome} — ${ctx["aluno.nome"]}`;
  const montar = () => folha(e, corpo, `Emitida em ${dataHora(new Date())} por ${esc(S.perfil.nome)}`);
  const v = verDocumento({
    titulo, html: montar(), editavel: true,
    onEditar: async () => { const n = await editarHTML("Ajustar declaração", corpo); if (n) { corpo = n; $("#docPrev", v.el).innerHTML = montar(); } },
    extras: [{ label: "Emitir e arquivar", icon: "stamp", onClick: async () => {
      const ok = await tenta(async () => {
        const html = montar();
        const d = await arquivarPDF({ aluno_id: m.aluno_id, escola_id: m.escola_id, categoria: "declaracao", titulo, ano: m.ano_letivo, html });
        await q(sb.from("emissoes").insert({ aluno_id: m.aluno_id, escola_id: m.escola_id, matricula_id: m.id, tipo: "declaracao", subtipo: tipo, titulo, conteudo: html, documento_id: d.id }));
      }, "Declaração emitida e arquivada.");
      if (ok !== undefined && location.hash.includes("aba=declaracoes")) render();
      return ok !== undefined;
    } }],
  });
}
async function declaracoesAluno(box, a, mats) {
  const em = await q(sb.from("emissoes").select("*").eq("aluno_id", a.id).order("emitido_em", { ascending: false }));
  box.innerHTML = `<div class="row" style="margin-bottom:12px">${pode("declaracoes") ? Object.entries(DECL).map(([k, t]) => `<button class="btn sm sec" data-d="${k}">${t}</button>`).join("") : ""}</div>` +
    (em.length ? `<div class="scroll"><table><thead><tr><th>Documento</th><th>Emitido em</th><th>Por</th><th></th></tr></thead><tbody>${em.map((x) => `<tr><td><b>${esc(x.titulo)}</b></td><td>${dataHora(x.emitido_em)}</td><td>${esc(x.emitido_por)}</td>
      <td class="act"><button class="btn sm sec" data-ver="${x.id}"><i data-lucide="eye"></i>Ver</button></td></tr>`).join("")}</tbody></table></div>` : vazio("Nenhuma declaração ou requerimento emitido.", "file-badge"));
  $$("[data-d]", box).forEach((b) => (b.onclick = () => emitirDeclaracao(a, mats, b.dataset.d)));
  $$("[data-ver]", box).forEach((b) => (b.onclick = () => { const x = em.find((y) => y.id === b.dataset.ver); verDocumento({ titulo: x.titulo, html: x.conteudo }); }));
  icons();
}
rota("declaracoes", async (main) => {
  main.innerHTML = pageHead("file-badge", "Declarações", "Escolha o aluno. A declaração é preenchida com os dados da ficha.") +
    `<div class="card"><label>Aluno</label><button class="btn" id="dEsc"><i data-lucide="search"></i>Buscar aluno</button></div>
     <div class="card" style="margin-top:14px"><h3>Últimas emissões</h3><div id="dUlt">${carregando()}</div></div>`;
  icons();
  $("#dEsc").onclick = () => escolherAluno("Declaração para…", async (x) => {
    const a = await q(sb.from("alunos").select("*").eq("id", x.id).single());
    const mats = await q(sb.from("matriculas").select("*").eq("aluno_id", x.id).order("ano_letivo", { ascending: false }));
    emitirDeclaracao(a, mats);
  });
  const em = await q(filtraEscola(sb.from("emissoes").select("id,aluno_id,titulo,emitido_em,emitido_por,conteudo")).order("emitido_em", { ascending: false }).limit(30));
  $("#dUlt").innerHTML = em.length ? `<ul class="list">${em.map((x) => `<li><div style="flex:1"><a class="link" href="#/aluno/${x.aluno_id}?aba=declaracoes">${esc(x.titulo)}</a><div class="small muted">${dataHora(x.emitido_em)} · ${esc(x.emitido_por)}</div></div><button class="btn sm sec" data-ver="${x.id}">Ver</button></li>`).join("")}</ul>` : '<div class="empty-sm">Nenhuma emissão ainda.</div>';
  $$("[data-ver]").forEach((b) => (b.onclick = () => { const x = em.find((y) => y.id === b.dataset.ver); verDocumento({ titulo: x.titulo, html: x.conteudo }); }));
});

/* ================================ LISTA DE ESPERA ================================ */
function formEspera(x = {}, turmas = []) {
  return `<div class="grid">
    <div class="c8"><label class="req">Nome da criança</label><input name="crianca_nome" value="${esc(x.crianca_nome)}"></div>
    <div class="c4"><label>Nascimento</label><input type="date" name="nascimento" value="${esc(x.nascimento)}"></div>
    <div class="c6"><label class="req">Responsável</label><input name="responsavel_nome" value="${esc(x.responsavel_nome)}"></div>
    <div class="c6"><label class="req">WhatsApp / telefone</label><input name="telefone" data-mask="tel" value="${esc(x.telefone)}"></div>
    <div class="c6"><label>E-mail</label><input type="email" name="email" value="${esc(x.email)}"></div>
    <div class="c6"><label class="req">Escola</label><select name="escola_id" id="eEsc">${escolaOpts(x.escola_id || S.escola || S.escolas[0]?.id)}</select></div>
    <div class="c3"><label class="req">Ano pretendido</label><select name="ano_pretendido" id="eAno">${anosOpts(x.ano_pretendido || S.anoAtual + (new Date().getMonth() >= 8 ? 1 : 0))}</select></div>
    <div class="c5"><label>Turma</label><select name="turma_id" id="eTur"></select></div>
    <div class="c4"><label>Série</label><input name="serie" value="${esc(x.serie)}"></div>
    <div class="c4"><label>Período</label><select name="periodo">${opts(PERIODOS, x.periodo, "—")}</select></div>
    <div class="c4"><label>Data da inscrição</label><input type="date" name="data_inscricao" value="${esc(x.data_inscricao || hojeISO())}"></div>
    <div class="c4"><label>Situação</label><select name="status">${opts(Object.entries(STATUS_ESP).map(([k, v]) => [k, v[0]]), x.status || "aguardando")}</select></div>
    <div><label>Observações</label><textarea name="obs">${esc(x.obs)}</textarea></div></div>`;
}
function editarEspera(x, depois) {
  modal({
    title: x?.id ? "Interessado na lista de espera" : "Novo interessado", size: "lg", body: formEspera(x || {}),
    onOpen: async (r) => {
      const carregar = async () => {
        const ts = await q(sb.from("v_turmas").select("*").eq("escola_id", $("#eEsc", r).value).eq("ano_letivo", $("#eAno", r).value).order("serie"));
        $("#eTur", r).innerHTML = opts(ts.map((t) => [t.id, `${t.nome} — ${t.periodo} (${t.vagas} vaga(s))`]), x?.turma_id, "Qualquer turma");
        $("#eTur", r).onchange = () => { const t = ts.find((y) => y.id === $("#eTur", r).value); if (t) { $('[name="serie"]', r).value = t.serie; $('[name="periodo"]', r).value = t.periodo; } };
      };
      $("#eEsc", r).onchange = carregar; $("#eAno", r).onchange = carregar; carregar();
    },
    acts: [{ label: "Cancelar", cls: "sec" }, { label: "Salvar", onClick: async (r) => {
      if (!exigir(r, ["crianca_nome", "responsavel_nome", "telefone"])) return false;
      const o = lerForm(r); o.ano_pretendido = Number(o.ano_pretendido);
      const ok = await tenta(() => x?.id ? q(sb.from("lista_espera").update(o).eq("id", x.id)) : q(sb.from("lista_espera").insert(o)), "Lista de espera atualizada.");
      if (ok === undefined) return false; depois(); } }],
  });
}
async function contatosEspera(x, depois) {
  const cs = await q(sb.from("espera_contatos").select("*").eq("espera_id", x.id).order("em", { ascending: false }));
  modal({
    title: `Contatos — ${x.crianca_nome}`, size: "lg",
    body: `${cs.length ? `<ul class="list">${cs.map((c) => `<li><div><b>${dataHora(c.em)}</b> · ${esc(c.meio || "")} · ${esc(c.usuario_nome)}<div>${esc(c.descricao)}</div></div></li>`).join("")}</ul>` : '<div class="empty-sm">Nenhum contato registrado.</div>'}
      <h3 style="margin-top:14px">Registrar contato</h3><div class="grid"><div class="c4"><label>Meio</label><select name="meio">${opts(["WhatsApp", "Telefone", "E-mail", "Presencial"])}</select></div>
      <div class="c8"><label>Nova situação</label><select name="st">${opts(Object.entries(STATUS_ESP).map(([k, v]) => [k, v[0]]), x.status === "aguardando" || x.status === "vaga_disponivel" ? "contatado" : x.status)}</select></div>
      <div><label class="req">O que foi conversado</label><textarea name="descricao"></textarea></div></div>`,
    acts: [{ label: "Fechar", cls: "sec" }, { label: "Registrar", onClick: async (r) => {
      const f = lerForm(r); if (!f.descricao) { toast("Descreva o contato.", true); return false; }
      const ok = await tenta(async () => { await q(sb.from("espera_contatos").insert({ espera_id: x.id, meio: f.meio, descricao: f.descricao })); if (f.st !== x.status) await q(sb.from("lista_espera").update({ status: f.st }).eq("id", x.id)); }, "Contato registrado.");
      if (ok === undefined) return false; depois(); } }],
  });
}
rota("espera", async (main, _, p) => {
  const edit = pode("espera") || pode("matricula");
  main.innerHTML = pageHead("hourglass", "Lista de espera", "Ordenada pela data de inscrição. Alerta quando abre vaga na turma pretendida.", edit ? `<button class="btn" id="eNovo"><i data-lucide="plus"></i>Novo interessado</button>` : "") +
    `<div class="bar-tools"><select id="eFAno">${opts(["", ...[S.anoAtual, S.anoAtual + 1, S.anoAtual + 2].map(String)].map((a) => [a, a || "Todos os anos"]), p.ano || "")}</select>
      <select id="eFSt">${opts(Object.entries(STATUS_ESP).map(([k, v]) => [k, v[0]]), p.st, "Ativos (sem matriculados/desistências)")}<option value="todos">Todos</option></select>
      <input id="eFQ" class="grow" placeholder="Filtrar por criança, responsável, série"><button class="btn sec" id="eXl"><i data-lucide="sheet"></i>Excel</button></div><div id="eBox">${carregando()}</div>`;
  icons();
  const recarregar = () => render();
  if ($("#eNovo")) $("#eNovo").onclick = () => editarEspera(null, recarregar);
  const [lista, turmas] = await Promise.all([fetchAll(() => filtraEscola(sb.from("lista_espera").select("*")).order("data_inscricao").order("created_at")), fetchAll(() => filtraEscola(sb.from("v_turmas").select("*")))]);
  const tmap = Object.fromEntries(turmas.map((t) => [t.id, t]));
  const vagaPara = (x) => { if (x.turma_id) return (tmap[x.turma_id]?.vagas || 0) > 0; return turmas.some((t) => t.escola_id === x.escola_id && t.ano_letivo === x.ano_pretendido && x.serie && normal(t.serie) === normal(x.serie) && t.vagas > 0); };
  let vis = [];
  const desenhar = () => {
    const ano = $("#eFAno").value, st = $("#eFSt").value, f = normal($("#eFQ").value);
    vis = lista.filter((x) => (!ano || String(x.ano_pretendido) === ano) && (st === "todos" || (st ? x.status === st : !["matriculado", "desistencia"].includes(x.status))) && (!f || normal(`${x.crianca_nome} ${x.responsavel_nome} ${x.serie}`).includes(f)));
    const alertas = vis.filter((x) => ["aguardando", "contatado"].includes(x.status) && vagaPara(x));
    $("#eBox").innerHTML = (alertas.length ? `<div class="msg ok"><i data-lucide="bell-ring"></i><div><b>Vaga disponível para ${alertas.length} interessado(s)</b> da lista (destacados abaixo). Entre em contato e registre.</div></div>` : "") +
      (vis.length ? `<div class="scroll"><table><thead><tr><th>#</th><th>Criança</th><th>Responsável</th>${S.escola ? "" : "<th>Escola</th>"}<th>Pretende</th><th>Inscrição</th><th>Situação</th><th></th></tr></thead><tbody>
      ${vis.map((x, i) => { const v = vagaPara(x); return `<tr style="${v && ["aguardando", "contatado"].includes(x.status) ? "background:#effaf3" : ""}"><td>${i + 1}</td><td><b>${esc(x.crianca_nome)}</b><div class="small muted">${x.nascimento ? dataBR(x.nascimento) + " (" + idade(x.nascimento) + " anos)" : ""}</div></td>
        <td>${esc(x.responsavel_nome)}<div class="small">${x.telefone ? `<a class="link" target="_blank" rel="noopener" href="https://wa.me/55${soDig(x.telefone)}">${esc(x.telefone)}</a>` : ""}</div></td>${S.escola ? "" : `<td>${esc(escolaNome(x.escola_id))}</td>`}
        <td>${esc(x.serie || "")} ${x.turma_id ? "· " + esc(tmap[x.turma_id]?.nome || "") : ""}<div class="small muted">${esc(x.periodo || "")} · ${x.ano_pretendido || ""}</div>${v ? '<span class="tag ok">Tem vaga</span>' : ""}</td>
        <td>${dataBR(x.data_inscricao)}</td><td>${tag(STATUS_ESP, x.status)}</td>
        <td class="act">${edit ? `<button class="btn sm sec" data-ct="${x.id}" title="Contatos"><i data-lucide="phone"></i></button><button class="btn sm sec" data-ed="${x.id}" title="Editar"><i data-lucide="pencil"></i></button>
          ${!["matriculado", "desistencia"].includes(x.status) && pode("matricula") ? `<button class="btn sm" data-mt="${x.id}"><i data-lucide="user-plus"></i>Matricular</button>` : ""}` : ""}
          ${x.aluno_id ? `<a class="btn sm sec" href="#/aluno/${x.aluno_id}">Ficha</a>` : ""}</td></tr>`; }).join("")}</tbody></table></div>` : vazio("Ninguém na lista de espera com esses filtros.", "hourglass"));
    $$("[data-ed]").forEach((b) => (b.onclick = () => editarEspera(lista.find((x) => x.id === b.dataset.ed), recarregar)));
    $$("[data-ct]").forEach((b) => (b.onclick = () => contatosEspera(lista.find((x) => x.id === b.dataset.ct), recarregar)));
    $$("[data-mt]").forEach((b) => (b.onclick = async () => {
      const x = lista.find((y) => y.id === b.dataset.mt);
      await tenta(() => q(sb.from("lista_espera").update({ status: "em_matricula" }).eq("id", x.id)));
      ir(`#/matricula?espera=${x.id}`);
    }));
    icons();
  };
  ["eFAno", "eFSt", "eFQ"].forEach((i) => $("#" + i).addEventListener("input", desenhar));
  $("#eXl").onclick = () => exportXLSX(vis.map((x, i) => ({ "#": i + 1, Criança: x.crianca_nome, Nascimento: dataBR(x.nascimento), Responsável: x.responsavel_nome, Telefone: x.telefone || "", "E-mail": x.email || "", Escola: escolaNome(x.escola_id), Série: x.serie || "", Turma: tmap[x.turma_id]?.nome || "", Período: x.periodo || "", Ano: x.ano_pretendido, Inscrição: dataBR(x.data_inscricao), Situação: STATUS_ESP[x.status][0], "Vaga disponível": vagaPara(x) ? "Sim" : "", Observações: x.obs || "" })), "lista-espera");
  desenhar();
});
