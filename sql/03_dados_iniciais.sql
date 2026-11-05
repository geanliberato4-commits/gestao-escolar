-- =====================================================================
-- 03 — Dados iniciais: escolas, permissões padrão, modelos e turmas de exemplo
-- (Modelos de contrato e declarações são SUGESTÕES: revisar com o jurídico.)
-- =====================================================================

insert into public.escolas (nome, cor) values
  ('Escola Estação Criança', '#2a5bd7'),
  ('Colégio MEF', '#0f8a6a');

insert into public.papel_modulos (papel, modulo) values
  ('secretaria','cadastro'), ('secretaria','matricula'), ('secretaria','contratos'),
  ('secretaria','documentos'), ('secretaria','declaracoes'), ('secretaria','espera'),
  ('secretaria','turmas'), ('secretaria','relatorios'),
  ('financeiro','financeiro'), ('financeiro','relatorios');

-- Modelos (um conjunto para cada escola)
do $mod$
declare e record;
begin
for e in select id from public.escolas loop

insert into public.modelos (escola_id, tipo, subtipo, nome, conteudo, updated_by) values
(e.id, 'requerimento', 'matricula', 'Requerimento de matrícula', $t$
<h2 style="text-align:center">REQUERIMENTO DE MATRÍCULA — ANO LETIVO {{matricula.ano_letivo}}</h2>
<p style="text-align:center">{{escola.nome}}{{escola.cnpj_texto}}<br>{{escola.endereco}}</p>
<h3>1. Dados do(a) aluno(a)</h3>
<table class="ficha">
<tr><td><b>Nome</b></td><td colspan="3">{{aluno.nome}}</td></tr>
<tr><td><b>Nascimento</b></td><td>{{aluno.nascimento}}</td><td><b>Sexo</b></td><td>{{aluno.sexo}}</td></tr>
<tr><td><b>CPF</b></td><td>{{aluno.cpf}}</td><td><b>RG</b></td><td>{{aluno.rg}}</td></tr>
<tr><td><b>Naturalidade</b></td><td>{{aluno.naturalidade}}</td><td><b>Nacionalidade</b></td><td>{{aluno.nacionalidade}}</td></tr>
<tr><td><b>Endereço</b></td><td colspan="3">{{aluno.endereco_completo}}</td></tr>
<tr><td><b>Mãe</b></td><td>{{aluno.mae}}</td><td><b>Pai</b></td><td>{{aluno.pai}}</td></tr>
</table>
<h3>2. Curso pretendido</h3>
<table class="ficha">
<tr><td><b>Série/ano</b></td><td>{{matricula.serie}}</td><td><b>Turma</b></td><td>{{matricula.turma}}</td></tr>
<tr><td><b>Período</b></td><td>{{matricula.periodo}}</td><td><b>Horário</b></td><td>{{matricula.horario}}</td></tr>
<tr><td><b>Tipo</b></td><td>{{matricula.tipo}}</td><td><b>Data</b></td><td>{{data.hoje}}</td></tr>
</table>
<h3>3. Responsáveis</h3>
{{responsaveis.tabela}}
<h3>4. Responsável financeiro</h3>
<p>{{responsavel.nome}}, {{responsavel.parentesco}}, CPF {{responsavel.cpf}}, RG {{responsavel.rg}}, telefone {{responsavel.telefone}}, e-mail {{responsavel.email}}.</p>
<p>Venho requerer a matrícula do(a) aluno(a) acima identificado(a) na série/ano indicado(a), declarando serem verdadeiras as informações prestadas.</p>
<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{responsavel.nome}}<br><small>Responsável</small></div><div>{{escola.nome}}<br><small>Secretaria</small></div></div>
$t$, 'sistema'),

(e.id, 'contrato', 'padrao', 'Contrato de prestação de serviços educacionais', $t$
<h2 style="text-align:center">CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS<br>ANO LETIVO {{matricula.ano_letivo}}</h2>
<p><b>CONTRATADA:</b> {{escola.razao_social}}{{escola.cnpj_texto}}, com sede em {{escola.endereco}}, doravante denominada ESCOLA.</p>
<p><b>CONTRATANTE:</b> {{responsavel.nome}}, {{responsavel.parentesco}}, CPF {{responsavel.cpf}}, RG {{responsavel.rg}}, nascido(a) em {{responsavel.nascimento}}, residente em {{responsavel.endereco}}, telefone {{responsavel.telefone}}, e-mail {{responsavel.email}}, doravante denominado(a) CONTRATANTE.</p>
<p><b>ALUNO(A):</b> {{aluno.nome}}, nascido(a) em {{aluno.nascimento}}, filho(a) de {{aluno.filiacao}}.</p>
<p><b>Demais responsáveis:</b> {{responsaveis.lista}}.</p>

<h3>CLÁUSULA 1ª — DO OBJETO</h3>
<p>Prestação de serviços educacionais ao(à) ALUNO(A) no ano letivo de {{matricula.ano_letivo}}, na série/ano <b>{{matricula.serie}}</b>, turma <b>{{matricula.turma}}</b>, período <b>{{matricula.periodo}}</b>, horário <b>{{matricula.horario}}</b>, conforme calendário escolar, proposta pedagógica e regimento interno da ESCOLA, que o(a) CONTRATANTE declara conhecer.</p>

<h3>CLÁUSULA 2ª — DO VALOR E DA FORMA DE PAGAMENTO</h3>
<p>Pelos serviços, o(a) CONTRATANTE pagará a anuidade de <b>{{financeiro.anuidade}}</b>, dividida em <b>{{financeiro.parcelas}}</b> parcela(s) mensal(is) de <b>{{financeiro.mensalidade}}</b>, com desconto de <b>{{financeiro.desconto}}</b> por parcela, resultando em parcelas de <b>{{financeiro.valor_parcela}}</b>, com vencimento todo dia <b>{{financeiro.dia_vencimento}}</b>, sendo o primeiro em {{financeiro.primeiro_vencimento}}.</p>
<p>{{financeiro.condicoes}}</p>
{{financeiro.tabela_parcelas}}

<h3>CLÁUSULA 3ª — DO ATRASO</h3>
<p>O atraso no pagamento sujeitará o(a) CONTRATANTE às penalidades previstas na legislação e no regimento da ESCOLA. <i>[Revisar: multa, juros e perda de desconto com o jurídico.]</i></p>

<h3>CLÁUSULA 4ª — DO CANCELAMENTO E DA TRANSFERÊNCIA</h3>
<p>O cancelamento ou a transferência deverá ser solicitado por escrito à secretaria. <i>[Revisar: regras de devolução e parcelas vincendas com o jurídico.]</i></p>

<h3>CLÁUSULA 5ª — DA PROTEÇÃO DE DADOS</h3>
<p>A ESCOLA tratará os dados pessoais do(a) ALUNO(A) e dos responsáveis exclusivamente para a execução deste contrato e o cumprimento de obrigações legais e educacionais, em conformidade com a Lei nº 13.709/2018 (LGPD), observando o melhor interesse da criança e do adolescente.</p>

<h3>CLÁUSULA 6ª — DO FORO</h3>
<p>Fica eleito o foro da comarca de {{escola.cidade}} para dirimir questões oriundas deste contrato.</p>

<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{responsavel.nome}}<br><small>CONTRATANTE</small></div><div>{{escola.nome}}<br><small>CONTRATADA</small></div></div>
$t$, 'sistema'),

(e.id, 'declaracao', 'matricula', 'Declaração de matrícula', $t$
<h2 style="text-align:center">DECLARAÇÃO DE MATRÍCULA</h2>
<p>Declaramos, para os devidos fins, que <b>{{aluno.nome}}</b>, nascido(a) em {{aluno.nascimento}}, filho(a) de {{aluno.filiacao}}, encontra-se regularmente matriculado(a) nesta instituição de ensino no ano letivo de <b>{{matricula.ano_letivo}}</b>, cursando <b>{{matricula.serie}}</b>, turma {{matricula.turma}}, no período {{matricula.periodo}} ({{matricula.horario}}).</p>
<p>Por ser verdade, firmamos a presente.</p>
<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{usuario.nome}}<br><small>{{escola.nome}}</small></div></div>
$t$, 'sistema'),

(e.id, 'declaracao', 'frequencia', 'Declaração de frequência', $t$
<h2 style="text-align:center">DECLARAÇÃO DE FREQUÊNCIA</h2>
<p>Declaramos, para os devidos fins, que <b>{{aluno.nome}}</b>, nascido(a) em {{aluno.nascimento}}, matriculado(a) em <b>{{matricula.serie}}</b>, turma {{matricula.turma}}, no ano letivo de {{matricula.ano_letivo}}, apresentou frequência de <b>{{campo.frequencia}}</b> no período de {{campo.periodo_referencia}}, conforme registros conferidos pela secretaria.</p>
<p>Por ser verdade, firmamos a presente.</p>
<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{usuario.nome}}<br><small>{{escola.nome}}</small></div></div>
$t$, 'sistema'),

(e.id, 'declaracao', 'quitacao', 'Declaração de quitação de mensalidades', $t$
<h2 style="text-align:center">DECLARAÇÃO DE QUITAÇÃO</h2>
<p>Declaramos, para os devidos fins, que as mensalidades escolares referentes ao(à) aluno(a) <b>{{aluno.nome}}</b>, no ano letivo de <b>{{matricula.ano_letivo}}</b>, sob responsabilidade financeira de {{responsavel.nome}} (CPF {{responsavel.cpf}}), encontram-se <b>integralmente quitadas</b> até a presente data, totalizando {{financeiro.total_pago}}.</p>
<p>Por ser verdade, firmamos a presente.</p>
<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{usuario.nome}}<br><small>{{escola.nome}}</small></div></div>
$t$, 'sistema'),

(e.id, 'declaracao', 'transferencia', 'Declaração de transferência', $t$
<h2 style="text-align:center">DECLARAÇÃO DE TRANSFERÊNCIA</h2>
<p>Declaramos, para os devidos fins, que <b>{{aluno.nome}}</b>, nascido(a) em {{aluno.nascimento}}, filho(a) de {{aluno.filiacao}}, esteve matriculado(a) nesta instituição no ano letivo de {{matricula.ano_letivo}}, cursando {{matricula.serie}}, e solicitou transferência nesta data, tendo direito a matricular-se em <b>{{campo.serie_destino}}</b>.</p>
<p>O histórico escolar será fornecido no prazo regimental.</p>
<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{usuario.nome}}<br><small>{{escola.nome}}</small></div></div>
$t$, 'sistema'),

(e.id, 'declaracao', 'escolaridade', 'Declaração de escolaridade', $t$
<h2 style="text-align:center">DECLARAÇÃO DE ESCOLARIDADE</h2>
<p>Declaramos, para os devidos fins, que <b>{{aluno.nome}}</b>, nascido(a) em {{aluno.nascimento}}, é aluno(a) desta instituição, cursando no ano letivo de {{matricula.ano_letivo}} a série/ano <b>{{matricula.serie}}</b>, no período {{matricula.periodo}}.</p>
<p>Por ser verdade, firmamos a presente.</p>
<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{usuario.nome}}<br><small>{{escola.nome}}</small></div></div>
$t$, 'sistema'),

(e.id, 'declaracao', 'personalizada', 'Declaração personalizada', $t$
<h2 style="text-align:center">DECLARAÇÃO</h2>
<p>Declaramos, para os devidos fins, que <b>{{aluno.nome}}</b>, nascido(a) em {{aluno.nascimento}}, matriculado(a) em {{matricula.serie}} no ano letivo de {{matricula.ano_letivo}}, {{campo.texto}}</p>
<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{usuario.nome}}<br><small>{{escola.nome}}</small></div></div>
$t$, 'sistema');

end loop;
end $mod$;

-- Turmas de EXEMPLO (2026 e 2027) — edite/apague em Turmas e vagas
insert into public.turmas (escola_id, ano_letivo, serie, nome, periodo, hora_entrada, hora_saida, capacidade, mensalidade_padrao)
select e.id, a.ano, s.serie, s.serie || ' ' || s.letra, s.periodo, s.ent::time, s.sai::time, s.cap, s.valor
  from public.escolas e
  cross join (values (2026), (2027)) a(ano)
  join (values
    ('Escola Estação Criança','Berçário','A','Integral','07:00','18:00',10,1650.00),
    ('Escola Estação Criança','Maternal I','A','Manhã','07:30','12:00',15,1150.00),
    ('Escola Estação Criança','Maternal II','A','Tarde','13:00','17:30',15,1150.00),
    ('Escola Estação Criança','Pré I','A','Manhã','07:30','12:00',18,1100.00),
    ('Escola Estação Criança','Pré II','A','Tarde','13:00','17:30',18,1100.00),
    ('Colégio MEF','1º ano','A','Manhã','07:15','12:15',25,1250.00),
    ('Colégio MEF','2º ano','A','Manhã','07:15','12:15',25,1250.00),
    ('Colégio MEF','3º ano','A','Tarde','13:00','18:00',25,1250.00),
    ('Colégio MEF','4º ano','A','Tarde','13:00','18:00',25,1300.00),
    ('Colégio MEF','5º ano','A','Manhã','07:15','12:15',25,1300.00)
  ) s(escola, serie, letra, periodo, ent, sai, cap, valor) on s.escola = e.nome;
