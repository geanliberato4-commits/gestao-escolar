-- Condições especiais da 1ª parcela (desconto e/ou parcelamento só da 1ª; demais mensalidades intactas)
alter table public.matriculas add column if not exists cond_primeira jsonb;
alter table public.parcelas add column if not exists parte int, add column if not exists partes int;

create or replace view public.v_parcelas with (security_invoker = true) as
 SELECT p.id, p.matricula_id, p.aluno_id, p.escola_id, p.numero, p.descricao, p.vencimento, p.valor_bruto, p.desconto, p.valor,
    p.valor_pago, p.data_pagamento, p.forma_pagamento, p.status, p.boleto_emitido, p.boleto_data, p.boleto_situacao,
    p.nf_emitida, p.nf_numero, p.nf_data, p.obs, p.created_at, p.updated_at,
    CASE WHEN p.status = 'paga' THEN 'pago' WHEN p.status = 'cancelada' THEN 'cancelada'
         WHEN p.vencimento < CURRENT_DATE THEN 'atrasado' WHEN p.status = 'parcial' THEN 'parcial' ELSE 'pendente' END AS situacao,
    (GREATEST(p.valor - p.valor_pago, 0))::numeric(10,2) AS em_aberto,
    a.nome AS aluno_nome, a.familia_id, m.ano_letivo, m.serie, m.turma_id, t.nome AS turma_nome, r.nome AS resp_nome, e.nome AS escola_nome,
    p.parte, p.partes
   FROM parcelas p
     JOIN alunos a ON a.id = p.aluno_id
     JOIN matriculas m ON m.id = p.matricula_id
     JOIN escolas e ON e.id = p.escola_id
     LEFT JOIN turmas t ON t.id = m.turma_id
     LEFT JOIN responsaveis r ON r.id = m.resp_financeiro_id;

-- desconto normal (contrato + irmão) aplicado às mensalidades
create or replace function public._desc_regular(m public.matriculas) returns numeric
language plpgsql stable security definer set search_path to '' as $$
declare e public.escolas; a public.alunos; d1 numeric := 0; d2 numeric := 0; tem boolean; t numeric;
begin
  select * into e from public.escolas where id = m.escola_id;
  select * into a from public.alunos where id = m.aluno_id;
  d1 := case m.desconto_tipo when 'percentual' then round(m.valor_mensalidade * m.desconto_valor / 100, 2)
                             when 'valor' then m.desconto_valor else 0 end;
  if m.aplica_desconto_irmao then
    select exists(select 1 from public.matriculas mm join public.alunos aa on aa.id = mm.aluno_id
                   where aa.familia_id = a.familia_id and mm.aluno_id <> a.id
                     and mm.ano_letivo = m.ano_letivo and mm.status not in ('cancelada','transferida')) into tem;
    if tem then d2 := case e.desconto_irmao_tipo when 'percentual' then round(m.valor_mensalidade * e.desconto_irmao_valor / 100, 2)
                                                 else e.desconto_irmao_valor end; end if;
  end if;
  t := case when e.descontos_acumulam then d1 + d2 else greatest(d1, d2) end;
  return least(coalesce(t, 0), m.valor_mensalidade);
end $$;

-- gera a 1ª parcela (normal, com desconto especial, ou dividida em partes). Valida a soma.
create or replace function public._gerar_primeira(m public.matriculas, p_venc date, p_bruto numeric, p_desc numeric)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c jsonb := m.cond_primeira; modo text; orig numeric; desc_esp numeric := 0; fin numeric; n int; i int;
        pt jsonb; soma numeric := 0; d_i numeric; d_acc numeric := 0; v numeric;
begin
  modo := coalesce(c->>'modo', 'integral');
  if c is null or modo = 'integral' then
    insert into public.parcelas(matricula_id, aluno_id, escola_id, numero, descricao, vencimento, valor_bruto, desconto, valor)
    values (m.id, m.aluno_id, m.escola_id, 1, 'Parcela 1/' || m.num_parcelas || ' — ' || m.ano_letivo, p_venc, p_bruto, p_desc, p_bruto - p_desc);
    return null;
  end if;
  if modo not in ('desconto','parcelado','parcelado_desconto') then raise exception 'Condição especial inválida.'; end if;
  orig := round(coalesce((c->>'valor_original')::numeric, p_bruto - p_desc), 2);
  if orig <= 0 then raise exception 'Valor original da 1ª parcela inválido.'; end if;
  if modo in ('desconto','parcelado_desconto') then
    desc_esp := case c->>'desc_tipo' when 'percentual' then round(orig * coalesce((c->>'desc_valor')::numeric, 0) / 100, 2)
                                     else round(coalesce((c->>'desc_valor')::numeric, 0), 2) end;
    if desc_esp <= 0 or desc_esp > orig then raise exception 'Desconto da 1ª parcela inválido (deve ser maior que zero e até o valor original).'; end if;
  end if;
  fin := orig - desc_esp;

  if modo = 'desconto' then
    insert into public.parcelas(matricula_id, aluno_id, escola_id, numero, descricao, vencimento, valor_bruto, desconto, valor, obs)
    values (m.id, m.aluno_id, m.escola_id, 1, '1ª parcela 1/' || m.num_parcelas || ' — ' || m.ano_letivo || ' (condição especial)',
            coalesce((c->'partes'->0->>'vencimento')::date, p_venc), orig, desc_esp, fin, 'Condição especial: desconto na 1ª parcela');
  else
    n := coalesce(jsonb_array_length(c->'partes'), 0);
    if n < 2 or n > 12 then raise exception 'Parcelamento da 1ª parcela: informe de 2 a 12 pagamentos.'; end if;
    for i in 0 .. n - 1 loop
      pt := c->'partes'->i;
      if (pt->>'vencimento') is null or coalesce((pt->>'valor')::numeric, 0) <= 0 then
        raise exception 'Pagamento % da 1ª parcela sem vencimento ou valor.', i + 1; end if;
      soma := soma + round((pt->>'valor')::numeric, 2);
    end loop;
    if abs(soma - fin) > 0.009 then
      raise exception 'A soma dos pagamentos (R$ %) precisa ser igual ao valor final da 1ª parcela (R$ %).', replace(soma::text, '.', ','), replace(fin::text, '.', ',');
    end if;
    for i in 0 .. n - 1 loop
      pt := c->'partes'->i; v := round((pt->>'valor')::numeric, 2);
      d_i := case when i = n - 1 then desc_esp - d_acc else round(desc_esp * v / fin, 2) end; d_acc := d_acc + d_i;
      insert into public.parcelas(matricula_id, aluno_id, escola_id, numero, parte, partes, descricao, vencimento, valor_bruto, desconto, valor, forma_pagamento, obs)
      values (m.id, m.aluno_id, m.escola_id, 1, i + 1, n,
              '1ª parcela — pagamento ' || (i + 1) || '/' || n || ' — ' || m.ano_letivo, (pt->>'vencimento')::date,
              v + d_i, d_i, v, nullif(pt->>'forma', ''), 'Condição especial: 1ª parcela dividida em ' || n || 'x');
    end loop;
  end if;
  return jsonb_build_object('valor_original', orig, 'desconto', desc_esp, 'valor_final', fin);
end $$;
revoke execute on function public._gerar_primeira(public.matriculas, date, numeric, numeric) from public, anon, authenticated;
revoke execute on function public._desc_regular(public.matriculas) from public, anon, authenticated;

create or replace function public._venc_primeira(m public.matriculas) returns date language sql immutable set search_path to '' as $$
  select case when coalesce(m.valor_primeira_parcela, 0) > 0 then coalesce(m.vencimento_primeira, m.data_matricula)
    else (date_trunc('month', coalesce(m.primeiro_vencimento, make_date(m.ano_letivo, 1, coalesce(m.dia_vencimento, 10)))))::date
         + (least(coalesce(m.dia_vencimento, extract(day from coalesce(m.primeiro_vencimento, make_date(m.ano_letivo, 1, 10)))::int),
                  extract(day from (date_trunc('month', coalesce(m.primeiro_vencimento, make_date(m.ano_letivo, 1, 10))) + interval '1 month' - interval '1 day'))::int) - 1) end $$;

create or replace function public._cond_autorizada(m public.matriculas) returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if m.tipo = 'rematricula' and m.cond_primeira is not null and coalesce(m.cond_primeira->>'modo', 'integral') <> 'integral'
     and not (public.app_direcao() or public.app_admin()) then
    raise exception 'Condição especial na rematrícula precisa de autorização da direção/administração.';
  end if;
end $$;

create or replace function public.gerar_parcelas(p_matricula uuid, p_regerar boolean default false)
returns integer language plpgsql security definer set search_path to '' as $function$
declare
  m public.matriculas; desc_total numeric; base date; venc date; i int; k int; n_pagas int; primeira_sep boolean; res jsonb;
begin
  select * into m from public.matriculas where id = p_matricula;
  if m.id is null then raise exception 'Matrícula não encontrada'; end if;
  if not public.app_ve_escola(m.escola_id) or not (public.app_pode('matricula') or public.app_pode('financeiro')) then
    raise exception 'Sem permissão para gerar mensalidades';
  end if;
  if m.status in ('cancelada','transferida') then raise exception 'Matrícula encerrada'; end if;
  perform public._cond_autorizada(m);

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
  desc_total := public._desc_regular(m);
  primeira_sep := coalesce(m.valor_primeira_parcela, 0) > 0;
  base := coalesce(m.primeiro_vencimento, make_date(m.ano_letivo, 1, coalesce(m.dia_vencimento, 10)));
  for i in 1 .. m.num_parcelas loop
    if i = 1 then
      res := public._gerar_primeira(m, public._venc_primeira(m),
               case when primeira_sep then m.valor_primeira_parcela else m.valor_mensalidade end,
               case when primeira_sep then 0 else desc_total end);
      continue;
    end if;
    k := case when primeira_sep then i - 2 else i - 1 end;
    venc := (date_trunc('month', base) + make_interval(months => k))::date;
    venc := venc + (least(coalesce(m.dia_vencimento, extract(day from base)::int),
                          extract(day from (venc + interval '1 month' - interval '1 day'))::int) - 1);
    insert into public.parcelas(matricula_id, aluno_id, escola_id, numero, descricao, vencimento, valor_bruto, desconto, valor)
    values (m.id, m.aluno_id, m.escola_id, i, 'Parcela ' || i || '/' || m.num_parcelas || ' — ' || m.ano_letivo,
            venc, m.valor_mensalidade, desc_total, m.valor_mensalidade - desc_total);
  end loop;
  if res is not null then update public.matriculas set cond_primeira = cond_primeira || res where id = m.id; end if;
  return m.num_parcelas;
end $function$;

-- altera só a 1ª parcela de uma matrícula que já tem mensalidades (as demais não mudam)
create or replace function public.aplicar_condicao_primeira(p_matricula uuid, p_cond jsonb)
returns integer language plpgsql security definer set search_path to '' as $$
declare m public.matriculas; v1 date; primeira_sep boolean; res jsonb; n int;
begin
  select * into m from public.matriculas where id = p_matricula;
  if m.id is null then raise exception 'Matrícula não encontrada'; end if;
  if not public.app_ve_escola(m.escola_id) or not (public.app_pode('matricula') or public.app_pode('financeiro')) then
    raise exception 'Sem permissão para alterar a 1ª parcela'; end if;
  if m.status in ('cancelada','transferida') then raise exception 'Matrícula encerrada'; end if;
  if p_cond is not null and coalesce(p_cond->>'modo', 'integral') = 'integral' then p_cond := null; end if;
  m.cond_primeira := p_cond;
  perform public._cond_autorizada(m);
  update public.matriculas set cond_primeira = p_cond where id = m.id;

  if not exists(select 1 from public.parcelas where matricula_id = m.id and status <> 'cancelada') then return 0; end if;
  if exists(select 1 from public.parcelas where matricula_id = m.id and numero = 1 and status <> 'cancelada' and (status in ('paga','parcial') or valor_pago > 0)) then
    raise exception 'A 1ª parcela já tem pagamento registrado. Ajuste-a pelo Financeiro.'; end if;
  select min(vencimento) into v1 from public.parcelas where matricula_id = m.id and numero = 1 and status = 'aberta' and parte is null;
  update public.parcelas set status = 'cancelada', obs = coalesce(obs || ' | ', '') || 'Substituída por nova condição da 1ª parcela em ' || to_char(now(),'DD/MM/YYYY')
   where matricula_id = m.id and numero = 1 and status = 'aberta';
  primeira_sep := coalesce(m.valor_primeira_parcela, 0) > 0;
  res := public._gerar_primeira(m, coalesce(v1, public._venc_primeira(m)),
           case when primeira_sep then m.valor_primeira_parcela else m.valor_mensalidade end,
           case when primeira_sep then 0 else public._desc_regular(m) end);
  if res is not null then update public.matriculas set cond_primeira = cond_primeira || res where id = m.id; end if;
  select count(*) into n from public.parcelas where matricula_id = m.id and numero = 1 and status = 'aberta';
  return n;
end $$;
grant execute on function public.aplicar_condicao_primeira(uuid, jsonb) to authenticated;

-- (migração 14) v_matriculas passa a expor cond_primeira (coluna adicionada ao final da view)
-- (migração 15) Livro Caixa: descrição do lançamento indica o pagamento (pag. 1/3) da 1ª parcela dividida
