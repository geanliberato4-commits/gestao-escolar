-- Convênio com a Prefeitura: 10% nas mensalidades quando pelo menos um dos pais é servidor público.
-- matriculas.convenio_servidor: null = não; 'pai' | 'mae' | 'ambos' = sim (e quem é o servidor).
alter table public.matriculas add column if not exists convenio_servidor text
  check (convenio_servidor in ('pai','mae','ambos'));
alter table public.escolas add column if not exists convenio_servidor_pct numeric(5,2) not null default 10;

-- v_matriculas passa a expor a coluna (adicionada ao final)
create or replace view public.v_matriculas with (security_invoker = true) as
 SELECT m.id, m.aluno_id, m.escola_id, m.turma_id, m.ano_letivo, m.serie, m.periodo, m.hora_entrada, m.hora_saida, m.tipo, m.status,
    m.data_matricula, m.resp_financeiro_id, m.valor_mensalidade, m.num_parcelas, m.dia_vencimento, m.primeiro_vencimento,
    m.desconto_tipo, m.desconto_valor, m.desconto_motivo, m.aplica_desconto_irmao, m.condicoes_especiais, m.indicacao,
    m.indicador_nome, m.indicador_aluno_id, m.indicacao_obs, m.espera_id, m.matricula_anterior_id, m.motivo_encerramento,
    m.data_encerramento, m.obs, m.created_by, m.created_at, m.updated_at, m.valor_primeira_parcela, m.vencimento_primeira,
    m.valor_material, m.material_forma, m.turma2_id,
    a.nome AS aluno_nome, a.nascimento, a.familia_id, a.ativo AS aluno_ativo, t.nome AS turma_nome, e.nome AS escola_nome,
    r.nome AS resp_nome, ia.nome AS indicador_aluno_nome, t2.nome AS turma2_nome,
    m.cond_primeira, m.convenio_servidor
   FROM matriculas m
     JOIN alunos a ON a.id = m.aluno_id
     JOIN escolas e ON e.id = m.escola_id
     LEFT JOIN turmas t ON t.id = m.turma_id
     LEFT JOIN turmas t2 ON t2.id = m.turma2_id
     LEFT JOIN responsaveis r ON r.id = m.resp_financeiro_id
     LEFT JOIN alunos ia ON ia.id = m.indicador_aluno_id;

-- desconto das mensalidades: contrato + irmão + convênio servidor (acumula ou não conforme a escola)
create or replace function public._desc_regular(m public.matriculas) returns numeric
language plpgsql stable security definer set search_path to '' as $$
declare e public.escolas; a public.alunos; d1 numeric := 0; d2 numeric := 0; d3 numeric := 0; tem boolean; t numeric;
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
  if m.convenio_servidor is not null then
    d3 := round(m.valor_mensalidade * coalesce(e.convenio_servidor_pct, 10) / 100, 2);
  end if;
  t := case when e.descontos_acumulam then coalesce(d1,0) + coalesce(d2,0) + d3 else greatest(coalesce(d1,0), coalesce(d2,0), d3) end;
  return least(coalesce(t, 0), m.valor_mensalidade);
end $$;
revoke execute on function public._desc_regular(public.matriculas) from public, anon, authenticated;

-- recalcula o desconto das mensalidades FUTURAS ainda sem pagamento (ao ligar/desligar o convênio)
create or replace function public.recalcular_descontos(p_matricula uuid) returns integer
language plpgsql security definer set search_path to '' as $$
declare m public.matriculas; d numeric; n int;
begin
  select * into m from public.matriculas where id = p_matricula;
  if m.id is null then raise exception 'Matrícula não encontrada'; end if;
  if not public.app_ve_escola(m.escola_id) or not (public.app_pode('matricula') or public.app_pode('financeiro')) then
    raise exception 'Sem permissão'; end if;
  d := public._desc_regular(m);
  update public.parcelas p set desconto = d, valor = p.valor_bruto - d,
         obs = coalesce(p.obs || ' | ', '') || 'Desconto recalculado em ' || to_char(now(), 'DD/MM/YYYY')
   where p.matricula_id = m.id and p.status = 'aberta' and coalesce(p.valor_pago, 0) = 0
     and p.vencimento >= current_date and p.parte is null and p.valor_bruto = m.valor_mensalidade
     and not (p.numero = 1 and (coalesce(m.valor_primeira_parcela, 0) > 0 or m.cond_primeira is not null))
     and p.desconto is distinct from d;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.recalcular_descontos(uuid) to authenticated;

-- contratos: frase do convênio logo após a cláusula de valores (fica vazia quando não há convênio)
update public.modelos set conteudo = replace(conteudo, 'a partir do mês de {{financeiro.inicio_demais}}.</p>',
  'a partir do mês de {{financeiro.inicio_demais}}. {{financeiro.convenio_texto}}</p>')
 where conteudo like '%a partir do mês de {{financeiro.inicio_demais}}.</p>%';
update public.modelos set conteudo = replace(conteudo, '({{financeiro.dia_extenso}}) de cada mês.</p>',
  '({{financeiro.dia_extenso}}) de cada mês. {{financeiro.convenio_texto}}</p>')
 where conteudo like '%({{financeiro.dia_extenso}}) de cada mês.</p>%';
