/**
 * @file executar.js
 * @description Dispara a execução das especificações e exibe o resumo.
 */
(function (TestRunner) {
  'use strict';

  TestRunner.executar(document.getElementById('resultados')).then((r) => {
    const resumo = document.querySelector('[data-testid="resumo-testes"]');
    resumo.textContent = `${r.aprovados}/${r.total} aprovados${r.falhas.length ? ` — ${r.falhas.length} falha(s)` : ''}`;
    resumo.classList.add(r.falhas.length ? 'resumo--falha' : 'resumo--ok');
  });
})(window.TestRunner);
