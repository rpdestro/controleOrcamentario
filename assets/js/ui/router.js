/**
 * @file router.js
 * @description Roteamento por hash (#/painel, #/secretaria/02.01 ...).
 * Funciona via file:// e permite links diretos/favoritos para cada módulo.
 * Cada módulo expõe `render(container, params)`.
 */
(function (App) {
  'use strict';

  const { limpar } = App.utils.dom;

  /** Tabela de rotas: padrão -> nome do módulo em App.modules */
  const ROTAS = Object.freeze([
    { padrao: /^\/painel$/, modulo: 'painel' },
    { padrao: /^\/secretaria\/(\d{2}\.\d{2})$/, modulo: 'secretaria', params: ['codigo'] },
    { padrao: /^\/relatorios$/, modulo: 'relatorios' },
    { padrao: /^\/exportar$/, modulo: 'exportar' },
    { padrao: /^\/configuracoes$/, modulo: 'configuracoes' }
  ]);
  const ROTA_PADRAO = '/painel';

  let container = null;

  /** Converte o hash atual em { modulo, params, caminho }. */
  function resolver(hash = window.location.hash) {
    const caminho = decodeURIComponent(hash.replace(/^#/, '')) || ROTA_PADRAO;
    for (const rota of ROTAS) {
      const m = caminho.match(rota.padrao);
      if (m) {
        const params = {};
        (rota.params || []).forEach((nome, i) => { params[nome] = m[i + 1]; });
        return { modulo: rota.modulo, params, caminho };
      }
    }
    return null;
  }

  /** Renderiza a rota atual. `manterFoco` evita mover o foco em re-renderizações. */
  function renderizar({ manterFoco = false } = {}) {
    const rota = resolver();
    if (!rota) {
      window.location.hash = `#${ROTA_PADRAO}`;
      return;
    }
    const modulo = App.modules[rota.modulo];
    limpar(container);
    try {
      modulo.render(container, rota.params);
    } catch (erro) {
      console.error('[router] Falha ao renderizar módulo:', erro);
      container.append(App.ui.componentes.alerta({ nivel: 'erro', mensagem: `Não foi possível exibir esta tela: ${erro.message}`, testid: 'erro-renderizacao' }));
    }
    App.core.events.emit('rota:alterada', rota);

    if (!manterFoco) {
      const titulo = container.querySelector('h1');
      if (titulo) titulo.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  function navegar(caminho) {
    window.location.hash = `#${caminho}`;
  }

  function iniciar(elementoContainer) {
    container = elementoContainer;
    window.addEventListener('hashchange', () => renderizar());
    App.core.events.on('estado:alterado', () => renderizar({ manterFoco: true }));
    renderizar();
  }

  App.ui.router = Object.freeze({ iniciar, navegar, resolver, renderizar });
})(window.OrcApp);
