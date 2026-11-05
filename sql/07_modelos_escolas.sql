-- =====================================================================
-- 07 — Modelos reais das escolas (requerimento de reserva de matrícula
--      com Anexo I, e contrato de prestação de serviços educacionais).
--      Textos transcritos dos documentos enviados pela direção.
--      {{marcar campo: A | B}} imprime ( X ) na opção que corresponde ao dado.
-- =====================================================================
do $m$
declare
  ec uuid := (select id from public.escolas where nome = 'Escola Estação Criança');
  mef uuid := (select id from public.escolas where nome = 'Colégio MEF');
  req text; anexo text; con_ini text; con_fim text;
begin

req := $t$
<h2 class="titulo-doc">REQUERIMENTO DE RESERVA DE MATRÍCULA</h2>
<h3 class="secao">MODALIDADE E SÉRIE</h3>
<table class="ficha">
<tr><td class="r">Curso</td><td>{{matricula.curso}}</td><td class="r">Ano letivo</td><td>{{matricula.ano_letivo}}</td></tr>
<tr><td class="r">Série/Ano</td><td colspan="3">[[SERIES]]</td></tr>
<tr><td class="r">Período</td><td colspan="3">[[PERIODOS]] &nbsp;&nbsp; Entrada: <b>{{matricula.entrada}}</b> &nbsp; Saída: <b>{{matricula.saida}}</b></td></tr>
<tr><td class="r">Observações</td><td colspan="3">{{matricula.obs}}</td></tr>
</table>
<h3 class="secao">DADOS DO ALUNO</h3>
<table class="ficha">
<tr><td class="r">Nome completo</td><td>{{aluno.nome}}</td><td class="r">Nascimento</td><td>{{aluno.nascimento}}</td></tr>
<tr><td class="r">Nome do pai</td><td colspan="3">{{aluno.pai}}</td></tr>
<tr><td class="r">Nome da mãe</td><td colspan="3">{{aluno.mae}}</td></tr>
<tr><td class="r">Endereço</td><td>{{aluno.endereco}}</td><td class="r">Bairro</td><td>{{aluno.bairro}}</td></tr>
<tr><td class="r">Cidade</td><td>{{aluno.cidade}}</td><td class="r">CEP</td><td>{{aluno.cep}}</td></tr>
<tr><td class="r">E-mail</td><td colspan="3">{{aluno.email}}</td></tr>
<tr><td class="r">Telefones</td><td colspan="3">{{aluno.telefones}}</td></tr>
</table>
<h3 class="secao">RESPONSÁVEL FINANCEIRO</h3>
<table class="ficha">
<tr><td class="r">Parentesco</td><td>{{responsavel.parentesco}}</td><td class="r">Nome completo</td><td>{{responsavel.nome}}</td></tr>
<tr><td class="r">RG</td><td>{{responsavel.rg}}</td><td class="r">CPF</td><td>{{responsavel.cpf}}</td></tr>
<tr><td class="r">Data de nasc.</td><td>{{responsavel.nascimento}}</td><td class="r">Bairro</td><td>{{responsavel.bairro}}</td></tr>
<tr><td class="r">Endereço</td><td colspan="3">{{responsavel.endereco}}</td></tr>
<tr><td class="r">Cidade</td><td>{{responsavel.cidade}}</td><td class="r">CEP</td><td>{{responsavel.cep}}</td></tr>
<tr><td class="r">E-mail</td><td colspan="3">{{responsavel.email}}</td></tr>
<tr><td class="r">Telefones</td><td colspan="3">{{responsavel.telefones}}</td></tr>
</table>
<h3 class="secao">PLANO DE PAGAMENTO DO MATERIAL DIDÁTICO</h3>
<table class="ficha">
<tr><td class="r">Valor do material didático</td><td>{{financeiro.material}}</td><td class="r">Forma de pagamento</td><td>{{financeiro.material_forma}}</td></tr>
</table>
<h3 class="secao">PLANO DE PAGAMENTO DO CUSTO DO CURSO</h3>
<table class="ficha">
<tr><td class="r">Valor do curso</td><td>{{financeiro.valor_curso}}</td><td class="r">Valor da 1ª parcela</td><td>{{financeiro.primeira_parcela_bruta}}</td></tr>
<tr><td class="r">Valor das demais parcelas</td><td>{{financeiro.mensalidade}}</td><td class="r">Nº total de parcelas (incluindo a 1ª)</td><td>{{financeiro.parcelas}}, vencimento todo dia {{financeiro.dia_vencimento}}</td></tr>
<tr><td class="r">Meses do parcelamento</td><td colspan="3">{{financeiro.meses}}</td></tr>
<tr><td class="r">Condição especial</td><td colspan="3">{{financeiro.condicoes}}</td></tr>
<tr><td class="r">Valor do curso (condição especial)</td><td>{{financeiro.cond_valor_curso}}</td><td class="r">1ª parcela / demais</td><td>{{financeiro.cond_primeira}} / {{financeiro.cond_demais}}</td></tr>
</table>
<p style="text-align:right;margin-top:6px"><b>Atendente:</b> {{usuario.nome}}</p>
<h3 class="secao">DECLARAÇÃO</h3>
<p>Declaro estar ciente dos seguintes itens abaixo:</p>
<p>1º - Somente haverá devolução parcial da TAXA DE RESERVA, caso o cancelamento da reserva seja efetivado FORMALMENTE (por escrito), pelo responsável legal, até 7 (sete) dias antes do início das aulas, na secretaria desta instituição escolar, havendo retenção de 30% para custeio de despesas administrativas. Após esta data, a referida taxa não será devolvida em hipótese alguma, mesmo em caso de reserva feita após a mesma;</p>
<p>2º - A escola adota uniforme completo para os níveis de Educação Infantil e Ensino Fundamental.</p>
<p>3º - O responsável declara estar ciente da necessidade da compra do Material Didático;</p>
<p>4º - Ao assinar o presente, o aluno submete-se ao Regimento Escolar, a Proposta Pedagógica e as demais obrigações constantes no Contrato de Prestação de Serviços e na legislação aplicável à área de ensino e, ainda, as emanadas de outras fontes legais, desde que regulem, supletivamente a matéria;</p>
<p>5º - A efetivação da Matrícula fica condicionada a aprovação da Direção Pedagógica/Administrativa e a aprovação do(a) aluno(a) para a série/ano/módulo requerido.</p>
<p>6º - O Requerimento de Matrícula e o Anexo I são partes integrantes do Contrato de Prestação de Serviços.</p>
<p>Por ser verdade, firmo o presente.</p>
<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{responsavel.nome}}<br><small>Assinatura do responsável</small></div></div>
$t$;

anexo := $t$
<div class="quebra"></div>
<h2 class="titulo-doc">ANEXO I</h2>
<p>Este anexo é parte integrante do contrato de prestação de serviços educacionais, celebrado entre a {{escola.razao_social}}, devidamente inscrita no C.N.P.J. sob o nº {{escola.cnpj}}, entidade mantenedora do Colégio, sito à {{escola.endereco}}, e o responsável pelo aluno, que tem justo e contratado a fixação do Valor Total das Anuidades Escolares e demais dispositivos legais do contrato acima mencionado.</p>
<p><b>CLÁUSULA 2ª</b> Em contraprestação pelos serviços educacionais prestados na vigência do presente contrato, conforme previsto na, o CONTRATANTE pagará à CONTRATADA a anuidade, devendo tais pagamentos ser realizados até o vencimento, em qualquer Banco e após, somente no Banco autorizado, conforme consta nos boletos enviados.</p>
<p><b>Parágrafo 1º</b> - A falta de pagamento de qualquer parcela, até a data do vencimento, constituirá de pleno direito, em mora ao CONTRATANTE, e implicará no acréscimo de multa de 10% (dez por cento), mais juros de 1% (um por cento) ao mês e atualização monetária do débito total, além da perda de qualquer desconto, se houver.</p>
<p><b>Parágrafo 2º</b> - Eventual abatimento, desconto ou redução no valor da parcela da anuidade, quando ocorrer, só tem validade para pagamento até a data de vencimento pactuada, sendo que, após, voltará ao seu valor normal para a série em questão, acrescido de juros e multa, constituindo ainda, mera liberdade da CONTRATADA, que não implicará em novação e poderá ser suprimido a qualquer tempo, sem qualquer notificação judicial ou extrajudicial.</p>
<p><b>Parágrafo 3º</b> - Se um eventual inadimplemento das parcelas, ou qualquer obrigação de pagamento decorrente em mora Contrato, perdurar por mais de 30 (trinta) dias, imediatamente fica a CONTRATANTE interpelada em mora, podendo a CONTRATADA providenciar a cobrança Extrajudicial através de escritório especializado, onde a CONTRATANTE arcara com os honorários, bem como sua inscrição em Cadastro ou Serviços de Proteção aos Créditos legalmente permitidos, caso em que a CONTRATANTE deverá arcar com todos às custas necessárias para com o eventual processo judicial, bem como honorários advocatícios no importe de 20 % (vinte por cento), nos termos do artigo 6º da Lei 9.870/99; artigos 475, 476, e 477 da Lei 10.406/02 e artigo 43 § 2º da Lei 8.078/90.</p>
<p><b>Parágrafo 4º</b> A CONTRATADA poderá em qualquer tempo negociar junto a Instituição Financeira e Cooperativa de Crédito os títulos da CONTRATANTE desde já por este autorizado.</p>
<p><b>Parágrafo 5º</b> - O não Comparecimento do aluno aos atos escolares ora contratados não exime do pagamento das prestações, tendo em vista a disponibilidade do serviço colocado ao contratante.</p>
<p><b>Parágrafo 6º</b> - Em caso de discussão administrativa ou judicial, no todo ou em parte, sobre as condições deste instrumento o CONTRATANTE compromete-se a pagar o valor estabelecido nesta cláusula até a decisão final.</p>
<p><b>Parágrafo 8º</b> A “Contratada” poderá conceder descontos para pagamentos antecipados à data do vencimento normal das parcelas, bem como a título de bolsa especial a seu exclusivo critério e forma.</p>
<p><b>CLÁUSULA 3ª</b> - O valor da anuidade, deste contrato não inclui serviços relativos à segunda chamada, serviços de recuperação (reforço, apoio pedagógico, e prova), adaptação, transporte escolar, exames especiais, atividades de frequência facultativa, uniforme, lanche e o fornecimento de material didático (apostilas, livros e etc.), material de uso coletivo, carteira de identificação do aluno, e também aqueles que não integrem a rotina do cotidiano educacional, os quais terão os valores especificados em documento próprio junto à tesouraria do Colégio CONTRATADO.</p>
<p><b>CLÁUSULA 8ª</b> - A CONTRATADA deferirá eventual requerimento de cancelamento de matrícula ou transferência do aluno em dia com as mensalidades escolares, obedecidas as normas legais e regimentais pertinentes, sendo que:</p>
<p>I – Se o requerimento de cancelamento de matrícula for protocolado até 7 (sete) dias que antecede o início das aulas do ano letivo, a CONTRATADA fará a retenção do valor equivalente a 30% da primeira parcela paga, devolvendo ao CONTRATANTE o saldo do valor restante, servindo os percentuais retidos para cobrir custos operacionais e gastos com processo de matrícula;</p>
<p><b>CLÁUSULA 10ª</b> - Fica o CONTRATANTE ciente de que, se por algum motivo, no curso da vigência do presente contrato, venha ocorrer a substituição dos responsável financeiro do aluno, esta deverá se dar formalmente ou por determinação judicial, quando se fizer necessário e ainda, havendo a separação conjugal dos pais do aluno beneficiário do presente, a contratada deverá ser formalmente comunicada sobre as ocorrências do evento, bem como a quem coube a guarda, e as demais informações complementares sobre a retirada do(a) aluno(a) do Colégio. O mesmo se aplica à eventual mudança de endereço, que deverá ser comunicada no prazo máximo de 30 (trinta) dias.</p>
<p><b>CLÁUSULA 11ª</b> - O CONTRATANTE desde já autoriza a CONTRATADA a utilizar o nome, a voz e a imagem do(a) aluno(a), na divulgação por qualquer meio de comunicação, para fins comerciais, das atividades da CONTRATADA, bem como de quaisquer eventos educacionais e concurso de que o(a) Aluno(a) participar, durante a vigência deste instrumento.</p>
<p><b>CLÁUSULA 15ª</b> – Fica desde já ciente o CONTRATANTE de que é responsável pelos prejuízos que o (a) ALUNO (A) vier causar à CONTRATADA ou a TERCEIROS, decorrentes de danos pessoais, morais ou materiais nas instalações ou em atividades educacionais fora dela.</p>
<p><b>CLÁUSULA 16ª</b> – O presente contrato terá a duração desde a data de sua assinatura até 30 de dezembro do mesmo ano, valendo para o respectivo ano letivo.</p>
<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{responsavel.nome}}<br><small>Assinatura do Responsável Financeiro</small></div></div>
<p class="rodape-escola">{{escola.nome}} - CNPJ {{escola.cnpj}} / Inscrição Estadual Isenta<br>{{escola.endereco}} – Fone: {{escola.telefone}}</p>
$t$;

con_ini := $t$
<h2 class="titulo-doc">CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS</h2>
<p>Pelo presente instrumento particular de contrato de prestação de serviços educacionais, o CONTRATANTE: <b>{{responsavel.nome}}</b>, RG {{responsavel.rg}} SSP/SP, CPF {{responsavel.cpf}}, residente na {{responsavel.endereco}}, {{responsavel.bairro}}, em {{responsavel.cidade}}, responsável pelo(a) aluno(a) <b>{{aluno.nome}}</b>, conforme Ficha de Cadastro de Matrícula e de outro lado como CONTRATADA – {{escola.razao_social}} (mantenedora) devidamente inscrita no C.N.P.J. nº {{escola.cnpj}} com sede na {{escola.endereco}}, neste ato representada pela sua representante legal, firmam o presente contrato à vista do que dispõe as legislações aplicáveis, mediante cláusulas e condições a seguir especificadas e a cujo cumprimento se obrigam mutuamente:</p>
<p><b>Cláusula 1ª</b> – O objeto deste contrato é a prestação de serviços educacionais pela CONTRATADA, ao (à) aluno (a) indicado (a) pelo CONTRATANTE na ficha de cadastro de matrícula, para o período <b>{{matricula.periodo}}</b> ({{matricula.entrada}} às {{matricula.saida}}) do ano letivo de <b>{{matricula.ano_letivo}}</b> conforme previsto no Calendário Escolar.</p>
<p><b>Cláusula 2ª</b> - A CONTRATADA tem sua proposta pedagógica orientada para os seguintes objetivos:</p>
$t$;

con_fim := $t$
<p>Visar o desenvolvimento integral da criança nos aspectos biológicos, psicológicos e cognitivos e afetivos necessário ao seu bom desempenho.</p>
<p>Criar condições para que a criança vivencie experiências que favoreçam o desenvolvimento harmonioso de sua personalidade.</p>
<p>Tornar possível a aquisição de comportamentos básicos à eficiência da aprendizagem formal.</p>
<p>Levar a criança à aquisição de hábitos e atitudes favoráveis ao trabalho cooperativo e a frequência regular à escola.</p>
<p>Desenvolver a criatividade, especialmente como elemento de autoexpressão.</p>
<p>Estimular a criança à conduta independente através do desenvolvimento da autoconfiança e da iniciativa.</p>
<p>Enfatizar a alfabetização da criança através da construção da língua escrita, relacionando letras e sons.</p>
<p>Visar o desenvolvimento do raciocínio lógico, matemático e o domínio da quantidade numérica através de projetos e situações problema.</p>
<p><b>§ 1º:</b> Fazem parte integrante do presente contrato a proposta pedagógica e o formulário de cadastro, com os quais o CONTRATANTE concorda, sendo de exclusiva competência e responsabilidade da CONTRATADA a orientação técnica e pedagógica decorrente da prestação dos serviços educacionais.</p>
[[CL3]]
<p><b>CLÁUSULA 4ª:</b> Ao firmar o presente, o CONTRATANTE submete-se à proposta pedagógica e às demais obrigações constantes na legislação aplicável à área de ensino e ainda, as emanadas de outras fontes legais, desde que regulem supletivamente a matéria.</p>
<p><b>CLÁUSULA 5ª:</b> [[UNIFORME]] A CONTRATADA se reserva o direito de impedir o acesso às dependências da escola os alunos que não estejam devidamente uniformizados.</p>
<p><b>CLÁUSULA 6ª:</b> O não comparecimento do aluno aos atos escolares ora contratados não exime o pagamento, tendo em vista a disponibilidade do serviço colocado ao CONTRATANTE.</p>
<p><b>CLÁUSULA 7ª:</b> O presente instrumento poderá ser rescindido por iniciativa do CONTRATANTE (configurando cancelamento de matrícula) mediante requerimento escrito junto à CONTRATADA com 30 (trinta) dias de antecedência, caso não ocorra a comunicação formal com antecedência o CONTRATANTE pagará multa de 1 (uma) mensalidade.</p>
<p><b>§ único:</b> Para efetivação da rescisão que trata esta cláusula, o CONTRATANTE deverá estar quite com suas obrigações financeiras até o mês da rescisão, inclusive.</p>
<p><b>CLÁUSULA 8ª</b> O presente contrato poderá ser rescindido pela CONTRATADA por desligamento nos termos do Regimento Escolar ou por rescisão na forma mencionada nas cláusulas anteriores.</p>
<p><b>CLÁUSULA 9ª</b> O CONTRATANTE obriga-se a comunicar a CONTRATADA seu novo endereço residencial sempre que houver alteração dos mesmos.</p>
<p><b>CLÁUSULA 10ª:</b> A CONTRATADA, livre de quaisquer ônus para com o CONTRATANTE/ALUNO, poderá utilizar-se da sua imagem para fins exclusivos de divulgação da escola e suas atividades podendo, para tanto, reproduzi-la ou divulgá-la na internet, jornais e todos os meios de comunicação, público ou privado.</p>
<p><b>CLÁUSULA 11ª</b> Na hipótese de ocorrência de separação judicial/divórcio ou outra forma de determinação judicial que ocorra na substituição de sua condição de responsável legal, o CONTRATANTE, expressamente, se obriga a comunicar tal fato à CONTRATADA e a dar-lhe substituto idôneo por meio de documento legal a ser protocolado na Secretaria da escola em 30 dias, sob pena de permanecer sua responsabilidade até o final do presente contrato.</p>
<p><b>CLÁUSULA 12ª</b> O CONTRATANTE assume total responsabilidade quanto às declarações prestadas neste contrato e no ato da matrícula, concordando desde já, que a não entrega dos documentos legais comprobatórios das declarações prestadas, até 3 (três) dias úteis, antes do início da criança na escola, acarretará o automático cancelamento da vaga aberta para o aluno, rescindindo-se o presente contrato, isentando a CONTRATADA de qualquer responsabilidade.</p>
<p><b>§ 1º</b> Sempre que houver, por parte da CONTRATADA, a suspeita de sintomas de doença infectocontagiosa na criança, o CONTRATANTE será imediatamente informado do fato e deverá no menor tempo possível retirar a criança da escola, só podendo retornar mediante apresentação de atestado médico autorizando sua volta à escola e ao convívio das demais crianças. A não observação deste parágrafo poderá levar ao cancelamento de sua matrícula.</p>
<p><b>§ 2º</b> É de responsabilidade do CONTRATANTE informar a CONTRATADA de toda e qualquer ocorrência de doença infectocontagiosa com o aluno ou entre seus familiares que convivem sob o mesmo teto, mantendo a criança fora da escola, protegendo assim a integridade de seus colegas.</p>
<p><b>§ 3º</b> A CONTRATADA não medicará a criança sem orientação médica e do CONTRATANTE. Sempre que a criança apresentar algum sintoma de doença o CONTRATANTE será imediatamente avisado para as devidas providências.</p>
[[P4]]
<p>Fica eleito o foro da Comarca de Cosmópolis para dirimir questões oriundas da execução do presente contrato.</p>
<p>Por estarem assim justos e contratados de pleno acordo com todas as condições, assinam o presente instrumento particular em duas vias de igual teor e forma, na presença das testemunhas abaixo.</p>
<p style="text-align:right">{{escola.cidade}}, {{data.extenso}}.</p>
<div class="assinaturas"><div>{{responsavel.nome}}<br><small>CONTRATANTE</small></div><div>{{escola.razao_social}}<br><small>[[ASSIN_ESCOLA]]</small></div></div>
<div class="assinaturas"><div>Testemunha<br><small>Nome / CPF</small></div><div>Testemunha<br><small>Nome / CPF</small></div></div>
$t$;

-- ---------------- Estação Criança
update public.modelos set nome = 'Requerimento de reserva de matrícula', updated_by = 'sistema',
  conteudo = replace(replace(req, '[[SERIES]]', '{{marcar matricula.serie: Berçário 1 | Berçário 2 | Maternal 1 | Maternal 2}}'),
                     '[[PERIODOS]]', '{{marcar matricula.periodo: Manhã | Tarde | Integral}}') || anexo
 where escola_id = ec and tipo = 'requerimento';

update public.modelos set nome = 'Contrato de prestação de serviços educacionais', updated_by = 'sistema',
  conteudo = con_ini || $t$
<p>{{marcar matricula.serie: Berçário 1 | Berçário 2 | Maternal 1 | Maternal 2}}</p>
<p>Planejar, aplicar e monitorar variadas atividades capazes de estimular a exploração dos sentidos, construir a motricidade e a linguagem propondo desenvolver todas as necessidades da criança nos aspectos físicos, nutricionais, saúde, higiene, psicomotores, cognitivos e emocionais.</p>
<p>Nossa equipe é capacitada e orientada para propiciar momentos significativos de aprendizagem.</p>
<p>O dia-a-dia é vivido através de brincadeiras e de uma programação de estimulação previamente estabelecida que atendam às necessidades que o desenvolvimento global das nossas crianças necessita para que alcancem uma nova etapa de aprendizagem.</p>
<p>O afeto é a base do relacionamento cotidiano, isso se traduz em confiança, segurança, conforto, carinho e amor.</p>
<p><b>EDUCAÇÃO INFANTIL:</b> {{marcar matricula.serie: Fase 1 | Fase 2}}</p>
$t$ || replace(replace(replace(replace(con_fim,
  '[[CL3]]', $t$<p><b>§ 2º</b> Desde que devidamente justificadas ou por motivo de força maior, o Calendário Escolar poderá sofrer algumas alterações.</p>
<p><b>Cláusula 3ª</b> - O CONTRATANTE pela contraprestação dos serviços educacionais prestados ao (a) aluno (a) acima identificado (a) no período letivo de JANEIRO a DEZEMBRO do ano de <b>{{matricula.ano_letivo}}</b> obriga-se a pagar à CONTRATADA anuidade fixada no valor total de <b>{{financeiro.anuidade}}</b> divididos em {{financeiro.parcelas}} ({{financeiro.parcelas_extenso}}) parcelas, sendo a primeira no valor de <b>{{financeiro.primeira_parcela}}</b> pago até {{financeiro.primeira_vencimento}} e as demais no valor de <b>{{financeiro.valor_parcela}}</b> cada, que serão pagos todo dia {{financeiro.dia_vencimento}} a partir do mês de {{financeiro.inicio_demais}}.</p>
<p><b>§ 1º</b> Conforme o período contratado estará incluso no valor acima mencionado:</p>
<p>Período intermediário: inclui um lanche e pré janta.</p>
<p><b>§ 2º</b> Em caso de suspensão ou interrupção das aulas por força maior ou caso fortuito, como na hipótese de saúde pública, caberá à CONTRATADA, definir os procedimentos e critérios para a reposição de aulas, incluindo a utilização de ferramentas virtuais ou abatimento no pagamento de anuidade/mensalidade.</p>
<p><b>§ 3º:</b> Em caso de falta de pagamento no vencimento, o valor será acrescido de multa de 2 % (dois por cento) sem prejuízo da atualização monetária, além da aplicação de juros de R$ 0,33 (trinta e três centavos de reais) ao dia, até a efetivação do pagamento.</p>
<p><b>§ 4º</b> – Vencidas e não pagas duas ou mais parcelas, caracterizando inadimplência, a CONTRATADA contratará escritório especializado em cobranças judiciais e extrajudiciais para medidas cabíveis de cobrança.</p>
<p><b>§ 5º</b> Os valores da contraprestação acima pactuada satisfazem, exclusivamente a prestação de serviços decorrentes da carga horária constante da ficha de matrícula, sendo que a permanência além do horário estipulado será cobrada à parte no mês seguinte da ocorrência.</p>
<p><b>§ 6º</b> As horas-extras após o encerramento do período contratado ou antes do horário serão cobradas da seguinte maneira: a cada hora ou fração, com uma tolerância de 10 (dez) minutos, será cobrada uma taxa de R$ 15,00 (quinze reais).</p>
<p><b>§ 7º</b> - Não estão inclusos neste contrato no valor da mensalidade os serviços opcionais, tais como os uniformes, apostilas, cursos de férias, o transporte escolar e o material didático e de uso individual do aluno.</p>$t$),
  '[[UNIFORME]]', 'O CONTRATANTE está ciente de que, a partir de um ano de idade, o uso do uniforme é obrigatório.'),
  '[[P4]]', '<p><b>§ 4º</b> O CONTRATANTE autoriza a CONTRATADA, sempre que circunstâncias adversas e emergenciais a obriguem e não tenha sido possível obter autorização prévia do contratante, a tomar decisões que melhor atendam aos interesses da criança.</p>'),
  '[[ASSIN_ESCOLA]]', 'RESPONSÁVEL PELO BERÇÁRIO / ESCOLA')
 where escola_id = ec and tipo = 'contrato';

-- ---------------- Colégio MEF
update public.modelos set nome = 'Requerimento de reserva de matrícula', updated_by = 'sistema',
  conteudo = replace(replace(req, '[[SERIES]]', '{{marcar matricula.serie: Fase 1 | Fase 2 | 1º ano}}'),
                     '[[PERIODOS]]', '{{marcar matricula.periodo: Manhã | Tarde | Integral}}') || anexo
 where escola_id = mef and tipo = 'requerimento';

update public.modelos set nome = 'Contrato de prestação de serviços educacionais', updated_by = 'sistema',
  conteudo = con_ini || $t$
<p><b>EDUCAÇÃO INFANTIL:</b> {{marcar matricula.serie: Fase 1 | Fase 2}}</p>
<p><b>ENSINO FUNDAMENTAL:</b> {{marcar matricula.serie: 1º ano}}</p>
$t$ || replace(replace(replace(replace(con_fim,
  '[[CL3]]', $t$<p><b>Cláusula 3ª</b> - O CONTRATANTE pela contraprestação dos serviços educacionais prestados ao (a) aluno (a) acima identificado (a) no período letivo de JANEIRO a DEZEMBRO do ano de <b>{{matricula.ano_letivo}}</b> obriga-se a pagar a CONTRATADA anuidade fixada no valor total de <b>{{financeiro.anuidade}}</b> divididos em {{financeiro.parcelas}} ({{financeiro.parcelas_extenso}}) parcelas, sendo a primeira no valor de <b>{{financeiro.primeira_parcela}}</b> pago em {{financeiro.primeira_vencimento}} e as demais no valor de <b>{{financeiro.valor_parcela}}</b> cada, que serão pagos todo dia {{financeiro.dia_vencimento}} ({{financeiro.dia_extenso}}) de cada mês.</p>
<p><b>§ 1º</b> Em caso de suspensão ou interrupção das aulas por força maior ou caso fortuito, como na hipótese de saúde pública, caberá à CONTRATADA, definir os procedimentos e critérios para a reposição de aulas, incluindo a utilização de ferramentas virtuais ou abatimento no pagamento de anuidade/mensalidade.</p>
<p><b>§ 2º:</b> Em caso de falta de pagamento no vencimento, o valor será acrescido de multa de 2 % (dois por cento) sem prejuízo da atualização monetária, se houver, além da aplicação de juros de R$ 0,33 (trinta e três centavos de reais) ao dia, até a efetivação do pagamento.</p>
<p><b>§ 3º</b> – Vencidas e não pagas duas ou mais parcelas, caracterizando inadimplência, a critério da CONTRATADA, poderá ser suspensa a prestação de serviços educacionais, independentemente da exigibilidade do débito vencido.</p>
<p><b>§ 4º</b> A suspensão da execução dos serviços educacionais será comunicada através de aviso de recebimento (AR) ao CONTRATANTE.</p>
<p><b>§ 5º</b> Os valores da contraprestação acima pactuada satisfazem, exclusivamente a prestação de serviços decorrentes da carga horária constante da ficha de matrícula, sendo que a permanência além do horário estipulado será cobrada à parte no mês seguinte da ocorrência.</p>
<p><b>§ 6º</b> As horas-extras após o encerramento do período contratado ou antes do horário, serão cobradas da seguinte maneira: a cada hora ou fração (com uma tolerância de dez minutos) será cobrada uma taxa de R$ 15,00 (quinze reais).</p>
<p><b>§ 7º</b> - Não estão inclusos neste contrato no valor da mensalidade os serviços opcionais, tais como a alimentação, os uniformes, apostilas, cursos de férias, o transporte escolar e o material didático e de uso individual do aluno.</p>$t$),
  '[[UNIFORME]]', 'O CONTRATANTE está ciente de que o uso do uniforme é obrigatório.'),
  '[[P4]]', ''),
  '[[ASSIN_ESCOLA]]', 'RESPONSÁVEL PELO COLÉGIO')
 where escola_id = mef and tipo = 'contrato';

end $m$;
