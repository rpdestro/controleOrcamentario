/**
 * @file painel.js
 * @description Módulo "Painel": visão geral consolidada de todas as secretarias.
 *  - indicadores (KPIs) gerais;
 *  - gráfico de resultado por secretaria (barras divergentes em CSS);
 *  - quadro consolidado (equivalente à aba GERAL);
 *  - essencial por período;
 *  - alertas de conferência da importação.
 */
(function (App) {
  'use strict';

  const { criar } = App.utils.dom;
  const { moeda, dataHoraBR } = App.utils.format;
  const componentes = App.ui.componentes;
  const { kpi, varianteSinal, tabela, estadoVazio, cabecalhoPagina, botao, campo, alerta } = componentes;
  const filtroTabela = App.utils.filtroTabela;
  const periodo = App.utils.periodo;
  const calculos = App.data.calculos;
  const store = App.data.store;

  // Estado do módulo (preservado entre renderizações).
  const filtro = { periodo: '' };
  let filtroConsolidado = filtroTabela.criarEstado();

  /**
   * Origem dos saldos (v1.6): relatório Fiorilli em uso, quantas fichas usam o
   * Fiorilli ou a planilha e aviso quando a planilha é mais recente que o relatório.
   */
  function blocoFiorilli(info, meta) {
    const botaoAtualizar = () => botao({ rotulo: 'Atualizar com Fiorilli', tamanho: 'pequeno', variante: 'fantasma', testid: 'btn-painel-fiorilli', aoClicar: App.modules.fiorilli.abrir });
    if (!info) {
      return alerta({
        nivel: 'info',
        testid: 'painel-fiorilli-pendente',
        filhos: ['Origem dos saldos: planilha. Reserva e Saldo ainda não foram atualizados com o Fiorilli. ', botaoAtualizar()]
      });
    }
    const regra = ` Reserva = processos ${info.filtro.processos.join(', ') || '(qualquer)'} · fonte ${info.filtro.fontes.join(', ') || '(qualquer)'}.`;
    const desatualizado = App.utils.format.compararDatasBR(meta.atualizadoEm, info.dataSaldos) > 0;
    return criar('div', {
      filhos: [
        alerta({
          nivel: 'sucesso',
          testid: 'painel-fiorilli-status',
          mensagem: `Origem dos saldos: Fiorilli de ${info.dataSaldos || '—'} (arquivo ${info.arquivo}, aplicado em ${dataHoraBR(info.aplicadoEm)}) em ${info.fichasFiorilli} ficha(s); ` +
            `${info.fichasPlanilha} ficha(s) fora do relatório usam os valores da planilha.${regra}`
        }),
        desatualizado ? alerta({
          nivel: 'aviso',
          testid: 'painel-fiorilli-desatualizado',
          filhos: [`A planilha (${meta.atualizadoEm}) é mais recente que o relatório Fiorilli em uso (${info.dataSaldos}). `, botaoAtualizar()]
        }) : null
      ]
    });
  }

  /** Aviso de movimentações registradas, com opção de descartá-las (volta aos saldos oficiais). */
  function blocoMovimentacoes(transferencias) {
    if (!transferencias.length) return null;
    const descartar = async () => {
      const confirmado = await App.ui.modal.confirmar({
        titulo: 'Descartar movimentações',
        mensagem: `Descartar as ${transferencias.length} transferência(s) registrada(s)? Os saldos voltam aos valores oficiais (Fiorilli/planilha).`,
        rotuloConfirmar: 'Descartar todas',
        perigo: true,
        testid: 'modal-descartar-transferencias'
      });
      if (!confirmado) return;
      try {
        store.limparTransferencias();
        App.ui.toast.sucesso('Movimentações descartadas.');
      } catch (erro) {
        App.ui.toast.erro(erro.message);
      }
    };
    return alerta({
      nivel: 'info',
      testid: 'painel-movimentacoes',
      filhos: [
        `${transferencias.length} transferência(s) entre fichas registrada(s): os totais abaixo já as consideram. Os saldos oficiais não foram alterados. `,
        botao({ rotulo: 'Descartar todas', tamanho: 'pequeno', variante: 'perigo-texto', testid: 'btn-descartar-transferencias', aoClicar: descartar })
      ]
    });
  }

  function blocoKpis(geral) {
    return criar('section', {
      classe: 'kpis',
      attrs: { 'aria-label': 'Indicadores gerais' },
      filhos: [
        kpi({ rotulo: 'Essencial (demanda)', valor: moeda(geral.essencial), variante: 'negativo', testid: 'kpi-essencial' }),
        kpi({ rotulo: 'Reserva', valor: moeda(geral.reserva), variante: 'positivo', testid: 'kpi-reserva' }),
        kpi({ rotulo: 'Saldo Ficha', valor: moeda(geral.saldoFicha), variante: 'positivo', testid: 'kpi-saldo' }),
        kpi({ rotulo: 'Folha', valor: moeda(geral.folha), variante: 'negativo', testid: 'kpi-folha', dica: filtro.periodo ? 'Não considerada com filtro de período' : null }),
        kpi({ rotulo: 'Resultado', valor: moeda(geral.resultado), variante: varianteSinal(geral.resultado), testid: 'kpi-resultado', dica: 'Reserva + Saldo − Essencial − Folha' })
      ]
    });
  }

  /** Gráfico de barras divergentes: negativo à esquerda, positivo à direita. */
  function graficoResultado(porSecretaria) {
    return criar('section', {
      classe: 'cartao',
      testid: 'painel-grafico',
      filhos: [
        criar('h2', { classe: 'cartao__titulo', texto: 'Resultado por secretaria' }),
        criar('p', { classe: 'cartao__descricao', texto: 'Barras à esquerda indicam déficit; à direita, sobra de recursos.' }),
        componentes.graficoResultado(porSecretaria, { testid: 'painel-grafico-barras' })
      ]
    });
  }

  const COLUNAS_CONSOLIDADO = Object.freeze([
    { rotulo: 'U.O.', chave: 'codigo', filtravel: true, render: (t) => criar('a', { texto: t.codigo, testid: `link-secretaria-${t.codigo}`, attrs: { href: `#/secretaria/${t.codigo}` } }) },
    { rotulo: 'Secretaria', chave: 'nome', filtravel: true },
    { rotulo: 'Essencial', chave: 'essencial', moeda: true, filtravel: true },
    { rotulo: 'Folha', chave: 'folha', moeda: true, filtravel: true },
    { rotulo: 'Reserva', chave: 'reserva', moeda: true, filtravel: true },
    { rotulo: 'Saldo Ficha', chave: 'saldoFicha', moeda: true, filtravel: true },
    {
      rotulo: 'Resultado', chave: 'resultado', moeda: true, filtravel: true,
      render: (t) => criar('span', { classe: `valor valor--${varianteSinal(t.resultado)}`, texto: moeda(t.resultado) })
    }
  ]);

  /** Quadro consolidado com filtros de coluna; o total acompanha as linhas visíveis. */
  function quadroConsolidado(porSecretaria) {
    const visiveis = filtroTabela.aplicar(porSecretaria, COLUNAS_CONSOLIDADO, filtroConsolidado);
    const soma = (c) => visiveis.reduce((t, s) => t + s[c], 0);
    const filtrado = filtroTabela.temFiltro(filtroConsolidado);
    return criar('section', {
      classe: 'cartao',
      filhos: [
        criar('h2', { classe: 'cartao__titulo', texto: 'Quadro consolidado (GERAL)' }),
        tabela({
          testid: 'tabela-consolidado',
          legenda: `Totais por Unidade Orçamentária${filtrado ? ` — exibindo ${visiveis.length} de ${porSecretaria.length}` : ''}`,
          colunas: COLUNAS_CONSOLIDADO,
          linhas: visiveis,
          filtro: {
            estado: filtroConsolidado,
            linhasBase: porSecretaria,
            aoAlterar: (novo) => { filtroConsolidado = novo; App.ui.router.renderizar({ manterFoco: true }); }
          },
          rodape: ['', filtrado ? 'TOTAL (linhas exibidas)' : 'TOTAL GERAL', ...['essencial', 'folha', 'reserva', 'saldoFicha', 'resultado'].map((c) => moeda(soma(c)))]
        })
      ]
    });
  }

  function quadroPeriodos(secretarias) {
    return criar('section', {
      classe: 'cartao',
      filhos: [
        criar('h2', { classe: 'cartao__titulo', texto: 'Essencial por período' }),
        tabela({
          testid: 'tabela-periodos',
          legenda: 'Demanda essencial agrupada pela observação (período)',
          colunas: [
            { rotulo: 'Período', chave: 'periodo' },
            { rotulo: 'Linhas', chave: 'qtdLinhas', numerico: true },
            { rotulo: 'Essencial', chave: 'essencial', moeda: true }
          ],
          linhas: calculos.agruparPorPeriodo(secretarias)
        })
      ]
    });
  }

  function blocoAlertas(alertas) {
    if (!alertas.length) return null;
    return criar('section', {
      classe: 'cartao',
      testid: 'painel-alertas',
      filhos: [
        criar('details', {
          filhos: [
            criar('summary', { classe: 'cartao__titulo', texto: `Alertas de conferência da importação (${alertas.length})` }),
            criar('ul', {
              classe: 'lista-alertas',
              filhos: alertas.map((a) => criar('li', { classe: `lista-alertas__item lista-alertas__item--${a.nivel}`, texto: a.mensagem }))
            })
          ]
        })
      ]
    });
  }

  function filtroPeriodo(periodos) {
    const wrapper = campo({
      id: 'painel-periodo', nome: 'periodo', rotulo: 'Filtrar por competência (mês)', tipo: 'select', valor: filtro.periodo,
      testid: 'select-painel-periodo',
      opcoes: [{ valor: '', rotulo: 'Todas as competências' }, ...periodos]
    });
    wrapper.querySelector('select').addEventListener('change', (e) => {
      filtro.periodo = e.target.value;
      App.ui.router.renderizar({ manterFoco: true });
    });
    return criar('div', { classe: 'barra-ferramentas', filhos: [wrapper] });
  }

  function render(container) {
    const estado = store.getEstado();
    const meta = estado.meta;

    container.append(cabecalhoPagina({
      titulo: 'Painel Geral',
      subtitulo: meta.arquivo ? `Base: ${meta.arquivo} · Atualizado em ${meta.atualizadoEm || '—'}` : 'Nenhuma planilha importada',
      testid: 'painel-cabecalho'
    }));

    if (!store.temDados()) {
      container.append(estadoVazio({
        titulo: 'Comece importando a planilha',
        mensagem: 'Importe o arquivo XLSX, XLS ou CSV com as fichas das secretarias para visualizar o painel.',
        acao: botao({ rotulo: 'Importar planilha', variante: 'primario', testid: 'btn-painel-importar', aoClicar: App.modules.importar.abrir })
      }));
      return;
    }

    // v1.4: totais com as transferências registradas (saldos oficiais preservados).
    const secretarias = store.getSecretariasProjetadas();
    const periodos = calculos.listarPeriodos(secretarias);
    if (filtro.periodo && !periodos.some((p) => p.valor === filtro.periodo)) filtro.periodo = '';
    const { geral, porSecretaria } = calculos.totaisGerais(secretarias, filtro);
    const naoPadronizados = calculos.contarNaoPadronizados(secretarias);

    container.append(...[
      blocoFiorilli(store.getInfoFiorilli(), meta),
      blocoMovimentacoes(store.getTransferencias()),
      filtroPeriodo(periodos),
      filtro.periodo ? alerta({ nivel: 'info', mensagem: `Exibindo: ${periodo.rotuloFiltro(filtro.periodo)}. A Folha não é considerada.`, testid: 'painel-filtro-ativo' }) : null,
      naoPadronizados ? alerta({ nivel: 'aviso', testid: 'painel-periodos-nao-padronizados', mensagem: `${naoPadronizados} linha(s) com período em texto livre (não padronizado). Revise nas telas das secretarias (filtro "⚠ Não padronizado").` }) : null,
      blocoKpis(geral),
      criar('div', { classe: 'grade-2', filhos: [graficoResultado(porSecretaria), quadroPeriodos(secretarias)] }),
      quadroConsolidado(porSecretaria),
      blocoAlertas(estado.alertas || [])
    ].filter(Boolean));
  }

  App.modules.painel = Object.freeze({ render });
})(window.OrcApp);
