/**
 * @file seletorFiltroReservas.js
 * @description Seletor do filtro de reservas (v1.5): processos e fontes em
 * caixas de seleção, mais um campo "Outros" para códigos fora da lista.
 * Usado em Configurações (filtro padrão) e na atualização Fiorilli.
 *
 * Regra mantida das versões anteriores: nada marcado e "Outros" vazio
 * = sem restrição (todas as notas entram na Reserva).
 */
(function (App) {
  'use strict';

  const { criar } = App.utils.dom;
  const { campo, botao } = App.ui.componentes;

  /**
   * Um grupo (processos OU fontes).
   * @returns {{elemento:HTMLElement, ler:Function}} ler() -> string[] (marcados + outros)
   */
  function grupo({ nome, legenda, opcoes, valores, rotuloOpcao, dicaOutros, testid, aoMudar }) {
    const marcados = new Set(valores);
    const outrosValores = valores.filter((v) => !opcoes.includes(v));

    const caixas = opcoes.map((opcao) => criar('input', {
      testid: `${testid}-opcao-${opcao}`,
      attrs: { type: 'checkbox', name: `${nome}Marcados`, value: opcao, checked: marcados.has(opcao) }
    }));
    const outros = campo({
      id: `${testid}-outros`, nome, rotulo: 'Outros (separe por vírgula)', valor: outrosValores.join(', '),
      testid: `${testid}-outros`, dica: dicaOutros, attrs: { autocomplete: 'off' }
    });
    const inputOutros = outros.querySelector('input');
    const resumo = criar('small', { classe: 'form__dica seletor-filtro__resumo', attrs: { 'aria-live': 'polite' } });

    const ler = () => [
      ...caixas.filter((c) => c.checked).map((c) => c.value),
      ...App.data.fiorilli.listaDeTexto(inputOutros.value)
    ];
    const atualizarResumo = () => {
      const lista = ler();
      resumo.textContent = lista.length ? `Selecionados: ${lista.join(', ')}` : 'Nenhum selecionado: todas as notas entram (sem restrição).';
    };
    const mudou = () => { atualizarResumo(); if (aoMudar) aoMudar(); };
    const marcarTodos = (valor) => { caixas.forEach((c) => { c.checked = valor; }); mudou(); };

    caixas.forEach((c) => c.addEventListener('change', mudou));
    inputOutros.addEventListener('input', mudou);
    atualizarResumo();

    const elemento = criar('fieldset', {
      classe: 'form__campo form__grupo-radio seletor-filtro',
      testid,
      filhos: [
        criar('legend', { classe: 'form__rotulo', texto: legenda }),
        criar('div', {
          classe: 'seletor-filtro__opcoes',
          filhos: caixas.map((c, i) => criar('label', { classe: 'form__radio', filhos: [c, criar('span', { texto: rotuloOpcao(opcoes[i]) })] }))
        }),
        criar('div', {
          classe: 'form__acoes',
          filhos: [
            botao({ rotulo: 'Marcar todos', tamanho: 'pequeno', variante: 'fantasma', testid: `${testid}-todos`, aoClicar: () => marcarTodos(true) }),
            botao({ rotulo: 'Desmarcar todos', tamanho: 'pequeno', variante: 'fantasma', testid: `${testid}-nenhum`, aoClicar: () => marcarTodos(false) })
          ]
        }),
        outros,
        resumo
      ]
    });
    return { elemento, ler };
  }

  /** Une a lista padrão com códigos extras (ex.: encontrados no arquivo), sem repetição. */
  const unir = (padrao, extras = []) => [...new Set([...padrao, ...extras])]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

  /**
   * Cria o seletor completo.
   * @param {Object} opcoes
   * @param {{processos:string[], fontes:string[]}} opcoes.filtro filtro atual (normalizado)
   * @param {string} opcoes.testid prefixo dos data-testid
   * @param {{processos?:string[], fontes?:string[]}} [opcoes.extras] códigos adicionais a oferecer
   * @param {boolean} [opcoes.comFontes=true] exibir o grupo de fontes
   * @param {Function} [opcoes.aoMudar] chamado a cada alteração
   * @returns {{elemento:HTMLElement, ler:Function}} ler() -> { processos, fontes } (texto bruto, normalizar depois)
   */
  function criarSeletor({ filtro, testid, extras = {}, comFontes = true, aoMudar }) {
    const config = App.core.config;
    const { PROCESSO_VAZIO } = App.data.fiorilli;
    const processos = grupo({
      nome: 'processos', legenda: 'Processos', testid: `${testid}-processos`, aoMudar,
      opcoes: unir(config.PROCESSOS_DISPONIVEIS, extras.processos),
      valores: filtro.processos,
      rotuloOpcao: (p) => (p === PROCESSO_VAZIO ? 'Sem processo' : p),
      dicaOutros: `Comparação exata (001.003 não inclui 001.003.2). Use "${PROCESSO_VAZIO}" para notas sem processo.`
    });
    const fontes = comFontes ? grupo({
      nome: 'fontes', legenda: 'Fontes de recurso', testid: `${testid}-fontes`, aoMudar,
      opcoes: unir(config.FONTES_DISPONIVEIS, extras.fontes),
      valores: filtro.fontes,
      rotuloOpcao: (f) => `Fonte ${f}`,
      dicaOutros: 'Números ("01" = "1").'
    }) : null;

    return {
      elemento: criar('div', { classe: 'seletor-filtro__grade form__campo--largo', filhos: [processos.elemento, fontes && fontes.elemento] }),
      ler: () => ({ processos: processos.ler(), fontes: fontes ? fontes.ler() : [...filtro.fontes] })
    };
  }

  App.ui.seletorFiltroReservas = Object.freeze({ criar: criarSeletor });
})(window.OrcApp);
