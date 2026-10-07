/**
 * @file relatorios.js
 * @description Módulo "Relatórios": gera o relatório oficial para impressão / PDF.
 * Tipos (v1.5):
 *   Consolidado — Página: Consolidado Geral (quadro por secretaria, igual à aba GERAL)
 *                 + Página: gráfico "Resultado por secretaria";
 *   Gestão      — Página: Movimentações entre fichas (resumo por secretaria + lista)
 *                 + Página: Fichas com Reserva/Saldo alterados (oficial → atual, situação);
 *   Completo    — os dois anteriores.
 * Cada página traz o brasão da Prefeitura no cabeçalho e a numeração "Página X de N".
 * A impressão usa print.css, que oculta a interface e força a quebra entre as páginas.
 */
(function (App) {
  'use strict';

  const { criar, limpar } = App.utils.dom;
  const { moeda, dataHoraBR, dataBR } = App.utils.format;
  const { tabela, cabecalhoPagina, botao, campo, estadoVazio, graficoResultado, seloSituacao } = App.ui.componentes;
  const calculos = App.data.calculos;
  const gestao = App.data.relatorioGestao;
  const store = App.data.store;
  const config = App.core.config;

  const TIPOS = Object.freeze([
    { valor: 'consolidado', rotulo: 'Consolidado Geral' },
    { valor: 'gestao', rotulo: 'Gestão de movimentações entre fichas' },
    { valor: 'completo', rotulo: 'Completo (consolidado + gestão)' }
  ]);

  const selecao = { tipo: 'consolidado', periodo: '', inicio: '', fim: '', secretaria: '' }; // preservado na sessão

  /* --------------------------- Blocos do relatório --------------------------- */

  function cabecalhoRelatorio(titulo, filtrosTexto) {
    const meta = store.getEstado().meta;
    return criar('header', {
      classe: 'relatorio__cabecalho',
      filhos: [
        criar('img', { classe: 'relatorio__logo', attrs: { src: config.LOGO, alt: `Brasão da ${config.ORGAO}`, width: 56, height: 61 } }),
        criar('div', {
          classe: 'relatorio__identificacao',
          filhos: [
            criar('p', { classe: 'relatorio__orgao', texto: config.ORGAO }),
            criar('p', { classe: 'relatorio__sistema', texto: config.APP_NOME }),
            criar('h2', { classe: 'relatorio__titulo', texto: titulo }),
            criar('p', {
              classe: 'relatorio__meta',
              texto: [`Emitido em ${dataHoraBR(new Date())}`, meta.atualizadoEm ? `Base atualizada em ${meta.atualizadoEm}` : '', filtrosTexto].filter(Boolean).join(' · ')
            })
          ]
        })
      ]
    });
  }

  /** Uma página impressa: cabeçalho + conteúdo + número da página. */
  function pagina({ numero, total, titulo, filtrosTexto, conteudo, longa = false }) {
    return criar('section', {
      classe: `relatorio__pagina${longa ? ' relatorio__pagina--longa' : ''}`,
      testid: `relatorio-pagina-${numero}`,
      attrs: { 'aria-label': `Página ${numero}: ${titulo}` },
      filhos: [
        cabecalhoRelatorio(titulo, filtrosTexto),
        ...conteudo,
        criar('p', { classe: 'relatorio__numero-pagina', texto: `Página ${numero} de ${total}` })
      ]
    });
  }

  function tabelaConsolidado(geral, porSecretaria) {
    return tabela({
      testid: 'relatorio-tabela-consolidado',
      colunas: [
        { rotulo: 'U.O.', chave: 'codigo' }, { rotulo: 'Secretaria', chave: 'nome' },
        { rotulo: 'Essencial', chave: 'essencial', moeda: true },
        { rotulo: 'Folha', chave: 'folha', moeda: true }, { rotulo: 'Reserva', chave: 'reserva', moeda: true },
        { rotulo: 'Saldo Ficha', chave: 'saldoFicha', moeda: true }, { rotulo: 'Resultado', chave: 'resultado', moeda: true }
      ],
      linhas: porSecretaria,
      rodape: ['', 'TOTAL GERAL', ...['essencial', 'folha', 'reserva', 'saldoFicha', 'resultado'].map((c) => moeda(geral[c]))]
    });
  }

  /** Páginas do Consolidado Geral (competência selecionada). */
  function paginasConsolidado() {
    const { geral, porSecretaria } = calculos.totaisGerais(store.getSecretariasProjetadas(), { periodo: selecao.periodo });
    const qtdMovimentacoes = store.getTransferencias().length;
    const filtrosTexto = [
      selecao.periodo ? `${App.utils.periodo.rotuloFiltro(selecao.periodo)} (Folha não considerada)` : '',
      qtdMovimentacoes ? `Inclui ${qtdMovimentacoes} transferência(s) entre fichas registrada(s) no sistema` : ''
    ].filter(Boolean).join(' · ');

    return [
      { titulo: 'Consolidado Geral', filtrosTexto, conteudo: [tabelaConsolidado(geral, porSecretaria)] },
      {
        titulo: 'Resultado por secretaria',
        filtrosTexto,
        conteudo: [
          criar('p', { classe: 'relatorio__legenda', texto: 'Resultado = Reserva + Saldo Ficha − Essencial − Folha. Barras à esquerda (vermelho) indicam déficit; à direita (verde), sobra de recursos.' }),
          graficoResultado(porSecretaria, { testid: 'relatorio-grafico', nomeCompleto: true }),
          criar('p', { classe: 'relatorio__resumo', texto: `Resultado geral: ${moeda(geral.resultado)}` })
        ]
      }
    ];
  }

  const ponto = (p) => `${p.secretaria} · Ficha ${p.ficha}`;
  const variacao = (v) => (v ? `${v > 0 ? '+' : '−'}${moeda(Math.abs(v))}` : '—');

  /** Lista resumida em pares termo/valor. */
  function resumoLista(itens, prefixo) {
    return criar('dl', {
      classe: 'resumo-lista relatorio__resumo-lista',
      filhos: itens.flatMap(([termo, valor]) => [
        criar('dt', { classe: 'resumo-lista__termo', texto: termo }),
        criar('dd', { classe: 'resumo-lista__valor', texto: valor, testid: `${prefixo}-${App.utils.format.slug(termo)}` })
      ])
    });
  }

  /** Páginas de gestão: movimentações entre fichas e fichas com saldo alterado. */
  function paginasGestao() {
    const secretarias = store.getSecretarias();
    const transferencias = store.getTransferencias();
    const filtro = { inicio: selecao.inicio, fim: selecao.fim, secretaria: selecao.secretaria };
    const lista = gestao.listarMovimentacoes(transferencias, secretarias, filtro);
    const totais = gestao.totaisMovimentacoes(lista);
    const porSecretaria = gestao.resumoPorSecretaria(lista, secretarias, selecao.secretaria);
    // O saldo atual depende de TODAS as movimentações (o filtro de datas não se aplica aqui).
    const fichas = gestao.fichasAlteradas(secretarias, transferencias, selecao.secretaria);

    const nomeSecretaria = selecao.secretaria ? `${selecao.secretaria} — ${(secretarias.find((s) => s.codigo === selecao.secretaria) || {}).nome || ''}` : '';
    const periodoTexto = selecao.inicio || selecao.fim
      ? `Período: ${selecao.inicio ? dataBR(`${selecao.inicio}T12:00:00`) : 'início'} a ${selecao.fim ? dataBR(`${selecao.fim}T12:00:00`) : 'hoje'}`
      : 'Todas as datas';
    const filtrosMov = [periodoTexto, nomeSecretaria].filter(Boolean).join(' · ');
    const filtrosFichas = ['Posição atual (todas as movimentações)', nomeSecretaria].filter(Boolean).join(' · ');

    // Parágrafo (e não alerta): alertas não aparecem na impressão.
    const vazio = (testid, texto) => criar('p', { classe: 'relatorio__resumo', testid, texto });

    const paginaMovimentacoes = {
      titulo: 'Movimentações entre fichas',
      filtrosTexto: filtrosMov,
      longa: true,
      conteudo: lista.length ? [
        resumoLista([
          ['Movimentações', String(totais.quantidade)],
          ['Saldo Ficha movido', moeda(totais.saldoFicha)],
          ['Reserva movida', moeda(totais.reserva)],
          ['Total movido', moeda(totais.total)]
        ], 'relatorio-mov'),
        tabela({
          testid: 'relatorio-mov-secretarias',
          legenda: 'Resumo por secretaria',
          colunas: [
            { rotulo: 'U.O.', chave: 'codigo' }, { rotulo: 'Secretaria', chave: 'nome' },
            { rotulo: 'Lançamentos', chave: 'quantidade', numerico: true },
            { rotulo: 'Entradas', chave: 'entradas', moeda: true }, { rotulo: 'Saídas', chave: 'saidas', moeda: true },
            { rotulo: 'Líquido', chave: 'liquido', moeda: true }
          ],
          linhas: porSecretaria
        }),
        tabela({
          testid: 'relatorio-mov-lista',
          legenda: 'Lançamentos (ordem cronológica)',
          colunas: [
            { rotulo: 'Data', render: (m) => dataHoraBR(m.data) },
            { rotulo: 'Origem', render: (m) => ponto(m.origem) },
            { rotulo: 'Destino', render: (m) => ponto(m.destino) },
            { rotulo: 'Saldo Ficha', chave: 'saldoFicha', moeda: true },
            { rotulo: 'Reserva', chave: 'reserva', moeda: true },
            { rotulo: 'Instrumento', chave: 'instrumento' },
            { rotulo: 'Motivo', classe: 'tabela__celula--descricao', render: (m) => `${m.motivo || '—'}${m.orfa ? ' (⚠ ficha não encontrada na base atual)' : ''}` }
          ],
          linhas: lista,
          rodape: ['', '', 'Totais', moeda(totais.saldoFicha), moeda(totais.reserva), '', '']
        })
      ] : [vazio('relatorio-mov-vazio', 'Nenhuma movimentação encontrada para os filtros selecionados.')]
    };

    const paginaFichas = {
      titulo: 'Fichas com saldo alterado por movimentações',
      filtrosTexto: filtrosFichas,
      longa: true,
      conteudo: fichas.length ? [
        criar('p', { classe: 'relatorio__legenda', texto: 'Oficial = valor do Fiorilli/planilha. Atual = oficial + entradas − saídas registradas no sistema. Situação compara o disponível (Reserva + Saldo Ficha) com o Essencial da ficha.' }),
        tabela({
          testid: 'relatorio-fichas-alteradas',
          colunas: [
            { rotulo: 'U.O.', chave: 'secretaria' }, { rotulo: 'Ficha', chave: 'ficha' }, { rotulo: 'Despesa', chave: 'despesa', classe: 'tabela__celula--nowrap' },
            { rotulo: 'Reserva oficial', chave: 'reservaOficial', moeda: true },
            { rotulo: 'Variação', classe: 'tabela__celula--num', render: (f) => variacao(f.reservaVariacao) },
            { rotulo: 'Reserva atual', chave: 'reserva', moeda: true },
            { rotulo: 'Saldo oficial', chave: 'saldoOficial', moeda: true },
            { rotulo: 'Variação', classe: 'tabela__celula--num', render: (f) => variacao(f.saldoVariacao) },
            { rotulo: 'Saldo atual', chave: 'saldoFicha', moeda: true },
            { rotulo: 'Essencial', chave: 'necessidade', moeda: true },
            {
              rotulo: 'Situação', classe: 'tabela__celula--nowrap',
              render: (f) => (f.situacaoAntes === f.situacao
                ? seloSituacao(f.situacao)
                : criar('span', { filhos: [seloSituacao(f.situacaoAntes), ' → ', seloSituacao(f.situacao)] }))
            }
          ],
          linhas: fichas
        })
      ] : [vazio('relatorio-fichas-vazio', 'Nenhuma ficha com saldo alterado por movimentações.')]
    };

    return [paginaMovimentacoes, paginaFichas];
  }

  /** Monta as páginas conforme o tipo e os filtros selecionados. */
  function gerar(area) {
    const especificacoes = [
      ...(selecao.tipo !== 'gestao' ? paginasConsolidado() : []),
      ...(selecao.tipo !== 'consolidado' ? paginasGestao() : [])
    ];
    const titulo = (TIPOS.find((t) => t.valor === selecao.tipo) || TIPOS[0]).rotulo;
    limpar(area).append(criar('article', {
      classe: 'relatorio',
      testid: 'relatorio',
      attrs: { 'aria-label': `Relatório — ${titulo}` },
      filhos: especificacoes.map((p, i) => pagina({ ...p, numero: i + 1, total: especificacoes.length }))
    }));
  }

  /* ------------------------------- Formulário -------------------------------- */

  function formulario(area) {
    const periodos = calculos.listarPeriodos(store.getSecretarias());
    if (selecao.periodo && !periodos.some((p) => p.valor === selecao.periodo)) selecao.periodo = '';
    const botaoImprimir = botao({ rotulo: 'Imprimir / PDF', testid: 'btn-relatorio-imprimir', attrs: { disabled: true }, aoClicar: () => window.print() });

    const camposConsolidado = [
      campo({
        id: 'rel-periodo', nome: 'periodo', rotulo: 'Competência (mês) — consolidado', tipo: 'select', valor: selecao.periodo, testid: 'select-relatorio-periodo',
        opcoes: [{ valor: '', rotulo: 'Todas as competências' }, ...periodos]
      })
    ];
    const camposGestao = [
      campo({ id: 'rel-inicio', nome: 'inicio', rotulo: 'Movimentações a partir de', tipo: 'date', valor: selecao.inicio, testid: 'input-relatorio-inicio' }),
      campo({ id: 'rel-fim', nome: 'fim', rotulo: 'Movimentações até', tipo: 'date', valor: selecao.fim, testid: 'input-relatorio-fim' }),
      campo({
        id: 'rel-secretaria', nome: 'secretaria', rotulo: 'Secretaria — gestão', tipo: 'select', valor: selecao.secretaria, testid: 'select-relatorio-secretaria',
        opcoes: [{ valor: '', rotulo: 'Todas as secretarias' }, ...store.getSecretarias().map((s) => ({ valor: s.codigo, rotulo: `${s.codigo} — ${s.nome}` }))]
      })
    ];

    const form = criar('form', {
      classe: 'form form--grade cartao nao-imprimir',
      testid: 'form-relatorio',
      attrs: { novalidate: true, 'aria-label': 'Parâmetros do relatório' },
      filhos: [
        campo({
          id: 'rel-tipo', nome: 'tipo', rotulo: 'Tipo de relatório', tipo: 'select', valor: selecao.tipo, testid: 'select-relatorio-tipo', opcoes: TIPOS,
          dica: 'Consolidado: quadro geral + gráfico · Gestão: movimentações entre fichas + fichas com saldo alterado.'
        }),
        ...camposConsolidado,
        ...camposGestao,
        criar('div', {
          classe: 'form__acoes form__campo--largo',
          filhos: [botao({ rotulo: 'Gerar relatório', variante: 'primario', tipo: 'submit', testid: 'btn-relatorio-gerar' }), botaoImprimir]
        })
      ]
    });

    // Mostra somente os parâmetros do tipo escolhido.
    const sincronizar = () => {
      const tipo = form.elements.tipo.value;
      camposConsolidado.forEach((c) => { c.hidden = tipo === 'gestao'; });
      camposGestao.forEach((c) => { c.hidden = tipo === 'consolidado'; });
    };
    form.elements.tipo.addEventListener('change', sincronizar);
    sincronizar();

    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      Object.assign(selecao, {
        tipo: form.elements.tipo.value,
        periodo: form.elements.periodo.value,
        inicio: form.elements.inicio.value,
        fim: form.elements.fim.value,
        secretaria: form.elements.secretaria.value
      });
      // Datas invertidas: troca para não gerar um relatório vazio por engano.
      if (selecao.inicio && selecao.fim && selecao.inicio > selecao.fim) {
        [selecao.inicio, selecao.fim] = [selecao.fim, selecao.inicio];
        form.elements.inicio.value = selecao.inicio;
        form.elements.fim.value = selecao.fim;
      }
      gerar(area);
      botaoImprimir.disabled = false;
    });
    return form;
  }

  function render(container) {
    container.append(cabecalhoPagina({ titulo: 'Relatórios', subtitulo: 'Consolidado Geral e gestão das movimentações entre fichas. Imprima ou salve em PDF pela janela de impressão.', testid: 'relatorios-cabecalho' }));
    if (!store.temDados()) {
      container.append(estadoVazio({ titulo: 'Sem dados', mensagem: 'Importe uma planilha para gerar relatórios.', acao: botao({ rotulo: 'Importar planilha', variante: 'primario', testid: 'btn-relatorios-importar', aoClicar: App.modules.importar.abrir }) }));
      return;
    }
    const area = criar('div', { classe: 'relatorio-area', testid: 'relatorio-area', attrs: { 'aria-live': 'polite' } });
    container.append(formulario(area), area);
  }

  App.modules.relatorios = Object.freeze({ render });
})(window.OrcApp);
