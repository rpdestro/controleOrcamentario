/**
 * @file toast.js
 * @description Notificações temporárias acessíveis (região aria-live).
 */
(function (App) {
  'use strict';

  const { criar } = App.utils.dom;
  const DURACAO_MS = 5000;

  /**
   * Exibe uma notificação.
   * @param {string} mensagem
   * @param {'sucesso'|'erro'|'aviso'|'info'} [tipo='info']
   */
  function mostrar(mensagem, tipo = 'info') {
    const area = document.getElementById('toasts');
    if (!area) return;

    const toast = criar('div', {
      classe: `toast toast--${tipo}`,
      testid: `toast-${tipo}`,
      attrs: { role: tipo === 'erro' ? 'alert' : 'status' },
      filhos: [
        criar('span', { classe: 'toast__mensagem', texto: mensagem }),
        criar('button', {
          classe: 'toast__fechar',
          texto: '×',
          testid: 'toast-fechar',
          attrs: { type: 'button', 'aria-label': 'Fechar notificação' },
          on: { click: () => toast.remove() }
        })
      ]
    });
    area.append(toast);
    setTimeout(() => toast.remove(), tipo === 'erro' ? DURACAO_MS * 2 : DURACAO_MS);
  }

  App.ui.toast = Object.freeze({
    mostrar,
    sucesso: (m) => mostrar(m, 'sucesso'),
    erro: (m) => mostrar(m, 'erro'),
    aviso: (m) => mostrar(m, 'aviso'),
    info: (m) => mostrar(m, 'info')
  });
})(window.OrcApp);
