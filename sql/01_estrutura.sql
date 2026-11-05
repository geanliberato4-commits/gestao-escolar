-- =====================================================================
-- Sistema de Gestão Escolar — Estação Criança | Colégio MEF
-- 01 — Estrutura (tabelas, funções de permissão, segurança por linha)
-- =====================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.f_unaccent(text) returns text
language sql immutable parallel safe set search_path = '' as
$$ select extensions.unaccent('extensions.unaccent'::regdictionary, coalesce($1,'')) $$;

create or replace function public.so_digitos(text) returns text
language sql immutable parallel safe set search_path = '' as
$$ select regexp_replace(coalesce($1,''), '\D', '', 'g') $$;

-- ---------------------------------------------------------------- escolas
create table public.escolas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  razao_social text,
  cnpj text,
  endereco text,
  cidade text,
  telefone text,
  email text,
  cor text not null default '#2a5bd7',
  desconto_irmao_tipo text not null default 'percentual' check (desconto_irmao_tipo in ('percentual','valor')),
  desconto_irmao_valor numeric(10,2) not null default 0,
  descontos_acumulam boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- usuários e perfis
create table public.perfis (
  user_id uuid primary key references auth.users on delete cascade,
  nome text not null,
  email text,
  papel text not null check (papel in ('direcao','secretaria','financeiro')),
  admin boolean not null default false,          -- pode gerenciar usuários e permissões
  escolas uuid[] not null default '{}',          -- escolas que vê (direção vê todas)
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Quais módulos cada perfil pode alterar (configurável pela direção)
create table public.papel_modulos (
  papel text not null check (papel in ('direcao','secretaria','financeiro')),
  modulo text not null check (modulo in ('cadastro','matricula','financeiro','contratos','modelos','documentos','declaracoes','espera','turmas','relatorios')),
  primary key (papel, modulo)
);

create or replace function public.app_perfil() returns public.perfis
language sql stable security definer set search_path = '' as
$$ select p from public.perfis p where p.user_id = auth.uid() and p.ativo $$;

create or replace function public.app_ativo() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists(select 1 from public.perfis p where p.user_id = auth.uid() and p.ativo) $$;

create or replace function public.app_direcao() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists(select 1 from public.perfis p where p.user_id = auth.uid() and p.ativo and p.papel = 'direcao') $$;

create or replace function public.app_admin() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists(select 1 from public.perfis p where p.user_id = auth.uid() and p.ativo and p.admin) $$;

create or replace function public.app_ve_escola(e uuid) returns boolean
language sql stable security definer set search_path = '' as
$$ select exists(select 1 from public.perfis p
                 where p.user_id = auth.uid() and p.ativo
                   and (p.papel = 'direcao' or e = any(p.escolas))) $$;

create or replace function public.app_pode(m text) returns boolean
language sql stable security definer set search_path = '' as
$$ select exists(select 1 from public.perfis p
                 where p.user_id = auth.uid() and p.ativo
                   and (p.papel = 'direcao'
                        or exists(select 1 from public.papel_modulos pm where pm.papel = p.papel and pm.modulo = m))) $$;

create or replace function public.app_nome() returns text
language sql stable security definer set search_path = '' as
$$ select coalesce((select nome from public.perfis where user_id = auth.uid()), 'sistema') $$;

-- ---------------------------------------------------------------- famílias e responsáveis
create table public.familias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  obs text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.responsaveis (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias on delete cascade,
  nome text not null,
  parentesco text,
  cpf text,
  rg text,
  nascimento date,
  endereco text,
  telefone text,
  telefone2 text,
  email text,
  profissao text,
  obs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.responsaveis (familia_id);

-- ---------------------------------------------------------------- alunos
create table public.alunos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias on delete restrict,
  escola_id uuid not null references public.escolas,
  nome text not null,
  nascimento date,
  sexo text,
  cpf text,
  rg text,
  naturalidade text,
  nacionalidade text default 'Brasileira',
  cep text,
  endereco text,
  bairro text,
  cidade text,
  uf text,
  pai_nome text,
  mae_nome text,
  telefone text,
  obs text,
  ativo boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.alunos (escola_id);
create index on public.alunos (familia_id);

create or replace function public.app_ve_familia(f uuid) returns boolean
language sql stable security definer set search_path = '' as
$$ select public.app_direcao()
       or exists(select 1 from public.alunos a where a.familia_id = f and public.app_ve_escola(a.escola_id))
       or exists(select 1 from public.familias x where x.id = f and x.created_by = auth.uid()) $$;

-- ---------------------------------------------------------------- turmas
create table public.turmas (
  id uuid primary key default gen_random_uuid(),
  escola_id uuid not null references public.escolas,
  ano_letivo int not null,
  serie text not null,
  nome text not null,
  periodo text not null check (periodo in ('Manhã','Tarde','Integral','Noite')),
  hora_entrada time,
  hora_saida time,
  capacidade int not null default 20 check (capacidade >= 0),
  mensalidade_padrao numeric(10,2),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.turmas (escola_id, ano_letivo);

-- ---------------------------------------------------------------- lista de espera
create table public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  escola_id uuid not null references public.escolas,
  crianca_nome text not null,
  nascimento date,
  responsavel_nome text not null,
  telefone text,
  email text,
  turma_id uuid references public.turmas,
  serie text,
  periodo text,
  ano_pretendido int,
  data_inscricao date not null default current_date,
  status text not null default 'aguardando'
    check (status in ('aguardando','vaga_disponivel','contatado','em_matricula','matriculado','desistencia')),
  obs text,
  aluno_id uuid references public.alunos,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.espera_contatos (
  id uuid primary key default gen_random_uuid(),
  espera_id uuid not null references public.lista_espera on delete cascade,
  em timestamptz not null default now(),
  meio text,
  descricao text not null,
  usuario_nome text default public.app_nome(),
  created_by uuid default auth.uid()
);

-- ---------------------------------------------------------------- matrículas
create table public.matriculas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos on delete restrict,
  escola_id uuid not null references public.escolas,
  turma_id uuid references public.turmas,
  ano_letivo int not null,
  serie text not null,
  periodo text,
  hora_entrada time,
  hora_saida time,
  tipo text not null default 'nova' check (tipo in ('nova','rematricula')),
  status text not null default 'em_andamento'
    check (status in ('em_andamento','aguardando_documentos','aguardando_assinatura','concluida','rematricula_pendente','cancelada','transferida')),
  data_matricula date not null default current_date,
  resp_financeiro_id uuid references public.responsaveis,
  -- condições financeiras
  valor_mensalidade numeric(10,2) not null default 0,
  num_parcelas int not null default 12 check (num_parcelas between 0 and 24),
  dia_vencimento int check (dia_vencimento between 1 and 31),
  primeiro_vencimento date,
  desconto_tipo text not null default 'nenhum' check (desconto_tipo in ('nenhum','percentual','valor')),
  desconto_valor numeric(10,2) not null default 0,
  desconto_motivo text,
  aplica_desconto_irmao boolean not null default false,
  condicoes_especiais text,
  -- origem / indicação
  indicacao boolean not null default false,
  indicador_nome text,
  indicador_aluno_id uuid references public.alunos,
  indicacao_obs text,
  espera_id uuid references public.lista_espera,
  matricula_anterior_id uuid references public.matriculas,
  motivo_encerramento text,
  data_encerramento date,
  obs text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.matriculas (aluno_id);
create index on public.matriculas (escola_id, ano_letivo);
create index on public.matriculas (turma_id);
create unique index matricula_unica_ano on public.matriculas (aluno_id, ano_letivo)
  where status not in ('cancelada','transferida');

alter table public.lista_espera add column matricula_id uuid references public.matriculas;

-- ---------------------------------------------------------------- parcelas (mensalidades)
create table public.parcelas (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas on delete restrict,
  aluno_id uuid not null references public.alunos,
  escola_id uuid not null references public.escolas,
  numero int not null,
  descricao text,
  vencimento date not null,
  valor_bruto numeric(10,2) not null default 0,
  desconto numeric(10,2) not null default 0,
  valor numeric(10,2) not null default 0,
  valor_pago numeric(10,2) not null default 0,
  data_pagamento date,
  forma_pagamento text,
  status text not null default 'aberta' check (status in ('aberta','parcial','paga','cancelada')),
  boleto_emitido boolean not null default false,
  boleto_data date,
  boleto_situacao text,
  nf_emitida boolean not null default false,
  nf_numero text,
  nf_data date,
  obs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.parcelas (matricula_id);
create index on public.parcelas (escola_id, vencimento);
create index on public.parcelas (aluno_id);

-- ---------------------------------------------------------------- documentos digitais (arquivos)
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos on delete cascade,
  escola_id uuid not null references public.escolas,
  categoria text not null check (categoria in ('certidao','rg_cpf_aluno','docs_responsavel','comprovante_residencia','vacinacao','historico_transferencia','requerimento','contrato','contrato_assinado','declaracao','outro')),
  ano int not null default extract(year from now())::int,
  titulo text not null,
  path text not null,
  mime text,
  tamanho int,
  enviado_por text default public.app_nome(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.documentos (aluno_id);

create table public.doc_checklist (
  aluno_id uuid not null references public.alunos on delete cascade,
  item text not null check (item in ('certidao','rg_cpf_aluno','docs_responsavel','comprovante_residencia','vacinacao','historico_transferencia')),
  status text not null default 'pendente' check (status in ('entregue','pendente','nao_aplicavel')),
  obs text,
  updated_at timestamptz not null default now(),
  primary key (aluno_id, item)
);

-- ---------------------------------------------------------------- modelos (contratos, requerimentos, declarações)
create table public.modelos (
  id uuid primary key default gen_random_uuid(),
  escola_id uuid not null references public.escolas,
  tipo text not null check (tipo in ('contrato','requerimento','declaracao')),
  subtipo text not null default 'padrao',
  nome text not null,
  conteudo text not null,
  ativo boolean not null default true,
  updated_by text default public.app_nome(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- contratos
create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas on delete restrict,
  aluno_id uuid not null references public.alunos,
  escola_id uuid not null references public.escolas,
  modelo_id uuid references public.modelos,
  titulo text not null,
  conteudo text not null,
  conteudo_hash text,
  status text not null default 'rascunho' check (status in ('rascunho','aguardando','assinado','cancelado')),
  token uuid unique,
  token_expira timestamptz,
  enviado_em timestamptz,
  signatario_nome text,
  signatario_cpf text,
  signatario_email text,
  assinado_em timestamptz,
  assinatura_ip text,
  assinatura_ua text,
  assinatura_hash text,
  codigo_verificacao text,
  evidencias jsonb,
  tentativas int not null default 0,
  documento_id uuid references public.documentos on delete set null,
  cancelado_motivo text,
  gerado_por text default public.app_nome(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.contratos (matricula_id);
create index on public.contratos (aluno_id);

-- ---------------------------------------------------------------- documentos emitidos (requerimentos e declarações)
create table public.emissoes (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos on delete cascade,
  escola_id uuid not null references public.escolas,
  matricula_id uuid references public.matriculas,
  tipo text not null check (tipo in ('requerimento','declaracao')),
  subtipo text,
  titulo text not null,
  conteudo text not null,
  documento_id uuid references public.documentos on delete set null,
  emitido_por text default public.app_nome(),
  created_by uuid default auth.uid(),
  emitido_em timestamptz not null default now()
);
create index on public.emissoes (aluno_id);

-- ---------------------------------------------------------------- auditoria
create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  acao text not null,
  antes jsonb,
  depois jsonb,
  user_id uuid,
  usuario_nome text,
  em timestamptz not null default now()
);
create index on public.auditoria (tabela, registro_id);
create index on public.auditoria (em desc);

create or replace function public.tg_auditoria() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_id text; v_row jsonb;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, v_old->k), jsonb_object_agg(k, v_new->k) into v_old, v_new
      from jsonb_object_keys(to_jsonb(new)) k
     where (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k) and k <> 'updated_at';
    if v_new is null then return null; end if;
  end if;
  v_id := coalesce(v_row->>'id', v_row->>'user_id',
                   (v_row->>'aluno_id') || ':' || coalesce(v_row->>'item',''),
                   (v_row->>'papel') || ':' || coalesce(v_row->>'modulo',''));
  insert into public.auditoria(tabela, registro_id, acao, antes, depois, user_id, usuario_nome)
  values (tg_table_name, v_id, tg_op, v_old, v_new, auth.uid(), public.app_nome());
  return null;
end $$;

create or replace function public.tg_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['escolas','perfis','familias','responsaveis','alunos','turmas','lista_espera',
                           'matriculas','parcelas','doc_checklist','modelos','contratos'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_updated_at()', t||'_upd', t);
  end loop;
  foreach t in array array['escolas','perfis','papel_modulos','familias','responsaveis','alunos','turmas','lista_espera',
                           'matriculas','parcelas','documentos','doc_checklist','modelos','contratos','emissoes'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.tg_auditoria()', t||'_aud', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- contrato: integridade e imutabilidade
create or replace function public.tg_contrato_protege() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.conteudo_hash := encode(extensions.digest(new.conteudo, 'sha256'), 'hex');
    return new;
  end if;
  if old.status = 'assinado' then
    if (to_jsonb(new) - 'documento_id' - 'updated_at') <> (to_jsonb(old) - 'documento_id' - 'updated_at') then
      raise exception 'Contrato assinado não pode ser alterado. Gere um aditivo ou novo contrato.';
    end if;
  elsif old.status = 'cancelado' and new.status <> 'cancelado' then
    raise exception 'Contrato cancelado não pode ser reaberto. Gere um novo contrato.';
  elsif new.conteudo is distinct from old.conteudo then
    if old.status = 'aguardando' then
      raise exception 'O contrato já foi enviado para assinatura. Cancele o envio para editar.';
    end if;
    new.conteudo_hash := encode(extensions.digest(new.conteudo, 'sha256'), 'hex');
  end if;
  return new;
end $$;
create trigger contratos_protege before insert or update on public.contratos
  for each row execute function public.tg_contrato_protege();

-- ---------------------------------------------------------------- views
create view public.v_turmas with (security_invoker = true) as
select t.*,
       e.nome as escola_nome,
       coalesce(c.n, 0)::int as matriculados,
       (t.capacidade - coalesce(c.n, 0))::int as vagas
  from public.turmas t
  join public.escolas e on e.id = t.escola_id
  left join (select turma_id, count(*) n from public.matriculas
              where status not in ('cancelada','transferida') group by turma_id) c on c.turma_id = t.id;

create view public.v_parcelas with (security_invoker = true) as
select p.*,
       case when p.status = 'paga' then 'pago'
            when p.status = 'cancelada' then 'cancelada'
            when p.vencimento < current_date then 'atrasado'
            when p.status = 'parcial' then 'parcial'
            else 'pendente' end as situacao,
       greatest(p.valor - p.valor_pago, 0)::numeric(10,2) as em_aberto,
       a.nome as aluno_nome, a.familia_id,
       m.ano_letivo, m.serie, m.turma_id, t.nome as turma_nome,
       r.nome as resp_nome, e.nome as escola_nome
  from public.parcelas p
  join public.alunos a on a.id = p.aluno_id
  join public.matriculas m on m.id = p.matricula_id
  join public.escolas e on e.id = p.escola_id
  left join public.turmas t on t.id = m.turma_id
  left join public.responsaveis r on r.id = m.resp_financeiro_id;

create view public.v_matriculas with (security_invoker = true) as
select m.*, a.nome as aluno_nome, a.nascimento, a.familia_id, a.ativo as aluno_ativo,
       t.nome as turma_nome, e.nome as escola_nome, r.nome as resp_nome,
       ia.nome as indicador_aluno_nome
  from public.matriculas m
  join public.alunos a on a.id = m.aluno_id
  join public.escolas e on e.id = m.escola_id
  left join public.turmas t on t.id = m.turma_id
  left join public.responsaveis r on r.id = m.resp_financeiro_id
  left join public.alunos ia on ia.id = m.indicador_aluno_id;

-- ---------------------------------------------------------------- RLS
alter table public.escolas enable row level security;
alter table public.perfis enable row level security;
alter table public.papel_modulos enable row level security;
alter table public.familias enable row level security;
alter table public.responsaveis enable row level security;
alter table public.alunos enable row level security;
alter table public.turmas enable row level security;
alter table public.lista_espera enable row level security;
alter table public.espera_contatos enable row level security;
alter table public.matriculas enable row level security;
alter table public.parcelas enable row level security;
alter table public.documentos enable row level security;
alter table public.doc_checklist enable row level security;
alter table public.modelos enable row level security;
alter table public.contratos enable row level security;
alter table public.emissoes enable row level security;
alter table public.auditoria enable row level security;

-- escolas
create policy esc_sel on public.escolas for select to authenticated using (public.app_ve_escola(id));
create policy esc_upd on public.escolas for update to authenticated using (public.app_direcao()) with check (public.app_direcao());

-- perfis
create policy per_sel on public.perfis for select to authenticated using (user_id = auth.uid() or public.app_admin());
create policy per_upd on public.perfis for update to authenticated using (public.app_admin()) with check (public.app_admin());

-- papel_modulos
create policy pm_sel on public.papel_modulos for select to authenticated using (public.app_ativo());
create policy pm_ins on public.papel_modulos for insert to authenticated with check (public.app_admin());
create policy pm_del on public.papel_modulos for delete to authenticated using (public.app_admin());

-- famílias / responsáveis
create policy fam_sel on public.familias for select to authenticated using (created_by = auth.uid() or public.app_ve_familia(id));
create policy fam_ins on public.familias for insert to authenticated with check (public.app_pode('cadastro') or public.app_pode('matricula'));
create policy fam_upd on public.familias for update to authenticated using (public.app_ve_familia(id) and (public.app_pode('cadastro') or public.app_pode('matricula')));
create policy fam_del on public.familias for delete to authenticated using (public.app_direcao());

create policy resp_sel on public.responsaveis for select to authenticated using (public.app_ve_familia(familia_id));
create policy resp_ins on public.responsaveis for insert to authenticated with check (public.app_ve_familia(familia_id) and (public.app_pode('cadastro') or public.app_pode('matricula')));
create policy resp_upd on public.responsaveis for update to authenticated using (public.app_ve_familia(familia_id) and (public.app_pode('cadastro') or public.app_pode('matricula')));
create policy resp_del on public.responsaveis for delete to authenticated using (public.app_ve_familia(familia_id) and public.app_pode('cadastro'));

-- alunos
create policy alu_sel on public.alunos for select to authenticated using (public.app_ve_escola(escola_id));
create policy alu_ins on public.alunos for insert to authenticated with check (public.app_ve_escola(escola_id) and (public.app_pode('cadastro') or public.app_pode('matricula')));
create policy alu_upd on public.alunos for update to authenticated using (public.app_ve_escola(escola_id) and (public.app_pode('cadastro') or public.app_pode('matricula'))) with check (public.app_ve_escola(escola_id));
create policy alu_del on public.alunos for delete to authenticated using (public.app_direcao());

-- turmas
create policy tur_sel on public.turmas for select to authenticated using (public.app_ve_escola(escola_id));
create policy tur_ins on public.turmas for insert to authenticated with check (public.app_ve_escola(escola_id) and public.app_pode('turmas'));
create policy tur_upd on public.turmas for update to authenticated using (public.app_ve_escola(escola_id) and public.app_pode('turmas')) with check (public.app_ve_escola(escola_id));
create policy tur_del on public.turmas for delete to authenticated using (public.app_ve_escola(escola_id) and public.app_pode('turmas'));

-- lista de espera
create policy esp_sel on public.lista_espera for select to authenticated using (public.app_ve_escola(escola_id));
create policy esp_ins on public.lista_espera for insert to authenticated with check (public.app_ve_escola(escola_id) and (public.app_pode('espera') or public.app_pode('matricula')));
create policy esp_upd on public.lista_espera for update to authenticated using (public.app_ve_escola(escola_id) and (public.app_pode('espera') or public.app_pode('matricula'))) with check (public.app_ve_escola(escola_id));
create policy esp_del on public.lista_espera for delete to authenticated using (public.app_direcao());
create policy espc_sel on public.espera_contatos for select to authenticated using (exists(select 1 from public.lista_espera e where e.id = espera_id and public.app_ve_escola(e.escola_id)));
create policy espc_ins on public.espera_contatos for insert to authenticated with check (public.app_pode('espera') and exists(select 1 from public.lista_espera e where e.id = espera_id and public.app_ve_escola(e.escola_id)));

-- matrículas
create policy mat_sel on public.matriculas for select to authenticated using (public.app_ve_escola(escola_id));
create policy mat_ins on public.matriculas for insert to authenticated with check (public.app_ve_escola(escola_id) and public.app_pode('matricula'));
create policy mat_upd on public.matriculas for update to authenticated using (public.app_ve_escola(escola_id) and (public.app_pode('matricula') or public.app_pode('financeiro'))) with check (public.app_ve_escola(escola_id));
create policy mat_del on public.matriculas for delete to authenticated using (public.app_direcao());

-- parcelas
create policy par_sel on public.parcelas for select to authenticated using (public.app_ve_escola(escola_id) and (public.app_pode('financeiro') or public.app_pode('matricula') or public.app_pode('declaracoes')));
create policy par_ins on public.parcelas for insert to authenticated with check (public.app_ve_escola(escola_id) and public.app_pode('financeiro'));
create policy par_upd on public.parcelas for update to authenticated using (public.app_ve_escola(escola_id) and public.app_pode('financeiro')) with check (public.app_ve_escola(escola_id));

-- documentos
create policy doc_sel on public.documentos for select to authenticated using (public.app_ve_escola(escola_id));
create policy doc_ins on public.documentos for insert to authenticated with check (public.app_ve_escola(escola_id));
create policy doc_del on public.documentos for delete to authenticated using (public.app_ve_escola(escola_id) and public.app_pode('documentos'));

create policy chk_sel on public.doc_checklist for select to authenticated using (exists(select 1 from public.alunos a where a.id = aluno_id and public.app_ve_escola(a.escola_id)));
create policy chk_ins on public.doc_checklist for insert to authenticated
  with check ((public.app_pode('documentos') or public.app_pode('matricula')) and exists(select 1 from public.alunos a where a.id = aluno_id and public.app_ve_escola(a.escola_id)));
create policy chk_upd on public.doc_checklist for update to authenticated
  using ((public.app_pode('documentos') or public.app_pode('matricula')) and exists(select 1 from public.alunos a where a.id = aluno_id and public.app_ve_escola(a.escola_id)));

-- modelos
create policy mod_sel on public.modelos for select to authenticated using (public.app_ve_escola(escola_id));
create policy mod_ins on public.modelos for insert to authenticated with check (public.app_ve_escola(escola_id) and public.app_pode('modelos'));
create policy mod_upd on public.modelos for update to authenticated using (public.app_ve_escola(escola_id) and public.app_pode('modelos')) with check (public.app_ve_escola(escola_id));
create policy mod_del on public.modelos for delete to authenticated using (public.app_ve_escola(escola_id) and public.app_pode('modelos'));

-- contratos
create policy con_sel on public.contratos for select to authenticated using (public.app_ve_escola(escola_id));
create policy con_ins on public.contratos for insert to authenticated with check (public.app_ve_escola(escola_id) and (public.app_pode('contratos') or public.app_pode('matricula')));
create policy con_upd on public.contratos for update to authenticated using (public.app_ve_escola(escola_id) and (public.app_pode('contratos') or public.app_pode('matricula'))) with check (public.app_ve_escola(escola_id));
create policy con_del on public.contratos for delete to authenticated using (public.app_ve_escola(escola_id) and status = 'rascunho' and public.app_pode('contratos'));

-- emissões
create policy emi_sel on public.emissoes for select to authenticated using (public.app_ve_escola(escola_id));
create policy emi_ins on public.emissoes for insert to authenticated with check (public.app_ve_escola(escola_id) and (public.app_pode('declaracoes') or public.app_pode('matricula')));
create policy emi_upd on public.emissoes for update to authenticated using (public.app_ve_escola(escola_id)) with check (public.app_ve_escola(escola_id));

-- auditoria (somente leitura; escrita só por gatilho)
create policy aud_sel on public.auditoria for select to authenticated using (public.app_direcao() or user_id = auth.uid());

-- acesso pela API: só usuários logados (o anon não lê tabela nenhuma)
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.auditoria from authenticated;
