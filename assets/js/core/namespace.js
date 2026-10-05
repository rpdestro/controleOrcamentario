/**
 * @file namespace.js
 * @description Cria o namespace raiz da aplicação.
 * É o ÚNICO identificador exposto no escopo global (window.OrcApp).
 * Todos os demais módulos se registram dentro dele, evitando poluição global
 * e permitindo que a aplicação rode via duplo clique (file://), sem servidor.
 */
(function (global) {
  'use strict';

  global.OrcApp = global.OrcApp || {
    core: {},    // configuração, eventos
    utils: {},   // funções puras utilitárias (formatação, DOM, validação)
    data: {},    // modelo, cálculos, importação/exportação, persistência
    ui: {},      // componentes de interface reutilizáveis
    modules: {}  // telas da aplicação (Painel, Secretaria, Relatórios...)
  };
})(window);
