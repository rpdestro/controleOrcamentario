/**
 * @file nav.js
 * @description Menu lateral: módulos fixos + lista dinâmica de secretarias.
 * Atualiza-se sozinho quando secretarias são incluídas/removidas.
 */
(function (App) {
  'use strict';

  const { criar, limpar } = App.utils.dom;
  const store = App.data.store;

  let raiz = null;

  function link({ caminho, rotulo, testid, detalhe }) {
    return criar('li', {
      classe: 'nav__item',
      filhos: [criar('a', {
        classe: 'nav__link',
        testid,
        attrs: { href: `#${caminho}`, 'data-caminho': caminho, title: detalhe || rotulo },
        filhos: [criar('span', { classe: 'nav__texto', texto: rotulo })]
      })]
    });
  }

  function grupo(titulo, itens, testid) {
    return criar('section', {
      classe: 'nav__grupo',
      testid,
      filhos: [
        criar('h2', { classe: 'nav__titulo-grupo', texto: titulo }),
        criar('ul', { classe: 'nav__lista', filhos: itens })
      ]
    });
  }

  function renderizar() {
    limpar(raiz);
    raiz.append(
      grupo('Geral', [
        link({ caminho: '/painel', rotulo: 'Painel', testid: 'nav-painel' }),
        link({ caminho: '/relatorios', rotulo: 'Relatórios', testid: 'nav-relatorios' }),
        link({ caminho: '/exportar', rotulo: 'Exportar', testid: 'nav-exportar' }),
        link({ caminho: '/configuracoes', rotulo: 'Configurações', testid: 'nav-configuracoes' })
      ], 'nav-grupo-geral'),
      grupo(`Secretarias (${store.getSecretarias().length})`, store.getSecretarias().map((s) => link({
        caminho: `/secretaria/${s.codigo}`,
        rotulo: `${s.codigo} · ${App.utils.format.nomeCurto(s.nome)}`,
        detalhe: s.nome,
        testid: `nav-secretaria-${s.codigo}`
      })), 'nav-grupo-secretarias')
    );
    marcarAtivo();
  }

  /** Destaca o link correspondente à rota atual (aria-current). */
  function marcarAtivo() {
    const rota = App.ui.router.resolver();
    raiz.querySelectorAll('.nav__link').forEach((a) => {
      const ativo = rota && a.dataset.caminho === rota.caminho;
      a.classList.toggle('nav__link--ativo', ativo);
      if (ativo) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function iniciar(elemento) {
    raiz = elemento;
    renderizar();
    App.core.events.on('estado:alterado', renderizar);
    App.core.events.on('rota:alterada', marcarAtivo);
  }

  App.ui.nav = Object.freeze({ iniciar });
})(window.OrcApp);
