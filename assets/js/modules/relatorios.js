/**
 * @file relatorios.js
 * @description Módulo "Relatórios": gera o relatório oficial para impressão / PDF,
 * com DUAS páginas:
 *   Página 1 — Consolidado Geral (quadro por secretaria, igual à aba GERAL);
 *   Página 2 — Gráfico "Resultado por secretaria".
 * Cada página traz o brasão da Prefeitura no cabeçalho. A impressão usa
 * print.css, que oculta a interface e força a quebra entre as páginas.
 */
(function (App) {
  'use strict';

  const { criar, limpar } = App.utils.dom;
  const { moeda, dataHoraBR } = App.utils.format;
  const { tabela, cabecalhoPagina, botao, campo, estadoVazio, graficoResultado } = App.ui.componentes;
  const calculos = App.data.calculos;
  const store = App.data.store;
  const config = App.core.config;

  const TOTAL_PAGINAS = 2;
  const selecao = { periodo: '' }; // preservado na sessão

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
  function pagina(numero, titulo, filtrosTexto, conteudo) {
    return criar('section', {
      classe: 'relatorio__pagina',
      testid: `relatorio-pagina-${numero}`,
      attrs: { 'aria-label': `Página ${numero}: ${titulo}` },
      filhos: [
        cabecalhoRelatorio(titulo, filtrosTexto),
        ...conteudo,
        criar('p', { classe: 'relatorio__numero-pagina', texto: `Página ${numero} de ${TOTAL_PAGINAS}` })
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

  /** Monta as duas páginas do relatório conforme a competência selecionada. */
  function gerar(area) {
    const { geral, porSecretaria } = calculos.totaisGerais(store.getSecretarias(), { periodo: selecao.periodo });
    const filtrosTexto = selecao.periodo ? `${App.utils.periodo.rotuloFiltro(selecao.periodo)} (Folha não considerada)` : '';

    limpar(area).append(criar('article', {
      classe: 'relatorio',
      testid: 'relatorio',
      attrs: { 'aria-label': 'Relatório Consolidado Geral' },
      filhos: [
        pagina(1, 'Consolidado Geral', filtrosTexto, [tabelaConsolidado(geral, porSecretaria)]),
        pagina(2, 'Resultado por secretaria', filtrosTexto, [
          criar('p', { classe: 'relatorio__legenda', texto: 'Resultado = Reserva + Saldo Ficha − Essencial − Folha. Barras à esquerda (vermelho) indicam déficit; à direita (verde), sobra de recursos.' }),
          graficoResultado(porSecretaria, { testid: 'relatorio-grafico', nomeCompleto: true }),
          criar('p', { classe: 'relatorio__resumo', texto: `Resultado geral: ${moeda(geral.resultado)}` })
        ])
      ]
    }));
  }

  /* ------------------------------- Formulário -------------------------------- */

  function formulario(area) {
    const periodos = calculos.listarPeriodos(store.getSecretarias());
    if (selecao.periodo && !periodos.some((p) => p.valor === selecao.periodo)) selecao.periodo = '';
    const botaoImprimir = botao({ rotulo: 'Imprimir / PDF', testid: 'btn-relatorio-imprimir', attrs: { disabled: true }, aoClicar: () => window.print() });

    const form = criar('form', {
      classe: 'form form--grade cartao nao-imprimir',
      testid: 'form-relatorio',
      attrs: { novalidate: true, 'aria-label': 'Parâmetros do relatório' },
      filhos: [
        campo({
          id: 'rel-periodo', nome: 'periodo', rotulo: 'Competência (mês)', tipo: 'select', valor: selecao.periodo, testid: 'select-relatorio-periodo',
          dica: 'Página 1: Consolidado Geral · Página 2: gráfico Resultado por secretaria.',
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
      selecao.periodo = form.elements.periodo.value;
      gerar(area);
      botaoImprimir.disabled = false;
    });
    return form;
  }

  function render(container) {
    container.append(cabecalhoPagina({ titulo: 'Relatórios', subtitulo: 'Relatório Consolidado Geral em duas páginas. Imprima ou salve em PDF pela janela de impressão.', testid: 'relatorios-cabecalho' }));
    if (!store.temDados()) {
      container.append(estadoVazio({ titulo: 'Sem dados', mensagem: 'Importe uma planilha para gerar relatórios.', acao: botao({ rotulo: 'Importar planilha', variante: 'primario', testid: 'btn-relatorios-importar', aoClicar: App.modules.importar.abrir }) }));
      return;
    }
    const area = criar('div', { classe: 'relatorio-area', testid: 'relatorio-area', attrs: { 'aria-live': 'polite' } });
    container.append(formulario(area), area);
  }

  App.modules.relatorios = Object.freeze({ render });
})(window.OrcApp);
