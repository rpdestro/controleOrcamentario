/**
 * @file relatorios.js
 * @description Módulo "Relatórios": gera relatórios para impressão / PDF.
 * Tipos: Consolidado Geral, Detalhado por Secretaria, Resumo por Ficha
 * e Essencial por Período. A impressão usa a folha de estilo print.css,
 * que oculta a interface e exibe apenas o relatório.
 */
(function (App) {
  'use strict';

  const { criar, limpar } = App.utils.dom;
  const { moeda, dataHoraBR } = App.utils.format;
  const { tabela, cabecalhoPagina, botao, campo, aplicarErros, resumoErros, estadoVazio } = App.ui.componentes;
  const calculos = App.data.calculos;
  const store = App.data.store;
  const config = App.core.config;

  const TIPOS = Object.freeze([
    { valor: 'consolidado', rotulo: 'Consolidado Geral' },
    { valor: 'detalhado', rotulo: 'Detalhado por Secretaria' },
    { valor: 'fichas', rotulo: 'Resumo por Ficha' },
    { valor: 'periodo', rotulo: 'Essencial por Período' }
  ]);

  const selecao = { tipo: 'consolidado', codigo: '', periodo: '' }; // preservado na sessão

  /* --------------------------- Blocos do relatório --------------------------- */

  function cabecalhoRelatorio(titulo, filtrosTexto) {
    const meta = store.getEstado().meta;
    return criar('header', {
      classe: 'relatorio__cabecalho',
      filhos: [
        criar('p', { classe: 'relatorio__orgao', texto: config.ORGAO }),
        criar('p', { classe: 'relatorio__sistema', texto: config.APP_NOME }),
        criar('h2', { classe: 'relatorio__titulo', texto: titulo, testid: 'relatorio-titulo' }),
        criar('p', {
          classe: 'relatorio__meta',
          texto: [`Emitido em ${dataHoraBR(new Date())}`, meta.atualizadoEm ? `Base atualizada em ${meta.atualizadoEm}` : '', filtrosTexto].filter(Boolean).join(' · ')
        })
      ]
    });
  }

  function assinaturas() {
    return criar('footer', {
      classe: 'relatorio__assinaturas',
      filhos: ['Responsável pela elaboração', 'Secretário(a) responsável'].map((rotulo) => criar('div', {
        classe: 'relatorio__assinatura',
        filhos: [criar('span', { classe: 'relatorio__linha-assinatura' }), criar('span', { texto: rotulo })]
      }))
    });
  }

  function relatorioConsolidado(secretarias, filtro) {
    const { geral, porSecretaria } = calculos.totaisGerais(secretarias, filtro);
    return [tabela({
      testid: 'relatorio-tabela-consolidado',
      colunas: [
        { rotulo: 'U.O.', chave: 'codigo' }, { rotulo: 'Secretaria', chave: 'nome' },
        { rotulo: 'Essencial', chave: 'essencial', moeda: true }, { rotulo: 'Cortes', chave: 'cortes', moeda: true },
        { rotulo: 'Folha', chave: 'folha', moeda: true }, { rotulo: 'Reserva', chave: 'reserva', moeda: true },
        { rotulo: 'Saldo Ficha', chave: 'saldoFicha', moeda: true }, { rotulo: 'Resultado', chave: 'resultado', moeda: true }
      ],
      linhas: porSecretaria,
      rodape: ['', 'TOTAL GERAL', ...['essencial', 'cortes', 'folha', 'reserva', 'saldoFicha', 'resultado'].map((c) => moeda(geral[c]))]
    })];
  }

  function relatorioDetalhado(secretarias, filtro) {
    return secretarias.map((s) => {
      const linhas = calculos.filtrarLinhas(s.linhas, filtro);
      const t = calculos.totaisSecretaria(s, filtro);
      return criar('section', {
        classe: 'relatorio__secao',
        testid: `relatorio-secao-${s.codigo}`,
        filhos: [
          criar('h3', { classe: 'relatorio__subtitulo', texto: `${s.codigo} — ${s.nome}` }),
          linhas.length ? tabela({
            testid: `relatorio-tabela-${s.codigo}`,
            colunas: [
              { rotulo: 'Ficha', chave: 'ficha' }, { rotulo: 'U.E', chave: 'ue' }, { rotulo: 'FR', chave: 'fonte' },
              { rotulo: 'Despesa', chave: 'despesa' }, { rotulo: 'Descrição', chave: 'descricao' },
              { rotulo: 'Período', chave: 'observacao' }, { rotulo: 'Essencial', chave: 'essencial', moeda: true },
              { rotulo: 'Reserva', chave: 'reserva', moeda: true }, { rotulo: 'Saldo Ficha', chave: 'saldoFicha', moeda: true }
            ],
            linhas,
            rodape: ['', '', '', '', 'Totais', '', moeda(t.essencial), moeda(t.reserva), moeda(t.saldoFicha)]
          }) : criar('p', { texto: 'Sem linhas para o filtro selecionado.' }),
          criar('p', {
            classe: 'relatorio__resumo',
            texto: `Folha: ${moeda(t.folha)} · Cortes: ${moeda(t.cortes)} · Resultado: ${moeda(t.resultado)}`
          })
        ]
      });
    });
  }

  function relatorioFichas(secretarias, filtro) {
    return secretarias.map((s) => {
      const grupos = calculos.agruparPorFicha(calculos.filtrarLinhas(s.linhas, filtro))
        .map((g) => ({ ...g, disponivel: g.reserva + g.saldoFicha - g.essencial }));
      return criar('section', {
        classe: 'relatorio__secao',
        filhos: [
          criar('h3', { classe: 'relatorio__subtitulo', texto: `${s.codigo} — ${s.nome}` }),
          grupos.length ? tabela({
            testid: `relatorio-fichas-${s.codigo}`,
            colunas: [
              { rotulo: 'Ficha', chave: 'ficha' }, { rotulo: 'U.E', chave: 'ue' }, { rotulo: 'FR', chave: 'fonte' },
              { rotulo: 'Despesa', chave: 'despesa' }, { rotulo: 'Itens', chave: 'qtdItens', numerico: true },
              { rotulo: 'Essencial', chave: 'essencial', moeda: true }, { rotulo: 'Reserva', chave: 'reserva', moeda: true },
              { rotulo: 'Saldo Ficha', chave: 'saldoFicha', moeda: true }, { rotulo: 'Disponível', chave: 'disponivel', moeda: true }
            ],
            linhas: grupos
          }) : criar('p', { texto: 'Sem fichas para o filtro selecionado.' })
        ]
      });
    });
  }

  function relatorioPeriodo(secretarias) {
    return [
      criar('h3', { classe: 'relatorio__subtitulo', texto: 'Por período informado' }),
      tabela({
        testid: 'relatorio-tabela-periodo',
        colunas: [{ rotulo: 'Período', chave: 'periodo' }, { rotulo: 'Linhas', chave: 'qtdLinhas', numerico: true }, { rotulo: 'Essencial', chave: 'essencial', moeda: true }],
        linhas: calculos.agruparPorPeriodo(secretarias)
      }),
      criar('h3', { classe: 'relatorio__subtitulo', texto: 'Por competência de início (fluxo mensal de demandas)' }),
      tabela({
        testid: 'relatorio-tabela-mes-inicial',
        colunas: [{ rotulo: 'Competência inicial', chave: 'rotulo' }, { rotulo: 'Linhas', chave: 'qtdLinhas', numerico: true }, { rotulo: 'Essencial', chave: 'essencial', moeda: true }],
        linhas: calculos.essencialPorMesInicial(secretarias)
      })
    ];
  }

  /** Monta o relatório conforme a seleção. */
  function gerar(area) {
    const todas = store.getSecretarias();
    const alvo = selecao.codigo ? todas.filter((s) => s.codigo === selecao.codigo) : todas;
    const filtro = { periodo: selecao.periodo };
    const tipo = TIPOS.find((t) => t.valor === selecao.tipo);
    const filtrosTexto = [
      selecao.codigo && selecao.tipo !== 'consolidado' ? `Secretaria ${selecao.codigo}` : '',
      selecao.periodo ? App.utils.periodo.rotuloFiltro(selecao.periodo) : ''
    ].filter(Boolean).join(' · ');

    const construtores = {
      consolidado: () => relatorioConsolidado(todas, filtro),
      detalhado: () => relatorioDetalhado(alvo, filtro),
      fichas: () => relatorioFichas(alvo, filtro),
      periodo: () => relatorioPeriodo(alvo)
    };

    limpar(area).append(criar('article', {
      classe: 'relatorio',
      testid: 'relatorio',
      attrs: { 'aria-label': tipo.rotulo },
      filhos: [cabecalhoRelatorio(tipo.rotulo, filtrosTexto), ...construtores[selecao.tipo](), assinaturas()]
    }));
  }

  /* ------------------------------- Formulário -------------------------------- */

  function formulario(area) {
    const secretarias = store.getSecretarias();
    const periodos = calculos.listarPeriodos(secretarias);
    const botaoImprimir = botao({ rotulo: 'Imprimir / PDF', testid: 'btn-relatorio-imprimir', attrs: { disabled: true }, aoClicar: () => window.print() });

    const form = criar('form', {
      classe: 'form form--grade cartao nao-imprimir',
      testid: 'form-relatorio',
      attrs: { novalidate: true, 'aria-label': 'Parâmetros do relatório' },
      filhos: [
        resumoErros('form-relatorio-resumo-erros'),
        campo({ id: 'rel-tipo', nome: 'tipo', rotulo: 'Tipo de relatório', tipo: 'select', valor: selecao.tipo, obrigatorio: true, testid: 'select-relatorio-tipo', opcoes: TIPOS }),
        campo({
          id: 'rel-secretaria', nome: 'codigo', rotulo: 'Secretaria', tipo: 'select', valor: selecao.codigo, testid: 'select-relatorio-secretaria',
          dica: 'Não se aplica ao Consolidado Geral.',
          opcoes: [{ valor: '', rotulo: 'Todas as secretarias' }, ...secretarias.map((s) => ({ valor: s.codigo, rotulo: `${s.codigo} — ${s.nome}` }))]
        }),
        campo({
          id: 'rel-periodo', nome: 'periodo', rotulo: 'Competência (mês)', tipo: 'select', valor: selecao.periodo, testid: 'select-relatorio-periodo',
          opcoes: [{ valor: '', rotulo: 'Todas as competências' }, ...periodos]
        }),
        criar('div', {
          classe: 'form__acoes form__campo--largo',
          filhos: [botao({ rotulo: 'Gerar relatório', variante: 'primario', tipo: 'submit', testid: 'btn-relatorio-gerar' }), botaoImprimir]
        })
      ]
    });

    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const valores = Object.fromEntries(new FormData(form).entries());
      const erros = {};
      if (!TIPOS.some((t) => t.valor === valores.tipo)) erros.tipo = 'Selecione um tipo de relatório válido.';
      if (!aplicarErros(form, erros)) return;
      Object.assign(selecao, valores);
      gerar(area);
      botaoImprimir.disabled = false;
    });
    return form;
  }

  function render(container) {
    container.append(cabecalhoPagina({ titulo: 'Relatórios', subtitulo: 'Gere e imprima relatórios (ou salve em PDF pela janela de impressão).', testid: 'relatorios-cabecalho' }));
    if (!store.temDados()) {
      container.append(estadoVazio({ titulo: 'Sem dados', mensagem: 'Importe uma planilha para gerar relatórios.', acao: botao({ rotulo: 'Importar planilha', variante: 'primario', testid: 'btn-relatorios-importar', aoClicar: App.modules.importar.abrir }) }));
      return;
    }
    const area = criar('div', { classe: 'relatorio-area', testid: 'relatorio-area', attrs: { 'aria-live': 'polite' } });
    container.append(formulario(area), area);
  }

  App.modules.relatorios = Object.freeze({ render });
})(window.OrcApp);
