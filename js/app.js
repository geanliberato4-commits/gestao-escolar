/* ==========================================================================
   Início: login, primeiro acesso, menu, seletor de escola e busca rápida.
   ========================================================================== */
async function iniciar() {
  icons();
  const { data: { session } } = await sb.auth.getSession();
  if (session) return entrarNoSistema(session.user);
  mostrarLogin();
}

async function mostrarLogin(msg) {
  $("#appView").classList.add("hidden"); $("#loginView").classList.remove("hidden");
  if (msg) $("#loginMsg").innerHTML = `<div class="msg err">${esc(msg)}</div>`;
  try {
    const { data } = await sb.rpc("precisa_primeiro_acesso");
    $("#primeiroBox").classList.toggle("hidden", !data); $("#loginBox").classList.toggle("hidden", !!data);
  } catch (_) {}
  icons();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const b = $("#entrar"); b.disabled = true; $("#loginMsg").innerHTML = "";
  const { data, error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#senha").value });
  b.disabled = false;
  if (error) { $("#loginMsg").innerHTML = `<div class="msg err"><i data-lucide="alert-circle"></i>E-mail ou senha incorretos.</div>`; icons(); return; }
  entrarNoSistema(data.user);
});

$("#primeiroForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { acao: "primeiro_acesso", nome: $("#pNome").value.trim(), email: $("#pEmail").value.trim(), senha: $("#pSenha").value };
  const { data, error } = await sb.functions.invoke("usuarios", { body });
  const erro = error ? (await error.context?.json?.().catch(() => null))?.erro || error.message : data?.erro;
  if (erro) { $("#primeiroMsg").innerHTML = `<div class="msg err">${esc(erro)}</div>`; return; }
  const r = await sb.auth.signInWithPassword({ email: body.email, password: body.senha });
  if (r.error) return mostrarLogin(r.error.message);
  entrarNoSistema(r.data.user);
});

async function entrarNoSistema(user) {
  S.user = user;
  const perfil = await sb.from("perfis").select("*").eq("user_id", user.id).maybeSingle();
  if (!perfil.data || !perfil.data.ativo) { await sb.auth.signOut(); return mostrarLogin("Seu acesso não está ativo. Fale com a direção."); }
  S.perfil = perfil.data;
  const [esc_, mods] = await Promise.all([sb.from("escolas").select("*").order("nome"), sb.from("papel_modulos").select("*").eq("papel", S.perfil.papel)]);
  S.escolas = esc_.data || [];
  S.modulos = new Set((mods.data || []).map((m) => m.modulo));
  let salvo = ""; try { salvo = localStorage.getItem("ge.escola") || ""; } catch (_) {}
  S.escola = S.escolas.some((e) => e.id === salvo) ? salvo : (S.escolas.length === 1 ? S.escolas[0].id : "");

  $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  $("#quemNome").textContent = S.perfil.nome; $("#quemPerfil").textContent = PAPEL[S.perfil.papel] + (S.perfil.admin ? " · admin" : "");
  $("#avatar").textContent = iniciais(S.perfil.nome);
  const sel = $("#escolaSel");
  sel.innerHTML = (S.escolas.length > 1 ? `<option value="">${ehDirecao() ? "Visão conjunta (todas)" : "Todas as minhas escolas"}</option>` : "") + S.escolas.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join("");
  sel.value = S.escola;
  aplicarTema();
  // esconde o que o perfil não usa
  $$(".nav button[data-m]").forEach((b) => b.classList.toggle("hidden", !pode(b.dataset.m)));
  $$(".nav button[data-d]").forEach((b) => b.classList.toggle("hidden", !(ehDirecao() || S.perfil.admin)));
  try { if (localStorage.getItem("ge.menu") === "c") $(".shell").classList.add("collapsed"); } catch (_) {}
  render();
}

$("#escolaSel").addEventListener("change", (e) => { S.escola = e.target.value; try { localStorage.setItem("ge.escola", S.escola); } catch (_) {} aplicarTema(); render(); });

/* tema e logo conforme a escola escolhida no topo */
function aplicarTema() {
  const e = S.escolas.find((x) => x.id === S.escola);
  document.body.dataset.tema = e ? temaDe(e) : "";
  const box = $("#sideLogos");
  const lista = e ? [e] : S.escolas.filter((x) => x.logo);
  box.className = "brand-logos" + (lista.length > 1 ? " duas" : "");
  box.innerHTML = lista.map((x) => `<img src="${esc(x.logo || "")}" alt="${esc(x.nome)}">`).join("");
  $("#sideSub").textContent = e ? "Gestão Escolar" : "Gestão Escolar · visão conjunta";
}
$("#nav").addEventListener("click", (e) => { const b = e.target.closest("button[data-r]"); if (b) ir("#/" + b.dataset.r); });
$("#sair").onclick = async () => { await sb.auth.signOut(); S.perfil = null; document.body.dataset.tema = ""; location.hash = ""; mostrarLogin(); };
$("#recolher").onclick = () => { const c = $(".shell").classList.toggle("collapsed"); try { localStorage.setItem("ge.menu", c ? "c" : ""); } catch (_) {} };
$("#burger").onclick = () => $(".shell").classList.add("open");
$("#scrim").onclick = () => $(".shell").classList.remove("open");
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT" && S.perfil) { S.perfil = null; mostrarLogin(); } });

/* ---------- busca rápida global ---------- */
(() => {
  const inp = $("#gq"), box = $("#gres"); let timer, seq = 0, sel = -1, itens = [];
  const fechar = () => { box.classList.add("hidden"); sel = -1; };
  const abrir = (id) => { fechar(); inp.value = ""; ir("#/aluno/" + id); };
  inp.addEventListener("input", () => {
    clearTimeout(timer); const v = inp.value.trim();
    if (v.length < 2) return fechar();
    timer = setTimeout(async () => {
      const my = ++seq;
      const { data, error } = await sb.rpc("buscar", { q: v });
      if (my !== seq) return;
      itens = (data || []).filter((r) => !S.escola || r.escola_id === S.escola);
      if (error) { box.innerHTML = `<div class="empty-sm">${esc(erroAmigavel(error))}</div>`; }
      else if (!itens.length) box.innerHTML = `<div class="empty-sm">Nenhum aluno encontrado para “${esc(v)}”.</div>`;
      else {
        // homônimos: mostra nascimento e mãe para diferenciar
        const nomes = {}; itens.forEach((r) => (nomes[normal(r.nome)] = (nomes[normal(r.nome)] || 0) + 1));
        box.innerHTML = itens.map((r, i) => `<a data-i="${i}">
          <div class="avatar">${esc(iniciais(r.nome))}</div>
          <div style="min-width:0;flex:1"><div class="nm">${esc(r.nome)} ${r.ativo ? "" : '<span class="tag off">Inativo</span>'} ${nomes[normal(r.nome)] > 1 ? '<span class="tag warn">Homônimo</span>' : ""}</div>
          <div class="meta">${esc([r.escola, r.serie && `${r.serie}${r.turma ? " · " + r.turma : ""}`, r.ano_letivo, r.nascimento && "nasc. " + dataBR(r.nascimento)].filter(Boolean).join(" · "))}</div>
          <div class="meta">${esc(r.responsaveis || (r.mae ? "Mãe: " + r.mae : ""))}</div></div>
          ${r.status ? tag(STATUS_MAT, r.status) : ""}</a>`).join("");
      }
      box.classList.remove("hidden"); sel = -1; icons();
    }, 220);
  });
  box.addEventListener("mousedown", (e) => { const a = e.target.closest("a[data-i]"); if (a) { e.preventDefault(); abrir(itens[a.dataset.i].aluno_id); } });
  inp.addEventListener("keydown", (e) => {
    const as = $$("a[data-i]", box);
    if (e.key === "ArrowDown") { sel = Math.min(as.length - 1, sel + 1); } else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); }
    else if (e.key === "Enter" && as.length) { abrir(itens[Math.max(0, sel)].aluno_id); return; } else if (e.key === "Escape") { fechar(); inp.blur(); return; } else return;
    e.preventDefault(); as.forEach((a, i) => a.classList.toggle("sel", i === sel)); as[sel]?.scrollIntoView({ block: "nearest" });
  });
  inp.addEventListener("blur", () => setTimeout(fechar, 150));
  document.addEventListener("keydown", (e) => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); inp.focus(); } });
})();

iniciar();
