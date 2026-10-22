/**
 * @file v17.spec.js
 * @description Testes dos lançamentos "fora do quadro" como rascunhos:
 * validação própria, nenhum efeito nos cálculos, posição ao incorporar e exportação.
 */
(function (TestRunner, App) {
  'use strict';

  const { describe, it, expect } = TestRunner;
  const { criarLinha, criarSecretaria, posicaoNoQuadro } = App.data.schema;
  const { validarPendente, validarIncorporacao, validarLinha } = App.utils.validators;
  const calc = App.data.calculos;
  const mov = App.data.movimentacoes;
  const exp = App.data.exporter;
  const imp = App.data.importer;
  const REF = { ano: 2026, mes: 10 };

  const RASCUNHO = { ficha: '264', ue: '020602', fonte: '1', despesa: '3.3.90.30', descricao: 'Insumos odontológicos', essencial: '6.545,69' };
  const COMPLETO = { ...RASCUNHO, periodoInicio: '2026-10', periodoFim: '2026-12' };

  describe('v1.7 — rascunho livre ao salvar', () => {
    it('aceita rascunho totalmente vazio', () => {
      expect(validarPendente({}).valido).toBe(true);
    });
    ['ficha', 'ue', 'fonte', 'despesa', 'descricao', 'essencial'].forEach((campo) => {
      it(`aceita "${campo}" em branco`, () => {
        expect(validarPendente({ ...RASCUNHO, [campo]: '  ' }).valido).toBe(true);
      });
    });
    it('aceita formatos fora do padrão (ex.: U.E com 3 dígitos)', () => {
      expect(validarPendente({ ...RASCUNHO, ue: '123', despesa: 'x' }).valido).toBe(true);
    });
    it('aceita rascunho sem período e com Observação longa', () => {
      expect(validarPendente({ ...RASCUNHO, periodoInicio: '', periodoFim: '', observacao: 'x'.repeat(400) }).valido).toBe(true);
    });
    it('só recusa valor numérico ilegível (senão viraria 0)', () => {
      expect(validarPendente({ ...RASCUNHO, essencial: 'abc' }).erros.essencial).toBeTruthy();
    });
  });

  describe('v1.7 — regras para incorporar ao quadro', () => {
    it('aceita rascunho completo com período', () => {
      expect(validarIncorporacao(COMPLETO).valido).toBe(true);
    });
    it('exige o período quando há Essencial (como a despesa oficial)', () => {
      expect(validarIncorporacao(RASCUNHO).erros.periodoInicio).toBeTruthy();
      expect(validarLinha({ ...RASCUNHO, periodoInicio: '', periodoFim: '' }).erros.periodoInicio).toBeTruthy();
    });
    ['ficha', 'ue', 'fonte', 'despesa', 'descricao', 'essencial'].forEach((campo) => {
      it(`exige "${campo}"`, () => {
        expect(validarIncorporacao({ ...COMPLETO, [campo]: '  ' }).erros[campo]).toBeTruthy();
      });
    });
    it('exige Essencial maior que zero (rascunho salvo em branco fica com 0)', () => {
      expect(validarIncorporacao({ ...COMPLETO, essencial: 0 }).erros.essencial).toBeTruthy();
    });
    it('mantém o formato dos campos (ex.: U.E com 6 dígitos)', () => {
      expect(validarIncorporacao({ ...COMPLETO, ue: '123' }).erros.ue).toBeTruthy();
    });
    it('rascunho vazio salvo não pode ser incorporado', () => {
      const salvo = criarLinha({});
      expect(validarIncorporacao(salvo).valido).toBe(false);
    });
  });

  describe('v1.7 — marca "novo" (indicador do menu lateral)', () => {
    it('criarLinha mantém a marca somente quando verdadeira', () => {
      expect(criarLinha({ ...RASCUNHO, novo: true }).novo).toBe(true);
      expect('novo' in criarLinha({ ...RASCUNHO, novo: false })).toBe(false);
      expect('novo' in criarLinha(RASCUNHO)).toBe(false);
    });
    it('a marca sobrevive ao recarregar os dados salvos', () => {
      const sec = criarSecretaria({ codigo: '02.06', pendentes: [{ ...RASCUNHO, novo: true }] }, REF);
      const relida = criarSecretaria(JSON.parse(JSON.stringify(sec)), REF);
      expect(relida.pendentes[0].novo).toBe(true);
    });
    it('rascunhos importados da planilha não são marcados', () => {
      const sec = criarSecretaria({ codigo: '02.06', pendentes: [{ id: 'p1', ...RASCUNHO, observacao: 'Out/2026' }] }, REF);
      const { aoa } = exp.montarAbaSecretaria({ ...sec, pendentes: [{ ...sec.pendentes[0], novo: true }] }, '09/10/2026');
      const relida = criarSecretaria({ ...imp.lerAbaSecretaria(aoa, '02.06'), codigo: '02.06' }, REF);
      expect(relida.pendentes.filter((l) => l.novo).length).toBe(0);
    });
  });

  describe('v1.7 — rascunhos não entram em nenhum cálculo', () => {
    const linhas = [
      { id: 'a', ficha: '264', ue: '020602', fonte: '1', despesa: '3.3.90.30', descricao: 'Oficial', essencial: 100, reserva: 50, saldoFicha: 200, observacao: 'Out/2026' }
    ];
    const semRascunho = criarSecretaria({ codigo: '02.06', nome: 'Saúde', folha: 10, linhas }, REF);
    const comRascunho = criarSecretaria({ codigo: '02.06', nome: 'Saúde', folha: 10, linhas, pendentes: [{ ...RASCUNHO, essencial: 999999, observacao: 'Out/2026' }] }, REF);

    it('indicadores da secretaria', () => {
      expect(calc.totaisSecretaria(comRascunho)).toEqual(calc.totaisSecretaria(semRascunho));
    });
    it('situação das fichas', () => {
      expect(mov.resumirFichas(comRascunho)).toEqual(mov.resumirFichas(semRascunho));
    });
    it('consulta de demanda', () => {
      const consulta = { ficha: '264', despesa: '', valor: 150 };
      expect(calc.consultarDemanda(comRascunho, consulta).situacao).toBe(calc.consultarDemanda(semRascunho, consulta).situacao);
    });
    it('consolidado', () => {
      expect(calc.totaisGerais([comRascunho]).geral).toEqual(calc.totaisGerais([semRascunho]).geral);
    });
  });

  describe('v1.7 — posição ao incorporar', () => {
    const quadro = ['100', '264', '264', '300'].map((ficha, i) => ({ id: String(i), ficha }));
    it('entra logo após a última linha da mesma ficha', () => expect(posicaoNoQuadro(quadro, '264')).toBe(3));
    it('ficha nova entra na ordem numérica', () => expect(posicaoNoQuadro(quadro, '271')).toBe(3));
    it('ficha nova menor que todas entra no início', () => expect(posicaoNoQuadro(quadro, '50')).toBe(0));
    it('ficha nova maior que todas entra no fim', () => expect(posicaoNoQuadro(quadro, '999')).toBe(4));
    it('quadro vazio', () => expect(posicaoNoQuadro([], '264')).toBe(0));
  });

  describe('v1.7 — exportação dos rascunhos', () => {
    const sec = criarSecretaria({
      codigo: '02.06', nome: 'Saúde', folha: 10,
      linhas: [{ id: 'a', ficha: '264', ue: '020602', fonte: '1', despesa: '3.3.90.30', descricao: 'Oficial', essencial: 100, observacao: 'Out/2026' }],
      pendentes: [
        { id: 'p1', ...RASCUNHO, observacao: 'Out/2026' },
        { id: 'p2', ...RASCUNHO, descricao: 'Ração', observacao: 'Dez/2026' },
        { id: 'p3', ...RASCUNHO, descricao: 'Sem período' }
      ]
    }, REF);
    const tipos = (aoa) => aoa.slice(1).map((l) => l[l.length - 1]);

    it('tabela plana inclui os rascunhos por padrão, marcados como fora do quadro', () => {
      expect(tipos(exp.montarTabelaPlana([sec]))).toEqual(['Quadro', 'Fora do quadro', 'Fora do quadro', 'Fora do quadro']);
    });
    it('com filtro de competência, os rascunhos seguem o mesmo filtro', () => {
      expect(tipos(exp.montarTabelaPlana([sec], { periodo: '2026-10' }))).toEqual(['Quadro', 'Fora do quadro']);
    });
    it('opção desmarcada não exporta os rascunhos', () => {
      expect(tipos(exp.montarTabelaPlana([sec], {}, false))).toEqual(['Quadro']);
    });
    it('aba exportada: rascunhos voltam como rascunhos e não alteram o TOTAL', () => {
      const { aoa } = exp.montarAbaSecretaria(sec, '09/10/2026');
      const relida = criarSecretaria({ ...imp.lerAbaSecretaria(aoa, '02.06'), codigo: '02.06' }, REF);
      expect(relida.pendentes.map((l) => l.descricao)).toEqual(['Insumos odontológicos', 'Ração', 'Sem período']);
      expect(relida.linhas.length).toBe(1);
      expect(calc.totaisSecretaria(relida).essencial).toBe(100);
    });
    it('rascunho incompleto (sem ficha e sem despesa) volta como rascunho', () => {
      const incompleta = criarSecretaria({ ...sec, pendentes: [{ id: 'p9', descricao: 'Só a ideia', essencial: '' }] }, REF);
      const { aoa } = exp.montarAbaSecretaria(incompleta, '09/10/2026');
      const relida = criarSecretaria({ ...imp.lerAbaSecretaria(aoa, '02.06'), codigo: '02.06' }, REF);
      expect(relida.pendentes.map((l) => l.descricao)).toEqual(['Só a ideia']);
      expect(relida.linhas.length).toBe(1);
    });
  });
})(window.TestRunner, window.OrcApp);
