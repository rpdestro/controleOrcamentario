/**
 * @file test-runner.js
 * @description Executor de testes minimalista (sem dependências / sem Node).
 * API: describe(nome, fn) · it(nome, fn) · expect(valor).toBe/toEqual/toBeCloseTo/toThrow/toBeTruthy/toContain
 * Resultado exposto em window.__RESULTADO_TESTES__ para automação (CI/Playwright).
 */
(function (global) {
  'use strict';

  const suites = [];
  let suiteAtual = null;

  function describe(nome, fn) {
    suiteAtual = { nome, casos: [] };
    suites.push(suiteAtual);
    fn();
    suiteAtual = null;
  }

  function it(nome, fn) {
    suiteAtual.casos.push({ nome, fn });
  }

  const formatar = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

  function expect(recebido) {
    const falhar = (msg) => { throw new Error(msg); };
    return {
      toBe: (esperado) => { if (!Object.is(recebido, esperado)) falhar(`Esperado ${formatar(esperado)}, recebido ${formatar(recebido)}`); },
      toEqual: (esperado) => { if (formatar(recebido) !== formatar(esperado)) falhar(`Esperado ${formatar(esperado)}, recebido ${formatar(recebido)}`); },
      toBeCloseTo: (esperado, casas = 2) => { if (Math.abs(recebido - esperado) > 10 ** -casas / 2) falhar(`Esperado ≈${esperado}, recebido ${recebido}`); },
      toBeTruthy: () => { if (!recebido) falhar(`Esperado valor verdadeiro, recebido ${formatar(recebido)}`); },
      toBeFalsy: () => { if (recebido) falhar(`Esperado valor falso, recebido ${formatar(recebido)}`); },
      toContain: (item) => { if (!recebido.includes(item)) falhar(`Esperado conter ${formatar(item)}`); },
      toThrow: () => {
        let lancou = false;
        try { recebido(); } catch { lancou = true; }
        if (!lancou) falhar('Esperado lançar erro');
      }
    };
  }

  async function executar(alvo) {
    const resultado = { total: 0, aprovados: 0, falhas: [] };
    for (const suite of suites) {
      const secao = document.createElement('section');
      secao.className = 'suite';
      const titulo = document.createElement('h2');
      titulo.textContent = suite.nome;
      secao.append(titulo);
      const lista = document.createElement('ul');

      for (const caso of suite.casos) {
        resultado.total += 1;
        const item = document.createElement('li');
        try {
          await caso.fn();
          resultado.aprovados += 1;
          item.className = 'caso caso--ok';
          item.textContent = `✔ ${caso.nome}`;
        } catch (erro) {
          resultado.falhas.push({ suite: suite.nome, caso: caso.nome, erro: erro.message });
          item.className = 'caso caso--falha';
          item.textContent = `✘ ${caso.nome} — ${erro.message}`;
        }
        item.dataset.testid = 'caso-teste';
        lista.append(item);
      }
      secao.append(lista);
      alvo.append(secao);
    }
    global.__RESULTADO_TESTES__ = resultado;
    return resultado;
  }

  global.TestRunner = { describe, it, expect, executar };
})(window);
