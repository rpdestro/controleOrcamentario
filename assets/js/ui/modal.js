/**
 * @file modal.js
 * @description Janela modal baseada no elemento nativo <dialog>
 * (foco preso, tecla Esc e semântica acessível gerenciados pelo navegador).
 */
(function (App) {
  'use strict';

  const { criar, limpar } = App.utils.dom;

  function obterDialogo() {
    return document.getElementById('modal');
  }

  /**
   * Abre a modal.
   * @param {Object} opcoes
   * @param {string} opcoes.titulo
   * @param {Node}   opcoes.conteudo
   * @param {Array<{rotulo:string, variante?:string, testid:string, aoClicar:Function, tipo?:string, form?:string}>} [opcoes.acoes]
   * @param {string} [opcoes.testid]
   * @param {'normal'|'largo'} [opcoes.tamanho]
   * @returns {{fechar:Function, elemento:HTMLDialogElement}}
   */
  function abrir({ titulo, conteudo, acoes = [], testid = 'modal', tamanho = 'normal' }) {
    const dialogo = obterDialogo();
    limpar(dialogo);
    dialogo.className = `modal modal--${tamanho}`;
    dialogo.dataset.testid = testid;
    dialogo.setAttribute('aria-labelledby', 'modal-titulo');

    const fechar = () => { if (dialogo.open) dialogo.close(); };

    const cabecalho = criar('header', {
      classe: 'modal__cabecalho',
      filhos: [
        criar('h2', { classe: 'modal__titulo', texto: titulo, attrs: { id: 'modal-titulo' } }),
        criar('button', {
          classe: 'modal__fechar',
          texto: '×',
          testid: `${testid}-fechar`,
          attrs: { type: 'button', 'aria-label': 'Fechar' },
          on: { click: fechar }
        })
      ]
    });

    const rodape = criar('footer', {
      classe: 'modal__rodape',
      filhos: acoes.map((acao) => criar('button', {
        classe: `btn btn--${acao.variante || 'secundario'}`,
        texto: acao.rotulo,
        testid: acao.testid,
        attrs: { type: acao.tipo || 'button', form: acao.form || null },
        on: acao.aoClicar ? { click: () => acao.aoClicar({ fechar }) } : {}
      }))
    });

    dialogo.append(cabecalho, criar('div', { classe: 'modal__corpo', filhos: [conteudo] }), rodape);
    dialogo.showModal();
    return { fechar, elemento: dialogo };
  }

  /**
   * Confirmação simples (substitui window.confirm).
   * @returns {Promise<boolean>}
   */
  function confirmar({ titulo = 'Confirmar', mensagem, rotuloConfirmar = 'Confirmar', perigo = false, testid = 'modal-confirmacao' }) {
    return new Promise((resolver) => {
      let resposta = false;
      const { elemento } = abrir({
        titulo,
        testid,
        conteudo: criar('p', { classe: 'modal__mensagem', texto: mensagem }),
        acoes: [
          { rotulo: 'Cancelar', variante: 'secundario', testid: `${testid}-cancelar`, aoClicar: ({ fechar }) => fechar() },
          { rotulo: rotuloConfirmar, variante: perigo ? 'perigo' : 'primario', testid: `${testid}-confirmar`, aoClicar: ({ fechar }) => { resposta = true; fechar(); } }
        ]
      });
      elemento.addEventListener('close', () => resolver(resposta), { once: true });
    });
  }

  App.ui.modal = Object.freeze({ abrir, confirmar });
})(window.OrcApp);
