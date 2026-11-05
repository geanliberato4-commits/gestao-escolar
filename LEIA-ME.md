# Gestão Escolar — Escola Estação Criança | Colégio MEF

Sistema web interno (só equipe) para as duas escolas. Mesmo estilo do sistema de ponto:
site estático (HTML/CSS/JavaScript, sem build) ligado ao projeto Supabase **gestao-escolar**.

## Arquivos
| Arquivo | O que é |
|---|---|
| `index.html` | Login e sistema (menu lateral, busca rápida, seletor de escola) |
| `assinar.html` | Página pública de assinatura do contrato (link individual, sem conta) |
| `config.js` | URL e chave pública do Supabase, validade do link de assinatura |
| `js/core.js` | Utilitários, janelas, PDF/Excel, preenchimento dos modelos |
| `js/alunos.js` | Lista de alunos e ficha individual (abas) |
| `js/matricula.js` | Matrícula, rematrícula, painel de matrículas e vagas |
| `js/financeiro.js` | Parcelas, pagamentos, boletos/NF, painel financeiro, relatórios |
| `js/secretaria.js` | Contratos e assinatura, documentos, declarações, lista de espera |
| `js/sistema.js` | Painel inicial, turmas, modelos, configurações |
| `sql/` | Estrutura do banco (já aplicada no Supabase; guardada para referência) |
| `supabase/functions/usuarios` | Função que cria usuários e troca senhas (já publicada) |

## Publicar (GitHub Pages)
Settings › Pages › Source: *Deploy from a branch* › `main` / `(root)`. O endereço fica
`https://<usuário>.github.io/gestao-escolar/`.

## Perfis
- **Direção**: vê as duas escolas (visão conjunta) e tudo o que há nelas. Administrador gerencia usuários e permissões.
- **Secretaria**: cadastro, matrícula, contratos, documentos, declarações, lista de espera, turmas.
- **Financeiro**: parcelas, pagamentos, boletos/NF e relatórios.
As permissões de secretaria e financeiro são ajustáveis em Configurações › Permissões.
A separação por escola é aplicada no banco (RLS), não só na tela.

## Regras adotadas (confirmar com a direção / TI)
- **Mensalidades**: geradas na matrícula a partir de valor, nº de parcelas, dia e 1º vencimento. Dia 31 vira o último dia em meses menores.
- **Descontos**: desconto da matrícula (% ou R$) + desconto de irmão (configurado por escola, aplicado se houver irmão com matrícula ativa no mesmo ano). Se “acumula” estiver desligado, vale o maior.
- **Pagamento parcial**: a parcela fica “parcial” até completar o valor. Multa e juros **não** são calculados (só registro).
- **Atrasado**: parcela não paga com vencimento anterior a hoje.
- **Cancelamento/transferência**: o sistema pergunta se cancela as parcelas futuras; vencidas e pagas continuam.
- **Regerar mensalidades**: só se nenhuma parcela tiver pagamento; as antigas ficam “canceladas” (histórico preservado).
- **Vagas**: matrículas que não estão canceladas/transferidas ocupam vaga na turma.
- **Contrato**: rascunho pode ser ajustado; depois de enviado, só cancelando; assinado nunca muda (o banco bloqueia).

## Assinatura eletrônica
Assinatura eletrônica **simples** (Lei 14.063/2020): link individual com validade (15 dias), conferência do CPF
do responsável financeiro (bloqueia após 5 erros), aceite expresso, registro de data/hora, IP, navegador,
hash SHA-256 do documento e código de verificação. O PDF assinado é arquivado na ficha automaticamente.
Se o jurídico exigir assinatura avançada/qualificada, dá para trocar por um fornecedor (Clicksign, ZapSign, D4Sign)
mantendo o resto do fluxo.

## Antes de usar com dados reais
1. Revisar os modelos de contrato e declarações com o jurídico (menu Modelos).
2. Preencher razão social, CNPJ, endereço e cidade em Configurações › Escolas.
3. Ajustar as **turmas de exemplo** (2026 e 2027) em Turmas.
4. Supabase › Authentication › Sign In / Providers: desativar “Allow new users to sign up”; ativar proteção contra senhas vazadas.
5. Criar os usuários reais em Configurações › Usuários e **desativar os dois usuários de teste**.
