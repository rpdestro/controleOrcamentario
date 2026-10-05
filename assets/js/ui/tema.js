/**
 * @file tema.js
 * @description Modo claro / escuro.
 * - Carregado SEM defer no <head>: aplica o tema antes da primeira pintura
 *   (evita o "piscar" de tela clara).
 * - Preferência salva no navegador; na primeira visita segue o sistema operacional.
 * - O botão usa aria-pressed (ligado = modo escuro ativo).
 */
(function (App) {
  'use strict';

  const CHAVE = App.core.config.TEMA_STORAGE_KEY;
  const raiz = document.documentElement;
  let botao = null;

  function temaPreferido() {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo === 'claro' || salvo === 'escuro') return salvo;
    } catch (erro) {
      /* armazenamento indisponível: segue o sistema */
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  }

  const atual = () => (raiz.dataset.tema === 'escuro' ? 'escuro' : 'claro');

  function atualizarBotao() {
    if (!botao) return;
    const escuro = atual() === 'escuro';
    botao.setAttribute('aria-pressed', String(escuro));
    botao.title = escuro ? 'Voltar ao modo claro' : 'Ativar modo escuro';
    const icone = botao.querySelector('.app-header__tema-icone');
    if (icone) icone.textContent = escuro ? '☀️' : '🌙';
  }

  function aplicar(tema) {
    raiz.dataset.tema = tema;
    atualizarBotao();
  }

  function alternar() {
    const novo = atual() === 'escuro' ? 'claro' : 'escuro';
    aplicar(novo);
    try {
      localStorage.setItem(CHAVE, novo);
    } catch (erro) {
      /* sem persistência: o tema vale apenas nesta sessão */
    }
  }

  /** Liga o botão do cabeçalho (chamado no bootstrap). */
  function ligarBotao(elemento) {
    botao = elemento;
    botao.addEventListener('click', alternar);
    atualizarBotao();
  }

  aplicar(temaPreferido()); // imediato

  App.ui.tema = Object.freeze({ alternar, atual, ligarBotao });
})(window.OrcApp);
