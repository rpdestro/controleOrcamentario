# Planejamento e Orçamento — Prefeitura Municipal de Botucatu · v1.1

Aplicação web para administrar as **demandas financeiras das Secretarias por período**, usando planilhas Excel como base de dados e o **Sistema Fiorilli** como fonte oficial de saldos.

- **Não precisa de instalação nem de servidor.** Basta abrir o `index.html` com duplo clique (Chrome ou Edge recomendados).
- Lê **XLSX, XLS e CSV** e exporta nos mesmos formatos.
- Usa o **layout da planilha do dia a dia** ("Planilha Léo Outubro.xlsx"): aba `GERAL` + uma aba por secretaria (`02.01`, `02.02`…).

---

## 1. Como usar

1. Abra o `index.html`.
2. Clique em **Importar planilha** e escolha a planilha de trabalho (ex.: `Planilha Léo Outubro.xlsx`). Confira a pré-visualização e confirme.
3. Clique em **Atualizar Fiorilli** e escolha o arquivo oficial (ex.: `download-SaldoDotacao-02-10-2026.csv`). Confira o que vai mudar e clique em **Aplicar atualização** (veja a seção 3).
4. Preencha nas telas das secretarias o que é responsabilidade do usuário: **Descrição**, **Essencial**, **Período** e **Anotações**.
5. Clique em **Salvar base Excel** para gravar a planilha. No Chrome/Edge, os salvamentos seguintes gravam no mesmo arquivo.

| Módulo | O que faz |
|---|---|
| **Painel** | Indicadores gerais, situação da última atualização Fiorilli, gráfico de resultado por secretaria, quadro consolidado (igual à aba GERAL, com filtros de coluna) e essencial por período. |
| **Secretarias** | Uma tela por Unidade Orçamentária: busca, filtro por competência, **filtros de coluna estilo Excel**, inclusão/edição/exclusão de despesas, Folha, consulta de demanda (texto de despacho) e lançamentos "fora do quadro". |
| **Relatórios** | Consolidado, Detalhado, Resumo por Ficha, e Essencial por Período / por competência de início. Botão **Imprimir / PDF**. |
| **Exportar** | XLSX, XLS ou CSV: base completa, consolidado ou uma secretaria, com filtro de competência. |
| **Configurações** | Secretarias (incluir, editar, remover), **colunas do arquivo Fiorilli** e dados locais. |

Os botões **🌙 Modo escuro** e a **versão (v1.1)** ficam no cabeçalho.

---

## 2. Origem de cada campo

| Campo | Origem | Observação |
|---|---|---|
| Nº Ficha | **Fiorilli**, coluna `V` (FICHA) | Chave de ligação entre o Fiorilli e a planilha |
| U.E | **Fiorilli**, coluna `AT` (CODLO) | Os 4 primeiros dígitos definem a secretaria (020101 → 02.01) |
| Fonte de Recurso | **Fiorilli**, coluna `AZ` (FONGRUPO) | "01" é gravado como "1", igual à planilha |
| Cód. Despesa | **Fiorilli**, coluna `AV` (CATEC) | "3.3.90.39.00" é gravado como "3.3.90.39" (4 níveis, como na planilha) |
| Reserva | **Fiorilli**, coluna `BK` (SALDORESERVA) | |
| Saldo Ficha | **Fiorilli**, coluna `BD` (SALDO_RESERVA) | Resíduos como `1,16E-10` viram 0 |
| Descrição | Usuário | Nunca alterado pela integração |
| Essencial | Usuário | Nunca alterado pela integração |
| Observação (Período) | Usuário, **seleção padronizada** | Ver seção 4 |
| Anotações | Usuário (novo na v1.1) | Notas livres que antes ficavam misturadas na Observação |
| Antes, Cortes, Folha | Planilha / usuário | Nunca alterados pela integração |

As letras das colunas podem ser alteradas em **Configurações → Integração Fiorilli**, caso o layout do arquivo mude. A pré-visualização sempre mostra o título encontrado em cada coluna, para você conferir.

---

## 3. Atualização com o Fiorilli

**Regras aplicadas:**
- **Fichas que já existem na planilha:** U.E, Fonte, Despesa, Reserva e Saldo são atualizados.
  - Quando a ficha ocupa várias linhas (itens), Reserva e Saldo ficam na 1ª linha e as demais ficam com 0. Assim a soma continua igual ao SUBTOTAL do Excel.
- **Fichas novas** (existem no Fiorilli e não na planilha) entram com Descrição e Essencial em branco. Na pré-visualização você escolhe quais incluir:
  - **Fontes:** por padrão, só as que já são usadas na planilha (hoje, a fonte 1).
  - **Despesas de pessoal (3.1.x):** não incluídas por padrão.
  - **Fichas com Reserva e Saldo zerados:** não incluídas por padrão.
- **Fichas da planilha que não existem no Fiorilli** são **mantidas** e listadas para você conferir.
- Antes de aplicar, a aplicação sugere baixar uma **cópia de segurança** da base (XLSX).

**Resultado com os arquivos reais** (planilha de 01/10/2026 + Fiorilli de 02/10/2026):

| Item | Quantidade |
|---|---|
| Fichas lidas no Fiorilli | 852 |
| Fichas sem alteração (confirma o mapeamento das colunas) | 280 |
| Fichas atualizadas | 162 (85 Reserva, 106 Saldo, 21 U.E, 9 Cód. Despesa) |
| Fichas novas incluídas (fonte 1, sem pessoal e sem zeradas) | 5 |
| Fichas novas ignoradas pelo filtro padrão | 405 |
| Fichas da planilha ausentes no Fiorilli | 1 (texto "Criar" na aba 02.40) |

> As 30 alterações de **U.E e Cód. Despesa** são divergências cadastrais na planilha que foram corrigidas com o dado oficial. Exemplos: ficha 202 (Educação) estava com U.E 020602, que é da Saúde; ficha 71 estava como 3.3.90.39, e o oficial é 3.3.90.47. Elas aparecem uma a uma na pré-visualização.

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
│       │   ├── fiorilli.js        INTEGRAÇÃO FIORILLI: ler → planejar → aplicar (imutável)
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
| Resumo e opções do Fiorilli | `fiorilli-resumo-*`, `fiorilli-colunas`, `fiorilli-fonte-1`, `fiorilli-incluir-pessoal`, `fiorilli-incluir-zeradas`, `fiorilli-backup` |
| Detalhes do Fiorilli | `fiorilli-alteracoes-tabela`, `fiorilli-inclusoes-tabela`, `fiorilli-ignoradas`, `fiorilli-ausentes-tabela` |
| Filtro de coluna | `filtro-coluna-<campo>`, `filtro-popover-<campo>`, `filtro-busca-<campo>`, `filtro-todos-<campo>`, `filtro-opcao-<campo>`, `filtro-ok-<campo>`, `filtro-ordem-asc-<campo>`, `filtro-limpar-<campo>`, `btn-limpar-filtros` |
| Período no formulário | `input-linha-periodoInicio`, `input-linha-periodoFim`, `btn-periodo-ate-dezembro`, `btn-periodo-mes-unico`, `aviso-periodo-legado` |
| Modo escuro / versão | `btn-tema` (`aria-pressed`), `app-versao`, `rodape-versao` |
| Colunas do Fiorilli | `input-fiorilli-coluna-<campo>`, `btn-salvar-colunas-fiorilli` |

- **Testes:** abra `tests/index.html`. São **84 testes**, todos passando. A v1.1 acrescenta:
  - padrão de período, com os textos reais da planilha;
  - filtros de coluna;
  - normalizações do Fiorilli;
  - planejamento e aplicação da integração, usando linhas reais do CSV.

  O resultado fica em `window.__RESULTADO_TESTES__`.

---

## 9. Uso offline

A leitura e gravação de Excel usam o **SheetJS** (`xlsx 0.18.5`), carregado do CDN cdnjs. Para usar sem internet:
1. Salve o `xlsx.full.min.js` em `assets/vendor/`.
2. Troque o `src` do script no `index.html`.

Sem a biblioteca, os arquivos **CSV** (inclusive o do Fiorilli) continuam funcionando.

---

## 10. Sugestões de evolução

1. **Corrigir na planilha de origem:** `GERAL!E18`, `02.35!A3` e `02.10!I42`.
2. **Revisar as 14 linhas "⚠ Não padronizado"** e decidir o tratamento da ficha "Criar" (02.40).
3. **Distribuição mensal do Essencial** (alternativa 2 da seção 4), para projeção de fluxo de caixa.
4. **Histórico de atualizações Fiorilli** (comparar o saldo de 02/10 com o de 09/10, por exemplo).
5. Perfis de acesso por secretaria e trilha de auditoria, se houver um servidor.
6. Testes E2E com Playwright usando os `data-testid` existentes.

---

## 11. Histórico de versões

| Versão | Data | Mudanças |
|---|---|---|
| **v1.1** | 02/10/2026 | Integração **Fiorilli** (CSV oficial, colunas configuráveis, pré-visualização e cópia de segurança). **Padrão de período** (mês inicial/final) com conversão automática dos textos antigos. Novo campo **Anotações**. **Filtros de coluna estilo Excel**. **Modo escuro**. **Número de versão** na interface. |
| v1.0 | 02/10/2026 | Versão inicial: importação/exportação XLSX/XLS/CSV, Painel, 21 Secretarias, Relatórios, Exportar, Configurações, conferência de totais e consulta de demanda. |

A versão fica em `assets/js/core/config.js` (`APP_VERSAO`), que é a fonte única exibida no cabeçalho e no rodapé.
