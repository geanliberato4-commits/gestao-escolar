-- =====================================================================
-- 02 — Funções de negócio, assinatura eletrônica e armazenamento
-- =====================================================================

-- Gera (ou regera) as mensalidades de uma matrícula.
-- Regerar CANCELA as parcelas em aberto (não apaga) e cria um conjunto novo.
create or replace function public.gerar_parcelas(p_matricula uuid, p_regerar boolean default false)
returns int language plpgsql security definer set search_path = '' as $$
declare
  m public.matriculas; e public.escolas; a public.alunos;
  d1 numeric := 0; d2 numeric := 0; desc_total numeric := 0;
  base date; venc date; i int; n_pagas int; tem_irmao boolean;
begin
  select * into m from public.matriculas where id = p_matricula;
  if m.id is null then raise exception 'Matrícula não encontrada'; end if;
  if not public.app_ve_escola(m.escola_id) or not (public.app_pode('matricula') or public.app_pode('financeiro')) then
    raise exception 'Sem permissão para gerar mensalidades';
  end if;
  if m.status in ('cancelada','transferida') then raise exception 'Matrícula encerrada'; end if;
  select * into e from public.escolas where id = m.escola_id;
  select * into a from public.alunos where id = m.aluno_id;

  if exists(select 1 from public.parcelas where matricula_id = m.id and status <> 'cancelada') then
    if not p_regerar then raise exception 'Esta matrícula já tem mensalidades. Use "Regerar".'; end if;
    select count(*) into n_pagas from public.parcelas where matricula_id = m.id and status in ('paga','parcial');
    if n_pagas > 0 then
      raise exception 'Há % parcela(s) com pagamento registrado. Ajuste as parcelas individualmente no Financeiro.', n_pagas;
    end if;
    update public.parcelas set status = 'cancelada', obs = coalesce(obs || ' | ', '') || 'Cancelada ao regerar em ' || to_char(now(),'DD/MM/YYYY')
     where matricula_id = m.id and status = 'aberta';
  end if;

  if m.num_parcelas < 1 or m.valor_mensalidade <= 0 then return 0; end if;

  d1 := case m.desconto_tipo when 'percentual' then round(m.valor_mensalidade * m.desconto_valor / 100, 2)
                             when 'valor' then m.desconto_valor else 0 end;
  if m.aplica_desconto_irmao then
    select exists(select 1 from public.matriculas mm join public.alunos aa on aa.id = mm.aluno_id
                   where aa.familia_id = a.familia_id and mm.aluno_id <> a.id
                     and mm.ano_letivo = m.ano_letivo and mm.status not in ('cancelada','transferida'))
      into tem_irmao;
    if tem_irmao then
      d2 := case e.desconto_irmao_tipo when 'percentual' then round(m.valor_mensalidade * e.desconto_irmao_valor / 100, 2)
                                       else e.desconto_irmao_valor end;
    end if;
  end if;
  desc_total := case when e.descontos_acumulam then d1 + d2 else greatest(d1, d2) end;
  desc_total := least(desc_total, m.valor_mensalidade);

  base := coalesce(m.primeiro_vencimento, make_date(m.ano_letivo, 2, coalesce(m.dia_vencimento, 10)));
  for i in 1 .. m.num_parcelas loop
    venc := (date_trunc('month', base) + make_interval(months => i - 1))::date;
    venc := venc + (least(coalesce(m.dia_vencimento, extract(day from base)::int),
                          extract(day from (venc + interval '1 month' - interval '1 day'))::int) - 1);
    insert into public.parcelas(matricula_id, aluno_id, escola_id, numero, descricao, vencimento,
                                valor_bruto, desconto, valor)
    values (m.id, m.aluno_id, m.escola_id, i,
            'Mensalidade ' || i || '/' || m.num_parcelas || ' — ' || m.ano_letivo,
            venc, m.valor_mensalidade, desc_total, m.valor_mensalidade - desc_total);
  end loop;
  return m.num_parcelas;
end $$;

-- Busca rápida global (respeita as permissões: roda com os direitos de quem chama)
create or replace function public.buscar(q text)
returns table(aluno_id uuid, nome text, nascimento date, ativo boolean, escola text, escola_id uuid,
              ano_letivo int, serie text, turma text, status text, mae text, responsaveis text, cpf text)
language sql stable security invoker set search_path = '' as $$
  with t as (select public.f_unaccent(lower(trim(q))) s, public.so_digitos(q) d)
  select a.id, a.nome, a.nascimento, a.ativo, e.nome, e.id, m.ano_letivo, m.serie, tu.nome, m.status, a.mae_nome,
         (select string_agg(r.nome, ', ') from public.responsaveis r where r.familia_id = a.familia_id),
         a.cpf
    from public.alunos a cross join t
    join public.escolas e on e.id = a.escola_id
    left join lateral (select mm.* from public.matriculas mm where mm.aluno_id = a.id
                        order by mm.ano_letivo desc, mm.created_at desc limit 1) m on true
    left join public.turmas tu on tu.id = m.turma_id
   where length(t.s) >= 2 and (
         public.f_unaccent(lower(a.nome)) like '%' || t.s || '%'
      or (length(t.d) >= 3 and public.so_digitos(a.cpf) like '%' || t.d || '%')
      or public.f_unaccent(lower(coalesce(a.mae_nome,'') || ' ' || coalesce(a.pai_nome,''))) like '%' || t.s || '%'
      or exists(select 1 from public.responsaveis r where r.familia_id = a.familia_id
                 and (public.f_unaccent(lower(r.nome)) like '%' || t.s || '%'
                      or (length(t.d) >= 3 and public.so_digitos(r.cpf) like '%' || t.d || '%')))
      or public.f_unaccent(lower(e.nome)) like '%' || t.s || '%'
      or public.f_unaccent(lower(coalesce(tu.nome,'') || ' ' || coalesce(m.serie,''))) like '%' || t.s || '%'
      or m.ano_letivo::text = t.s)
   order by a.ativo desc, a.nome
   limit 40
$$;

-- Irmãos de uma família (inclusive em outra escola), com o mínimo necessário
create or replace function public.familia_irmaos(p_familia uuid)
returns table(aluno_id uuid, nome text, escola text, ativo boolean, ano_letivo int, serie text, status text, acesso boolean)
language sql stable security definer set search_path = '' as $$
  select a.id, a.nome, e.nome, a.ativo, m.ano_letivo, m.serie, m.status, public.app_ve_escola(a.escola_id)
    from public.alunos a
    join public.escolas e on e.id = a.escola_id
    left join lateral (select mm.* from public.matriculas mm where mm.aluno_id = a.id
                        order by mm.ano_letivo desc, mm.created_at desc limit 1) m on true
   where a.familia_id = p_familia and public.app_ve_familia(p_familia)
   order by a.nascimento nulls last
$$;

-- Histórico de alterações de um registro (para quem enxerga o registro)
create or replace function public.historico(p_tabela text, p_id text)
returns table(em timestamptz, acao text, usuario_nome text, antes jsonb, depois jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare v_escola uuid;
begin
  if p_tabela = 'matriculas' then select escola_id into v_escola from public.matriculas where id::text = p_id;
  elsif p_tabela = 'alunos' then select escola_id into v_escola from public.alunos where id::text = p_id;
  elsif p_tabela = 'parcelas' then select escola_id into v_escola from public.parcelas where id::text = p_id;
  elsif p_tabela = 'contratos' then select escola_id into v_escola from public.contratos where id::text = p_id;
  else raise exception 'Tabela não suportada';
  end if;
  if v_escola is null or not public.app_ve_escola(v_escola) then raise exception 'Sem acesso'; end if;
  return query select x.em, x.acao, x.usuario_nome, x.antes, x.depois
                 from public.auditoria x where x.tabela = p_tabela and x.registro_id = p_id order by x.em desc;
end $$;

-- Primeiro acesso: existe algum usuário?
create or replace function public.precisa_primeiro_acesso() returns boolean
language sql stable security definer set search_path = '' as
$$ select not exists(select 1 from public.perfis) $$;

-- ---------------------------------------------------------------- assinatura eletrônica (link público)
create or replace function public.contrato_publico(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.contratos; r public.responsaveis; e public.escolas; a public.alunos;
begin
  select * into c from public.contratos where token = p_token;
  if c.id is null or c.status not in ('aguardando','assinado') then
    return jsonb_build_object('erro', 'Link inválido ou cancelado. Fale com a secretaria da escola.');
  end if;
  if c.status = 'aguardando' and c.token_expira is not null and c.token_expira < now() then
    return jsonb_build_object('erro', 'Este link expirou. Peça um novo link à secretaria.');
  end if;
  select * into e from public.escolas where id = c.escola_id;
  select * into a from public.alunos where id = c.aluno_id;
  select r2.* into r from public.matriculas m join public.responsaveis r2 on r2.id = m.resp_financeiro_id where m.id = c.matricula_id;
  return jsonb_build_object(
    'titulo', c.titulo, 'conteudo', c.conteudo, 'status', c.status, 'escola', e.nome,
    'aluno', a.nome, 'responsavel', r.nome,
    'cpf_final', case when length(public.so_digitos(r.cpf)) = 11 then right(public.so_digitos(r.cpf), 2) end,
    'exige_cpf', length(public.so_digitos(r.cpf)) = 11,
    'assinado_em', c.assinado_em, 'signatario', c.signatario_nome,
    'hash', c.conteudo_hash, 'codigo', c.codigo_verificacao, 'bloqueado', c.tentativas >= 5);
end $$;

create or replace function public.assinar_contrato(p_token uuid, p_nome text, p_cpf text, p_email text, p_aceite boolean, p_ua text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.contratos; r public.responsaveis; v_ip text; v_now timestamptz := now(); v_hash text; v_cod text; v_atual text;
begin
  select * into c from public.contratos where token = p_token for update;
  if c.id is null or c.status <> 'aguardando' then return jsonb_build_object('erro','Este contrato não está disponível para assinatura.'); end if;
  if c.token_expira is not null and c.token_expira < now() then return jsonb_build_object('erro','Este link expirou.'); end if;
  if c.tentativas >= 5 then return jsonb_build_object('erro','Link bloqueado por tentativas inválidas. Fale com a secretaria.'); end if;
  if not coalesce(p_aceite,false) then return jsonb_build_object('erro','É preciso marcar que leu e concorda com o contrato.'); end if;
  if length(trim(coalesce(p_nome,''))) < 5 then return jsonb_build_object('erro','Digite o nome completo.'); end if;

  select r2.* into r from public.matriculas m join public.responsaveis r2 on r2.id = m.resp_financeiro_id where m.id = c.matricula_id;
  if length(public.so_digitos(r.cpf)) = 11 and public.so_digitos(p_cpf) <> public.so_digitos(r.cpf) then
    update public.contratos set tentativas = tentativas + 1 where id = c.id;
    return jsonb_build_object('erro','O CPF não confere com o do responsável financeiro cadastrado. Restam ' || (4 - c.tentativas) || ' tentativa(s).');
  end if;

  -- integridade: o conteúdo continua igual ao que foi gerado
  v_atual := encode(extensions.digest(c.conteudo, 'sha256'), 'hex');
  if v_atual <> c.conteudo_hash then return jsonb_build_object('erro','Falha de integridade do documento. Fale com a secretaria.'); end if;

  v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for',
                               current_setting('request.headers', true)::json->>'x-real-ip', ''), ',', 1);
  v_hash := encode(extensions.digest(c.conteudo_hash || '|' || trim(p_nome) || '|' || public.so_digitos(p_cpf) || '|' ||
                                      to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || coalesce(v_ip,''), 'sha256'), 'hex');
  v_cod := upper(substr(v_hash, 1, 4) || '-' || substr(v_hash, 5, 4) || '-' || substr(v_hash, 9, 4));

  update public.contratos set
    status = 'assinado', signatario_nome = trim(p_nome), signatario_cpf = public.so_digitos(p_cpf),
    signatario_email = nullif(trim(p_email),''), assinado_em = v_now, assinatura_ip = v_ip,
    assinatura_ua = left(p_ua, 400), assinatura_hash = v_hash, codigo_verificacao = v_cod,
    evidencias = jsonb_build_object(
      'metodo','Assinatura eletrônica simples por link individual (Lei 14.063/2020, art. 4º, I)',
      'aceite','Li e concordo com todos os termos deste contrato',
      'ip', v_ip, 'navegador', left(p_ua, 400), 'data_hora_utc', v_now,
      'hash_documento_sha256', c.conteudo_hash, 'hash_assinatura_sha256', v_hash,
      'cpf_conferido_com_cadastro', length(public.so_digitos(r.cpf)) = 11,
      'link_enviado_em', c.enviado_em)
  where id = c.id;

  update public.matriculas set status = 'concluida'
   where id = c.matricula_id and status = 'aguardando_assinatura';

  return jsonb_build_object('ok', true, 'codigo', v_cod, 'assinado_em', v_now);
end $$;

-- ---------------------------------------------------------------- permissões de execução
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.contrato_publico(uuid) to anon;
grant execute on function public.assinar_contrato(uuid, text, text, text, boolean, text) to anon;
grant execute on function public.precisa_primeiro_acesso() to anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------- armazenamento de arquivos (privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

create or replace function public.app_ve_caminho(p text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return public.app_ve_escola(split_part(p, '/', 1)::uuid);
exception when others then return false;
end $$;

create policy docs_sel on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.app_ve_caminho(name));
create policy docs_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.app_ve_caminho(name));
create policy docs_del on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.app_ve_caminho(name) and public.app_pode('documentos'));

-- 04 — ajustes
revoke execute on function public.tg_auditoria() from authenticated;
revoke execute on function public.tg_contrato_protege() from authenticated;
revoke execute on function public.tg_updated_at() from authenticated;
