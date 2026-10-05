/**
 * @file events.js
 * @description Barramento de eventos (publish/subscribe) desacoplando
 * a camada de dados (store) da camada de interface.
 *
 * Eventos utilizados:
 *  - 'estado:alterado'  -> payload { motivo: string }
 */
(function (App) {
  'use strict';

  function criarBarramento() {
    const ouvintes = new Map();

    return Object.freeze({
      /** Registra um ouvinte. Retorna função para cancelar a inscrição. */
      on(evento, callback) {
        if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
        ouvintes.get(evento).add(callback);
        return () => ouvintes.get(evento).delete(callback);
      },

      /** Dispara o evento; erros de um ouvinte não interrompem os demais. */
      emit(evento, payload) {
        (ouvintes.get(evento) || []).forEach((callback) => {
          try {
            callback(payload);
          } catch (erro) {
            console.error(`[eventos] Falha no ouvinte de "${evento}":`, erro);
          }
        });
      }
    });
  }

  App.core.events = criarBarramento();
  App.core.criarBarramento = criarBarramento; // exposto para testes
})(window.OrcApp);
