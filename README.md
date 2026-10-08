# Planejamento e Orçamento — Prefeitura Municipal de Botucatu · v1.5

Aplicação web para administrar as **demandas financeiras das Secretarias por período**, usando planilhas Excel como base de dados e o **Sistema Fiorilli** como fonte oficial de saldos.

- **Não precisa de instalação nem de servidor.** Basta abrir o `index.html` com duplo clique (Chrome ou Edge recomendados).
- Lê **XLSX, XLS e CSV** e exporta nos mesmos formatos.
- Usa o **layout da planilha do dia a dia** ("Planilha Léo Outubro.xlsx"): aba `GERAL` + uma aba por secretaria (`02.01`, `02.02`…).

---

## 1. Como Usar:

1. Abra o `index.html`.
2. Clique em **Importar planilha** e escolha a planilha de trabalho (ex.: `Planilha Léo Outubro.xlsx`). Confira a pré-visualização e confirme.
3. Clique em **Atualizar Fiorilli** e escolha o **relatório de Notas de Reserva** do Fiorilli (ex.: `download-08-10-2026.csv`). Confira o que vai mudar e clique em **Aplicar atualização** (veja a seção 3).
4. Preencha nas telas das secretarias o que é responsabilidade do usuário: **Descrição**, **Essencial**, **Período** e **Anotações**.
5. Clique em **Salvar base Excel** para gravar a planilha. No Chrome/Edge, os salvamentos seguintes gravam no mesmo arquivo.

| Módulo | O que faz |
|---|---|
| **Painel** | Indicadores gerais, situação da última atualização Fiorilli, gráfico de resultado por secretaria, quadro consolidado (igual à aba GERAL, com filtros de coluna) e essencial por período. |
| **Secretarias** | Uma tela por Unidade Orçamentária: busca, filtro por competência, **filtros de coluna estilo Excel**, inclusão/edição/exclusão de despesas, Folha, consulta de demanda (texto de despacho), lançamentos "fora do quadro", **situação de cada ficha** (Positivo / Déficit / Atende, com botões de filtro e ordenação) e **transferência de recursos entre fichas** (seção 6-A). |
| **Relatórios** | Relatório oficial com o brasão da Prefeitura e páginas numeradas. Tipos: **Consolidado Geral** (quadro + gráfico "Resultado por secretaria", filtro por competência), **Gestão de movimentações** (transferências entre fichas e fichas com saldo alterado, filtro por datas e secretaria) ou **Completo**. Botão **Imprimir / PDF** (A4 paisagem). |
| **Exportar** | XLSX, XLS ou CSV: base completa, consolidado ou uma secretaria, com filtro de competência. A coluna "Antes" (Valor Anterior) não é exportada (v1.5). |
| **Configurações** | Secretarias (incluir, editar, remover), **filtro de reservas** (processos e fontes em caixas de seleção, com recálculo imediato das Reservas), **colunas do relatório Fiorilli** e dados locais. |

O **brasão da Prefeitura** (`assets/img/brasao.png`), os botões **🌙 Modo escuro** e a **versão (v1.5)** ficam no cabeçalho.

---

## 2. Origem de cada Campo:

| Campo | Origem | Observação |
|---|---|---|
| Nº Ficha | **Fiorilli**, coluna `R` | Chave de ligação entre o Fiorilli e a planilha |
| U.E | **Fiorilli**, coluna `W` | Os 4 primeiros dígitos definem a secretaria (020101 → 02.01) |
| Fonte de Recurso | **Fiorilli**, coluna `BD` | "01" é gravado como "1", igual à planilha |
| Cód. Despesa | **Fiorilli**, coluna `Y` | "3.3.90.39.00" é gravado como "3.3.90.39" (4 níveis, como na planilha) |
| Processo | **Fiorilli**, coluna `AS` | Usado só no filtro (001.003, 001.003.1, 001.003.3…) |
| Reserva | **Fiorilli**, coluna `BL` (Saldo da Reserva) | **Soma das notas da ficha que atendem ao filtro** (seção 3) |
| Saldo Ficha | **Fiorilli**, coluna `BM` | Saldo orçamentário da ficha na **última nota** do relatório. Opcional |
| Descrição | Usuário | Nunca alterado pela integração |
| Essencial | Usuário | Nunca alterado pela integração |
| Observação (Período) | Usuário, **seleção padronizada** | Ver seção 4 |
| Anotações | Usuário (novo na v1.1) | Notas livres que antes ficavam misturadas na Observação |
| Antes, Folha | Planilha / usuário | Nunca alterados pela integração. "Antes" não é exportado desde a v1.5 (volta como 0 se a base exportada for reimportada) |

As letras das colunas podem ser alteradas em **Configurações → Integração Fiorilli**, caso o layout do arquivo mude. Processo e Saldo Ficha podem ficar em branco (sem Saldo Ficha, o saldo da planilha é mantido). A pré-visualização mostra, para cada campo, o valor encontrado na 1ª nota do arquivo, para você conferir.

---

## 3. Atualização com o Fiorilli (relatório de Notas de Reserva):

Desde a v1.2, o botão **Atualizar Fiorilli** usa o **relatório de Notas de Reserva** (`download-dd-mm-aaaa.xls`) no lugar do antigo `download-SaldoDotacao-*.csv`. O relatório tem **uma linha por nota** (reserva, anulação ou reforço), com várias notas por ficha.

O mesmo relatório exportado em **CSV** (`download-dd-mm-aaaa.csv`) tem outra ordem de colunas. Ele é reconhecido automaticamente pelos títulos: FICHA, CODLO (U.E), FONGRUPO (Fonte), CATEC (Despesa), PROCESSO, SALDO_RESERVA e SALDO (Saldo Ficha). O mapeamento de Configurações continua valendo para o XLS.

**Regra da Reserva (quanto cada secretaria pode gastar):**
- **Reserva da ficha = soma do "Saldo da Reserva" (coluna BL) das notas que atendem ao filtro.**
- Filtro padrão: **processo** (coluna AS) igual a `001.003`, `001.003.1` ou `001.003.3` **e** **Fonte 1**.
- A comparação do processo é **exata**: `001.003` não inclui `001.003.2`.
- O filtro padrão é alterado em **Configurações → Filtro de reservas** (v1.5: caixas de seleção):
  - processos `001.003`, `001.003.1`, `001.003.2`, `001.003.3`, `001.005` e fontes `1`, `2`, `3`, `5`, `8`, com "Marcar todos / Desmarcar todos";
  - campo **Outros** para códigos fora da lista (separados por vírgula); `(vazio)` seleciona as notas **sem** número de processo;
  - nada marcado = sem restrição.
- **Na própria atualização Fiorilli** (v1.5) as mesmas caixas aparecem na pré-visualização: ao marcar/desmarcar, a prévia é recalculada na hora. "Salvar esta seleção como filtro padrão" grava a escolha em Configurações.
- Notas de anulação já vêm com saldo 0, então a soma é o saldo atual.

**Recálculo imediato ao salvar o filtro (v1.5):**
- Ao aplicar a atualização, o sistema guarda, para cada ficha da base, a **composição** da Reserva: o Saldo da Reserva de **todas** as notas, somado por processo × fonte (poucos KB no navegador).
- Em Configurações, **Salvar filtro** abre uma **prévia do impacto** (Reserva total atual × após, por secretaria e por ficha) com três opções: **Recalcular reservas**, **Só salvar o filtro** (vale na próxima atualização) ou **Cancelar**.
- Limites: fichas sem composição (incluídas manualmente, ausentes na última atualização ou base recém-importada da planilha) mantêm a Reserva atual; fichas que não estão na planilha não são incluídas pelo recálculo (use **Atualizar Fiorilli**). Se houver transferências registradas e alguma Reserva projetada ficar negativa, a prévia avisa.
- Importar uma planilha descarta a composição (a Reserva volta a ser a da planilha).

**Regras aplicadas:**
- **Fichas que já existem na planilha:** U.E, Fonte, Despesa, Reserva e Saldo são atualizados.
  - A Reserva pode ficar **0** quando nenhuma nota da ficha atende ao filtro.
  - Quando a ficha ocupa várias linhas (itens), Reserva e Saldo ficam na 1ª linha e as demais ficam com 0. Assim a soma continua igual ao SUBTOTAL do Excel.
- **Fichas novas** (com notas dentro do filtro e que não estão na planilha) entram com Descrição e Essencial em branco. Na pré-visualização você escolhe quais incluir:
  - **Despesas de pessoal (3.1.x):** não incluídas por padrão.
  - **Fichas com Saldo da Reserva zerado:** não incluídas por padrão.
  - Fichas novas **sem nenhuma nota no filtro** não são sugeridas ("fora do filtro").
- **Fichas da planilha que não existem no relatório** são **mantidas** e listadas para você conferir.
- A pré-visualização mostra o **Saldo da reserva por processo** e a **Reserva por secretaria (atual × após)**.
- Antes de aplicar, a aplicação sugere baixar uma **cópia de segurança** da base (XLSX).

**Validação do mapeamento:** a soma da coluna BL por ficha foi comparada com a coluna SALDORESERVA do `download-SaldoDotacao-05-10-2026.csv`. **323 de 324 fichas** bateram. A única diferença foi a ficha 713, por causa da data diferente dos arquivos.

**Resultado com os arquivos reais** (Planilha Léo Outubro + `download-15-09-2026.xls`):

| Item | Quantidade |
|---|---|
| Notas lidas / dentro do filtro | 9.878 / 382 |
| Saldo da reserva no filtro | R$ 18.001.349,21 (001.003: 12.072.576,70 · 001.003.1: 5.507.309,20 · 001.003.3: 421.463,31) |
| Fichas lidas no relatório | 472 |
| Fichas atualizadas / sem alteração | 73 / 205 |
| Fichas novas fora do filtro (não sugeridas) | 194 |
| Fichas da planilha ausentes no relatório (sem reservas) | 167 |
| Reserva total da planilha | R$ 19.414.335,54 → R$ 18.001.349,21 |

> **Atenção — Saúde (02.06):** a Reserva cai de R$ 1.424.666,83 para R$ 11.680,50. A maior parte das reservas Fonte 1 da Saúde (cerca de R$ 2,04 mi) **não tem número de processo** na coluna AS, por isso fica fora do filtro padrão. Se essas reservas devem contar, inclua `(vazio)` nos processos em Configurações.

---

## 4. Padrão de "Observação (Período)":

### Padrão adotado: intervalo de competências mensais
O usuário **seleciona** o **mês inicial** e o **mês final** em listas (Jan do ano da base até Dez do ano seguinte). Há atalhos para **"Somente o mês inicial"** e **"Até o fim do exercício (Dez)"**. A planilha recebe um rótulo padronizado:

| Situação | Gravado na planilha |
|---|---|
| Um único mês | `Out/2026` |
| Intervalo | `Out/2026 a Dez/2026` |

O período passa a ser **obrigatório quando há valor Essencial**.

**Por que este padrão:**
- **Ele cobre todos os casos da planilha atual.** "a partir de outubro" vira `Out/2026 a Dez/2026`; "novembro, dezembro e janeiro" vira `Nov/2026 a Jan/2027`.
- **Permite filtrar por competência.** Ao escolher **Nov/2026**, aparecem as linhas cujo intervalo inclui novembro.
- **Mantém o Excel legível**, e o rótulo é relido automaticamente na reimportação.

### Conversão automática dos textos existentes
Na importação, a planilha de outubro ficou assim:
- **456 linhas** convertidas automaticamente.
- **401 linhas** sem período.
- **14 linhas** sem nenhum mês reconhecível ficaram como **⚠ Não padronizado** para revisão. Exemplos: "aguardando ata", "outubto" (erro de digitação), "2027", "PL 16 Transferir 1.000,00 para ficha 730".
- **Textos com meses + informações extras** têm o período convertido e o **texto original guardado em "Anotações"**, para nada se perder. Exemplos: "a partir de outubro + décimo terceiro", "PL 16 a partir de agosto – transferir 83.662,69 para ficha 730".

As telas mostram um aviso e um atalho **"Mostrar essas linhas"** para revisar as não padronizadas. Ao escolher o período de uma delas, o texto antigo vai automaticamente para Anotações.

### Alternativas consideradas (para decisão da equipe)
1. **Lista fixa de opções** ("Mensal", "Trimestral", "Até dezembro", "Imediato"). É mais simples, mas não permite saber *quais* meses estão envolvidos nem filtrar por mês.
2. **Valores distribuídos por mês** (uma coluna por mês com o valor previsto). Seria o mais preciso para fluxo de caixa, mas exige mudar o layout da planilha. Pode ser uma evolução futura (seção 8).

---

## 5. Filtros de Coluna (padrão Excel):

O botão **▾** nos cabeçalhos das tabelas (secretarias e quadro consolidado do Painel) abre:
- **Classificar** de A a Z / de Z a A (nas colunas de valor: do menor para o maior e vice-versa);
- **Pesquisar** dentro dos valores da coluna;
- **(Selecionar tudo)** e a lista de valores com caixas de seleção, incluindo **(Vazias)**;
- **OK / Cancelar / Limpar filtro**.

O comportamento segue o do Excel:
- A lista de uma coluna considera os filtros das demais colunas.
- O botão fica destacado (**▼**) quando há filtro.
- Os **indicadores e totais passam a considerar só as linhas visíveis**, como o `SUBTOTAL`.
- **Limpar filtros** remove todos de uma vez.

Dica: para preencher as fichas novas vindas do Fiorilli, filtre a coluna **Descrição** por **(Vazias)**.

---

## 6. Regras de Negócio:

- **Resultado = Reserva + Saldo Ficha − Essencial − Folha**, a mesma fórmula da aba GERAL.
- A coluna "Cortes" da planilha é **ignorada**: não é lida na importação nem aparece no Painel, nos relatórios, nos gráficos ou nas exportações (XLSX, XLS, CSV).
- Com qualquer filtro ativo, a Folha não é somada, porque é um valor global da secretaria.
- **Saldo Total** (coluna da tela da Secretaria, após Saldo Ficha) = **(Saldo Ficha + Reserva) − Essencial da ficha**. Aparece só na 1ª linha de cada ficha, já com as movimentações. É **apenas informativo**: não entra nos totais do rodapé, nos indicadores, na Folha nem no Resultado.
- **Conferência na importação:** o sistema compara os totais calculados com o SUBTOTAL e com a aba GERAL. Na planilha de outubro ele apontou:
  - `GERAL!E18` usa a Folha da 02.09 para o Fundo 02.10, que está com a Folha em branco. A diferença no TOTAL é de R$ 2,5 mi.
  - `02.35!A3` contém "202" no lugar do título "Ficha".
  - `02.10!I42` tem o texto inválido "300,69,".

---

## 6-A. Transferências entre Fichas e Situação Orçamentária (v1.4):

### Situação de cada ficha (v1.5: três níveis)
Cada ficha recebe um selo (ícone + texto) na coluna **Situação** e uma borda colorida na sua 1ª linha. A situação compara o **disponível** (Reserva + Saldo Ficha) com a **necessidade** (soma do Essencial da ficha), com tolerância de R$ 0,01.

| Selo | Cor | Regra |
|---|---|---|
| ▲ **Positivo** | verde | disponível **maior** que o Essencial (qualquer sobra; inclui ficha sem Essencial com saldo) |
| ▼ **Déficit** | vermelho | disponível **menor** que o Essencial, inclusive fichas zeradas (o selo mostra quanto falta) |
| = **Atende** | azul | disponível **igual** ao Essencial (sem sobra) |

- Acima da tabela, os botões **Todas · Positivo · Déficit · Atende** (com a quantidade de fichas) filtram a tabela; podem ser combinados. Eles usam o mesmo estado do filtro estilo Excel da coluna **Situação**, então os dois ficam sincronizados.
- **Ordenar por situação**: "Ordem da tabela", "Positivo primeiro", "Déficit primeiro" ou "Atende primeiro" (as demais seguem a ordem Positivo → Déficit → Atende). As linhas de uma ficha continuam juntas.
- O indicador **Fichas em déficit** conta as fichas em déficit entre as exibidas (e informa quantas atendem e quantas são positivas).
- As cores ficam em `base.css` (`--cor-sit-*`) e os rótulos em `config.js` (`SITUACOES_FICHA`).

### Transferir recursos
O botão **Transferir** fica na 1ª linha de cada ficha, onde estão a Reserva e o Saldo. Ele aparece desativado quando a ficha não tem saldo. Na janela:
- a ficha atual já vem como **Origem**;
- o **Destino** pode ser qualquer ficha, **da mesma ou de outra secretaria**. A lista é agrupada por secretaria (a da origem primeiro), mostra as fichas mais necessitadas primeiro e tem um campo de busca;
- informe quanto mover de **Saldo Ficha** e/ou de **Reserva**. O botão "Usar total" preenche o valor disponível;
- **Instrumento** (A definir / Decreto / Projeto de Lei) e **Motivo** são registrados. Por enquanto o instrumento é só informativo: o filtro por tipo de movimentação virá depois;
- a **prévia** mostra o antes → depois e a situação da origem e do destino, e é atualizada enquanto você digita;
- **não é permitido deixar saldo negativo**: cada campo é validado contra o saldo da origem, já descontadas as movimentações anteriores;
- se a origem passar a ficar em **Déficit**, é preciso marcar uma **confirmação de ciência**.

Depois de confirmar, só a área de dados da tela é atualizada, sem recarregar a página. As linhas alteradas piscam em verde (entrada) ou vermelho (saída), os valores "contam" até o novo saldo e os indicadores acompanham. Com "reduzir movimento" ativado no sistema, as animações são desligadas.

### Livro de movimentações (os saldos oficiais não são alterados)
- Cada transferência é um **lançamento** guardado no navegador. Os valores oficiais (Fiorilli/planilha) **não são alterados**.
- As telas (Secretarias, Painel e Relatórios) mostram o saldo **projetado** = oficial − saídas + entradas. Abaixo do valor aparece a variação e o valor oficial (ex.: "+R$ 20.000,00 · oficial R$ 33.034,58").
- **Salvar base Excel** e **Exportar** gravam os **valores oficiais**.
- A gravação é "tudo ou nada": se o navegador não conseguir salvar, nada é alterado.
- **Histórico** (card "Movimentações registradas" na secretaria): mostra data, origem, destino, valores, instrumento e motivo, com o botão **Desfazer**. O sistema não deixa desfazer uma transferência cujo valor já foi repassado adiante: nesse caso, desfaça antes a posterior.
- Avisos no histórico:
  - "**anterior à última atualização Fiorilli**": o lançamento pode já estar refletido nos saldos oficiais. Confira e, se for o caso, desfaça-o para não contar duas vezes;
  - "**ficha não encontrada**": a ficha não existe mais na base atual.
- No **Painel**, um aviso informa quantas transferências estão registradas e oferece **Descartar todas** (volta aos saldos oficiais).

### Relatório de gestão das movimentações (v1.5)
Em **Relatórios → Tipo: Gestão de movimentações** (ou **Completo**):
- **Movimentações entre fichas**: totais movidos (Saldo Ficha, Reserva), resumo por secretaria (lançamentos, entradas, saídas e líquido) e a lista em ordem cronológica (data, origem, destino, valores, instrumento, motivo). Filtros: período (data inicial/final) e secretaria.
- **Fichas com saldo alterado por movimentações**: Reserva e Saldo Ficha **oficiais**, a variação e o valor **atual**, o Essencial e a situação **antes → depois** (ex.: ▼ Déficit → = Atende). Mostra a posição atual (todas as movimentações).
- As páginas são numeradas ("Página X de N"); listas longas continuam na folha seguinte ao imprimir.

---

## 7. Arquitetura:

Aplicação 100% front-end, modular e sem build. HTML, CSS e JS ficam separados. O único global é `window.OrcApp`, por isso funciona via `file://`.

```
controleOrcamentario/
├── index.html                     <!-- HTML semântico -->
├── README.md
├── assets/
│   ├── css/                       /* CSS — BEM, Flexbox/Grid, tokens claro/escuro */
│   │   ├── base.css               tokens (cores, espaçamentos), MODO ESCURO, reset
│   │   ├── layout.css             cabeçalho, navegação, responsivo
│   │   ├── components.css         botões, KPIs, tabelas, FILTRO EXCEL, formulários, modal, toast
│   │   ├── modules.css            gráfico, secretaria, importação, Fiorilli, relatórios
│   │   └── print.css              impressão (sempre em cores claras; uma folha por página do relatório)
│   ├── img/brasao.png             brasão da Prefeitura (cabeçalho e relatórios)
│   └── js/                        // JAVASCRIPT
│       ├── core/      namespace.js · config.js (versão, colunas Fiorilli) · events.js
│       ├── utils/     (funções puras e testadas)
│       │   ├── format.js          moeda, números BR (inclui notação científica), textos
│       │   ├── periodo.js         PADRÃO DE PERÍODO: interpretar/converter/filtrar competências
│       │   ├── filtroTabela.js    lógica do filtro de colunas estilo Excel
│       │   ├── validators.js      validações (linha, período, secretaria, arquivo)
│       │   └── dom.js             criação de elementos (sem innerHTML)
│       ├── data/
│       │   ├── schema.js          modelo + normalizações (U.E, fonte, despesa, anotações)
│       │   ├── calculos.js        totais, filtros, agrupamentos, consulta, conferência
│       │   ├── movimentacoes.js   TRANSFERÊNCIAS (v1.4): situação da ficha, projeção, validação, simulação
│       │   ├── relatorioGestao.js RELATÓRIO DE GESTÃO (v1.5): movimentações, resumo por secretaria, fichas alteradas
│       │   ├── importer.js        leitura de planilhas (layout por abas / tabela plana / CSV)
│       │   ├── exporter.js        geração de XLSX/XLS/CSV no layout original
│       │   ├── fiorilli.js        INTEGRAÇÃO FIORILLI: ler notas + filtro → planejar → aplicar (imutável); composição/recálculo da Reserva (v1.5)
│       │   ├── store.js           estado + autossalvamento + preferências + livro de movimentações
│       │   └── fileService.js     salvar no mesmo arquivo / download
│       ├── ui/
│       │   ├── tema.js            MODO ESCURO (carregado no <head>, sem "piscar")
│       │   ├── filtroColuna.js    popover do filtro estilo Excel
│       │   ├── animacao.js        contagem de valores e destaque (respeita "reduzir movimento")
│       │   ├── seletorFiltroReservas.js  caixas de seleção de processos/fontes (Configurações e Fiorilli)
│       │   ├── componentes.js · modal.js · toast.js · router.js (atualização parcial) · nav.js
│       ├── modules/   painel · secretaria · transferencia · fiorilli · importar · relatorios · exportar · configuracoes
│       └── app.js                 inicialização (exibe a versão)
└── tests/            index.html · runner/ · specs/ (utils, dados, v11, v14, v15)
```

---

## 8. QA / Automação:

- Todo elemento interativo tem `data-testid`. Novidades da v1.1:

| Elemento | data-testid |
|---|---|
| Atualizar Fiorilli / arquivo / aplicar | `btn-fiorilli`, `input-fiorilli-arquivo`, `btn-fiorilli-aplicar` |
| Resumo e opções do Fiorilli | `fiorilli-resumo-*`, `fiorilli-colunas`, `fiorilli-filtro`, `fiorilli-processos`, `fiorilli-incluir-pessoal`, `fiorilli-incluir-zeradas`, `fiorilli-backup` |
| Detalhes do Fiorilli | `fiorilli-secretarias-tabela`, `fiorilli-alteracoes-tabela`, `fiorilli-inclusoes-tabela`, `fiorilli-ignoradas`, `fiorilli-ausentes-tabela` |
| Filtro de reservas (v1.5) | `filtro-reservas-processos`, `filtro-reservas-processos-opcao-<processo>`, `filtro-reservas-processos-outros`, `filtro-reservas-processos-todos` / `-nenhum`, `filtro-reservas-fontes` (mesmo padrão), `btn-salvar-filtro-reservas`, `btn-restaurar-filtro-reservas` |
| Recálculo das reservas (v1.5) | `modal-recalculo`, `previa-recalculo`, `recalculo-secretarias`, `recalculo-fichas`, `recalculo-negativas`, `btn-recalculo-confirmar`, `btn-recalculo-so-filtro`, `btn-recalculo-cancelar` |
| Seleção no Fiorilli (v1.5) | `fiorilli-selecao-filtro`, `fiorilli-seletor-processos-*`, `fiorilli-seletor-fontes-*`, `fiorilli-salvar-filtro-padrao` |
| Filtro por situação (v1.5) | `secretaria-filtro-situacao`, `btn-situacao-todas`, `btn-situacao-positivo`, `btn-situacao-deficit`, `btn-situacao-atende` (`aria-pressed`), `select-secretaria-ordem-situacao` |
| Relatórios (v1.5) | `select-relatorio-tipo`, `select-relatorio-periodo`, `input-relatorio-inicio`, `input-relatorio-fim`, `select-relatorio-secretaria`, `relatorio-pagina-<n>`, `relatorio-mov-secretarias`, `relatorio-mov-lista`, `relatorio-fichas-alteradas` |
| Filtro de coluna | `filtro-coluna-<campo>`, `filtro-popover-<campo>`, `filtro-busca-<campo>`, `filtro-todos-<campo>`, `filtro-opcao-<campo>`, `filtro-ok-<campo>`, `filtro-ordem-asc-<campo>`, `filtro-limpar-<campo>`, `btn-limpar-filtros` |
| Período no formulário | `input-linha-periodoInicio`, `input-linha-periodoFim`, `btn-periodo-ate-dezembro`, `btn-periodo-mes-unico`, `aviso-periodo-legado` |
| Modo escuro / versão | `btn-tema` (`aria-pressed`), `app-versao`, `rodape-versao` |
| Colunas do Fiorilli | `input-fiorilli-coluna-<campo>`, `btn-salvar-colunas-fiorilli` |
| Transferência (v1.4) | `btn-transferir-<idLinha>`, `modal-transferencia`, `transferencia-origem`, `input-transferencia-busca`, `select-transferencia-destino`, `input-transferencia-saldoFicha`, `input-transferencia-reserva`, `btn-transferencia-total-<campo>`, `select-transferencia-instrumento`, `input-transferencia-motivo`, `transferencia-previa`, `check-transferencia-ciente`, `btn-transferencia-confirmar` |
| Situação e histórico (v1.4) | `situacao-ficha-<ficha>`, `kpi-sec-alerta`, `secretaria-movimentacoes`, `btn-desfazer-transferencia-<id>`, `painel-movimentacoes`, `btn-descartar-transferencias` |

- **Testes:** abra `tests/index.html`. São **146 testes**, todos passando. A v1.5 acrescenta `v15.spec.js` (exportação sem "Antes" e letras das fórmulas, composição e recálculo da Reserva, relatório de gestão) e atualiza os testes de situação para os três níveis. A v1.4 acrescenta 25 testes: margens de situação, projeção dos saldos, validação (saldo insuficiente, valores, destino), simulação, movimentações órfãs e desfazer encadeado. A v1.1 e a v1.2 acrescentam:
  - padrão de período, com os textos reais da planilha;
  - filtros de coluna;
  - normalizações do Fiorilli;
  - filtro de reservas (processos, fontes, `(vazio)`, validações);
  - leitura, planejamento e aplicação da integração, usando notas reais do relatório de reservas.

  O resultado fica em `window.__RESULTADO_TESTES__`.

---

## 9. Uso Offline:

A leitura e gravação de Excel usam o **SheetJS** (`xlsx 0.18.5`), carregado do CDN cdnjs. Para usar sem internet:
1. Salve o `xlsx.full.min.js` em `assets/vendor/`.
2. Troque o `src` do script no `index.html`.

Sem a biblioteca, só os arquivos **CSV** funcionam. O relatório de reservas do Fiorilli é `.xls`; para usá-lo offline, salve-o como CSV no Excel (mesmas colunas).

---

## 10. Histórico de Versões:

| Versão | Data | Mudanças |
|---|---|---|
| **v1.5** | 07/10/2026 | **Situação das fichas em três níveis**: Positivo (verde), Déficit (vermelho, inclui zeradas e mostra quanto falta) e Atende (azul, disponível = Essencial). **Secretarias**: botões de filtro por situação e ordenação. **Filtro de reservas com caixas de seleção** (processos 001.003, 001.003.1, 001.003.2, 001.003.3, 001.005; fontes 1, 2, 3, 5, 8) em Configurações e na atualização Fiorilli, com **recálculo imediato** das Reservas (composição por processo × fonte guardada na atualização, com prévia do impacto). **Relatório de gestão** das movimentações entre fichas e das fichas com saldo alterado; páginas numeradas dinamicamente. **Exportação sem a coluna "Antes"** (XLS/XLSX) e "Valor Anterior" (CSV); letras das fórmulas derivadas da posição das colunas. |
| v1.4 | 07/10/2026 | **Transferência de recursos entre fichas** (da mesma ou de outra secretaria), movendo Saldo Ficha e/ou Reserva, com prévia antes → depois, bloqueio de saldo negativo e ciência obrigatória quando a origem fica crítica. **Livro de movimentações**: os saldos oficiais são preservados, as telas mostram o saldo projetado, e o histórico tem Desfazer. **Situação das fichas** (Zerada, Déficit, Crítico < 10%, Atenção < 30%, Regular) com selos, borda colorida, filtro e o indicador "Fichas em alerta". **Atualização parcial e animada** da tela após a transferência. A coluna "Cortes" deixa de ser lida e exportada. |
| v1.3 | 06/10/2026 | A aplicação substitui a planilha do dia a dia ("Planilha Léo Outubro atualizada.xlsx"). **Brasão da Prefeitura** no cabeçalho, no ícone da aba e nos relatórios. **Relatório em duas páginas**: Consolidado Geral + gráfico "Resultado por secretaria" (os demais tipos de relatório e os campos de assinatura foram removidos). Módulo Configurações (colunas do Fiorilli e filtro de reservas) testado com `download-06-10-2026.xls`. |
| v1.2 | 06/10/2026 | **Atualizar Fiorilli** passa a usar o **relatório de Notas de Reserva** (`download-dd-mm-aaaa.xls`). A Reserva vira a soma do Saldo da Reserva das notas filtradas por **processo** (coluna AS: 001.003, 001.003.1, 001.003.3) e **Fonte 1**. Novo **Filtro de reservas** em Configurações, editável pelo usuário. Pré-visualização com **Reserva por secretaria** e saldo por processo. As colunas antigas salvas no navegador são migradas automaticamente. |
| v1.1 | 02/10/2026 | Integração **Fiorilli** (CSV oficial, colunas configuráveis, pré-visualização e cópia de segurança). **Padrão de período** (mês inicial/final) com conversão automática dos textos antigos. Novo campo **Anotações**. **Filtros de coluna estilo Excel**. **Modo escuro**. **Número de versão** na interface. |
| v1.0 | 02/10/2026 | Versão inicial: importação/exportação XLSX/XLS/CSV, Painel, 21 Secretarias, Relatórios, Exportar, Configurações, conferência de totais e consulta de demanda. |

A versão fica em `assets/js/core/config.js` (`APP_VERSAO`), que é a fonte única exibida no cabeçalho e no rodapé.

##

## 👨‍💻 Autor:
```text
Renato Pinheiro Destro
renato.destro@gmail.com
Auxiliar de Escritório / Prefeitura Municipal de Botucatu/SP
```
#### Seja LIVRE, use Linux!

##