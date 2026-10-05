/**
 * @file dom.js
 * @description Utilitários mínimos para criação de elementos.
 * Todo conteúdo dinâmico é inserido via textContent (nunca innerHTML),
 * prevenindo injeção de HTML a partir de dados de planilhas.
 */
(function (App) {
  'use strict';

  /**
   * Cria um elemento de forma declarativa.
   * @param {string} tag
   * @param {Object} [opcoes]
   * @param {string} [opcoes.classe]   classes CSS (BEM)
   * @param {string} [opcoes.texto]    textContent
   * @param {string} [opcoes.testid]   valor de data-testid
   * @param {Object} [opcoes.attrs]    atributos (null/false = omitido)
   * @param {Object} [opcoes.on]       eventos { click: fn }
   * @param {Array}  [opcoes.filhos]   nós ou strings
   * @returns {HTMLElement}
   */
  function criar(tag, opcoes = {}) {
    const elemento = document.createElement(tag);
    const { classe, texto, testid, attrs = {}, on = {}, filhos = [] } = opcoes;

    if (classe) elemento.className = classe;
    if (texto !== undefined && texto !== null) elemento.textContent = String(texto);
    if (testid) elemento.dataset.testid = testid;

    Object.entries(attrs).forEach(([nome, valor]) => {
      if (valor === null || valor === undefined || valor === false) return;
      if (nome in elemento && typeof valor !== 'string') {
        elemento[nome] = valor; // propriedades (value, checked, disabled...)
      } else {
        elemento.setAttribute(nome, valor === true ? '' : String(valor));
      }
    });

    Object.entries(on).forEach(([evento, handler]) => elemento.addEventListener(evento, handler));
    filhos.filter((f) => f !== null && f !== undefined && f !== false).forEach((filho) => {
      elemento.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
    });
    return elemento;
  }

  /** Remove todos os filhos de um elemento. */
  function limpar(elemento) {
    while (elemento.firstChild) elemento.removeChild(elemento.firstChild);
    return elemento;
  }

  /** Atalho para querySelector com escopo opcional. */
  function qs(seletor, escopo = document) {
    return escopo.querySelector(seletor);
  }

  App.utils.dom = Object.freeze({ criar, limpar, qs });
})(window.OrcApp);
