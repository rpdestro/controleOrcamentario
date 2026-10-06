# Planejamento e Orçamento — Prefeitura Municipal de Botucatu · v1.2

Aplicação web para administrar as **demandas financeiras das Secretarias por período**, usando planilhas Excel como base de dados e o **Sistema Fiorilli** como fonte oficial de saldos.

- **Não precisa de instalação nem de servidor.** Basta abrir o `index.html` com duplo clique (Chrome ou Edge recomendados).
- Lê **XLSX, XLS e CSV** e exporta nos mesmos formatos.
- Usa o **layout da planilha do dia a dia** ("Planilha Léo Outubro.xlsx"): aba `GERAL` + uma aba por secretaria (`02.01`, `02.02`…).

---

## 1. Como usar

1. Abra o `index.html`.
2. Clique em **Importar planilha** e escolha a planilha de trabalho (ex.: `Planilha Léo Outubro.xlsx`). Confira a pré-visualização e confirme.
3. Clique em **Atualizar Fiorilli** e escolha o **relatório de Notas de Reserva** do Fiorilli (ex.: `download-15-09-2026.xls`). Confira o que vai mudar e clique em **Aplicar atualização** (veja a seção 3).
4. Preencha nas telas das secretarias o que é responsabilidade do usuário: **Descrição**, **Essencial**, **Período** e **Anotações**.
5. Clique em **Salvar base Excel** para gravar a planilha. No Chrome/Edge, os salvamentos seguintes gravam no mesmo arquivo.

| Módulo | O que faz |
|---|---|
| **Painel** | Indicadores gerais, situação da última atualização Fiorilli, gráfico de resultado por secretaria, quadro consolidado (igual à aba GERAL, com filtros de coluna) e essencial por período. |
| **Secretarias** | Uma tela por Unidade Orçamentária: busca, filtro por competência, **filtros de coluna estilo Excel**, inclusão/edição/exclusão de despesas, Folha, consulta de demanda (texto de despacho) e lançamentos "fora do quadro". |
| **Relatórios** | Consolidado, Detalhado, Resumo por Ficha, e Essencial por Período / por competência de início. Botão **Imprimir / PDF**. |
| **Exportar** | XLSX, XLS ou CSV: base completa, consolidado ou uma secretaria, com filtro de competência. |
| **Configurações** | Secretarias (incluir, editar, remover), **filtro de reservas** (processos e fontes), **colunas do relatório Fiorilli** e dados locais. |

Os botões **🌙 Modo escuro** e a **versão (v1.2)** ficam no cabeçalho.

---

## 2. Origem de cada campo

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
| Antes, Cortes, Folha | Planilha / usuário | Nunca alterados pela integração |

As letras das colunas podem ser alteradas em **Configurações → Integração Fiorilli**, caso o layout do arquivo mude. Processo e Saldo Ficha podem ficar em branco (sem Saldo Ficha, o saldo da planilha é mantido). A pré-visualização mostra, para cada campo, o valor encontrado na 1ª nota do arquivo, para você conferir.

---

## 3. Atualização com o Fiorilli (relatório de Notas de Reserva)

Desde a v1.2, o botão **Atualizar Fiorilli** usa o **relatório de Notas de Reserva** (`download-dd-mm-aaaa.xls`) no lugar do antigo `download-SaldoDotacao-*.csv`. O relatório tem **uma linha por nota** (reserva, anulação ou reforço), com várias notas por ficha.

**Regra da Reserva (quanto cada secretaria pode gastar):**
- **Reserva da ficha = soma do "Saldo da Reserva" (coluna BL) das notas que atendem ao filtro.**
- Filtro padrão: **processo** (coluna AS) igual a `001.003`, `001.003.1` ou `001.003.3` **e** **Fonte 1**.
- A comparação do processo é **exata**: `001.003` não inclui `001.003.2`.
- O filtro é alterado em **Configurações → Filtro de reservas**:
  - processos e fontes separados por vírgula;
  - `(vazio)` seleciona as notas **sem** número de processo;
  - campo vazio = sem restrição.
- Notas de anulação já vêm com saldo 0, então a soma é o saldo atual.

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

## 4. Padrão de "Observação (Período)"

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

## 5. Filtros de coluna (padrão Excel)

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

## 6. Regras de negócio

- **Resultado = Reserva + Saldo Ficha − Essencial − Folha**, a mesma fórmula da aba GERAL.
- "Cortes" é só informativo e não entra no resultado.
- Com qualquer filtro ativo, a Folha não é somada, porque é um valor global da secretaria.
- **Conferência na importação:** o sistema compara os totais calculados com o SUBTOTAL e com a aba GERAL. Na planilha de outubro ele apontou:
  - `GERAL!E18` usa a Folha da 02.09 para o Fundo 02.10, que está com a Folha em branco. A diferença no TOTAL é de R$ 2,5 mi.
  - `02.35!A3` contém "202" no lugar do título "Ficha".
  - `02.10!I42` tem o texto inválido "300,69,".

---

## 7. Arquitetura

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
│   │   └── print.css              impressão (sempre em cores claras)
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
│       │   ├── importer.js        leitura de planilhas (layout por abas / tabela plana / CSV)
│       │   ├── exporter.js        geração de XLSX/XLS/CSV no layout original
│       │   ├── fiorilli.js        INTEGRAÇÃO FIORILLI: ler notas + filtro → planejar → aplicar (imutável)
│       │   ├── store.js           estado + autossalvamento + preferências
│       │   └── fileService.js     salvar no mesmo arquivo / download
│       ├── ui/
│       │   ├── tema.js            MODO ESCURO (carregado no <head>, sem "piscar")
│       │   ├── filtroColuna.js    popover do filtro estilo Excel
│       │   ├── componentes.js · modal.js · toast.js · router.js · nav.js
│       ├── modules/   painel · secretaria · fiorilli · importar · relatorios · exportar · configuracoes
│       └── app.js                 inicialização (exibe a versão)
└── tests/            index.html · runner/ · specs/ (utils, dados, v11)
```

---

## 8. QA / automação

- Todo elemento interativo tem `data-testid`. Novidades da v1.1:

| Elemento | data-testid |
|---|---|
| Atualizar Fiorilli / arquivo / aplicar | `btn-fiorilli`, `input-fiorilli-arquivo`, `btn-fiorilli-aplicar` |
| Resumo e opções do Fiorilli | `fiorilli-resumo-*`, `fiorilli-colunas`, `fiorilli-filtro`, `fiorilli-processos`, `fiorilli-incluir-pessoal`, `fiorilli-incluir-zeradas`, `fiorilli-backup` |
| Detalhes do Fiorilli | `fiorilli-secretarias-tabela`, `fiorilli-alteracoes-tabela`, `fiorilli-inclusoes-tabela`, `fiorilli-ignoradas`, `fiorilli-ausentes-tabela` |
| Filtro de reservas (v1.2) | `input-filtro-processos`, `input-filtro-fontes`, `btn-salvar-filtro-reservas`, `btn-restaurar-filtro-reservas` |
| Filtro de coluna | `filtro-coluna-<campo>`, `filtro-popover-<campo>`, `filtro-busca-<campo>`, `filtro-todos-<campo>`, `filtro-opcao-<campo>`, `filtro-ok-<campo>`, `filtro-ordem-asc-<campo>`, `filtro-limpar-<campo>`, `btn-limpar-filtros` |
| Período no formulário | `input-linha-periodoInicio`, `input-linha-periodoFim`, `btn-periodo-ate-dezembro`, `btn-periodo-mes-unico`, `aviso-periodo-legado` |
| Modo escuro / versão | `btn-tema` (`aria-pressed`), `app-versao`, `rodape-versao` |
| Colunas do Fiorilli | `input-fiorilli-coluna-<campo>`, `btn-salvar-colunas-fiorilli` |

- **Testes:** abra `tests/index.html`. São **99 testes**, todos passando. A v1.1 e a v1.2 acrescentam:
  - padrão de período, com os textos reais da planilha;
  - filtros de coluna;
  - normalizações do Fiorilli;
  - filtro de reservas (processos, fontes, `(vazio)`, validações);
  - leitura, planejamento e aplicação da integração, usando notas reais do relatório de reservas.

  O resultado fica em `window.__RESULTADO_TESTES__`.

---

## 9. Uso offline

A leitura e gravação de Excel usam o **SheetJS** (`xlsx 0.18.5`), carregado do CDN cdnjs. Para usar sem internet:
1. Salve o `xlsx.full.min.js` em `assets/vendor/`.
2. Troque o `src` do script no `index.html`.

Sem a biblioteca, só os arquivos **CSV** funcionam. O relatório de reservas do Fiorilli é `.xls`; para usá-lo offline, salve-o como CSV no Excel (mesmas colunas).

---

## 10. Sugestões de evolução

1. **Corrigir na planilha de origem:** `GERAL!E18`, `02.35!A3` e `02.10!I42`.
2. **Revisar as 14 linhas "⚠ Não padronizado"** e decidir o tratamento da ficha "Criar" (02.40).
3. **Distribuição mensal do Essencial** (alternativa 2 da seção 4), para projeção de fluxo de caixa.
4. **Histórico de atualizações Fiorilli** (comparar o saldo de 02/10 com o de 09/10, por exemplo).
5. **Perfis Usuário e Administrador** (planejado): o Administrador altera Configurações (filtro de reservas, colunas, secretarias); o Usuário só lança despesas. Para ter controle de acesso real, é preciso um servidor, porque hoje tudo roda no navegador. Depois, perfis por secretaria e trilha de auditoria.
6. **Decidir o tratamento das reservas sem processo** (ex.: Saúde, cerca de R$ 2,04 mi na Fonte 1). Ver seção 3.
7. Testes E2E com Playwright usando os `data-testid` existentes.

---

## 11. Histórico de versões

| Versão | Data | Mudanças |
|---|---|---|
| **v1.2** | 06/10/2026 | **Atualizar Fiorilli** passa a usar o **relatório de Notas de Reserva** (`download-dd-mm-aaaa.xls`). A Reserva vira a soma do Saldo da Reserva das notas filtradas por **processo** (coluna AS: 001.003, 001.003.1, 001.003.3) e **Fonte 1**. Novo **Filtro de reservas** em Configurações, editável pelo usuário. Pré-visualização com **Reserva por secretaria** e saldo por processo. As colunas antigas salvas no navegador são migradas automaticamente. |
| v1.1 | 02/10/2026 | Integração **Fiorilli** (CSV oficial, colunas configuráveis, pré-visualização e cópia de segurança). **Padrão de período** (mês inicial/final) com conversão automática dos textos antigos. Novo campo **Anotações**. **Filtros de coluna estilo Excel**. **Modo escuro**. **Número de versão** na interface. |
| v1.0 | 02/10/2026 | Versão inicial: importação/exportação XLSX/XLS/CSV, Painel, 21 Secretarias, Relatórios, Exportar, Configurações, conferência de totais e consulta de demanda. |

A versão fica em `assets/js/core/config.js` (`APP_VERSAO`), que é a fonte única exibida no cabeçalho e no rodapé.
