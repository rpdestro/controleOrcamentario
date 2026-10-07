/**
 * @file animacao.js
 * @description Pequenas animações de feedback (v1.4): contagem de valores e
 * destaque temporário de elementos. Respeitam "reduzir movimento" do sistema.
 */
(function (App) {
  'use strict';

  const reduzirMovimento = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /**
   * Anima o texto de um elemento de um valor numérico a outro.
   * @param {HTMLElement} elemento
   * @param {number} de
   * @param {number} para
   * @param {Function} formatar número -> texto (ex.: moeda)
   */
  function contar(elemento, de, para, formatar, duracao = 500) {
    if (!elemento || de === para) return;
    if (reduzirMovimento()) { elemento.textContent = formatar(para); return; }
    const inicio = performance.now();
    let terminou = false;
    const finalizar = () => { terminou = true; elemento.textContent = formatar(para); };
    const passo = (agora) => {
      if (terminou) return;
      const progresso = Math.min(1, (agora - inicio) / duracao);
      if (progresso >= 1) { finalizar(); return; }
      const suave = 1 - (1 - progresso) ** 3; // ease-out
      elemento.textContent = formatar(de + (para - de) * suave);
      requestAnimationFrame(passo);
    };
    elemento.textContent = formatar(de);
    requestAnimationFrame(passo);
    // Garantia: se a aba não estiver desenhando (rAF pausado), o valor final é aplicado mesmo assim.
    setTimeout(finalizar, duracao + 100);
  }

  /** Aplica uma classe de animação CSS e a remove ao terminar (reinicia se já estiver aplicada). */
  function destacar(elemento, classe) {
    if (!elemento) return;
    elemento.classList.remove(classe);
    void elemento.offsetWidth; // força reflow para reiniciar a animação
    elemento.classList.add(classe);
    elemento.addEventListener('animationend', () => elemento.classList.remove(classe), { once: true });
  }

  App.ui.animacao = Object.freeze({ contar, destacar, reduzirMovimento });
})(window.OrcApp);
