/**
 * @file v17.spec.js
 * @description Testes dos lançamentos "fora do quadro" como rascunhos:
 * validação própria, nenhum efeito nos cálculos, posição ao incorporar e exportação.
 */
(function (TestRunner, App) {
  'use strict';

  const { describe, it, expect } = TestRunner;
  const { criarSecretaria, posicaoNoQuadro } = App.data.schema;
  const { validarPendente, validarLinha } = App.utils.validators;
  const calc = App.data.calculos;
  const mov = App.data.movimentacoes;
  const exp = App.data.exporter;
  const imp = App.data.importer;
  const REF = { ano: 2026, mes: 10 };

  const RASCUNHO = { ficha: '264', ue: '020602', fonte: '1', despesa: '3.3.90.30', descricao: 'Insumos odontológicos', essencial: '6.545,69' };

  describe('v1.7 — validação do rascunho', () => {
    it('aceita rascunho completo sem período', () => {
      expect(validarPendente(RASCUNHO).valido).toBe(true);
    });
    it('aceita rascunho com período estruturado vazio (sem validação de período)', () => {
      expect(validarPendente({ ...RASCUNHO, periodoInicio: '', periodoFim: '' }).valido).toBe(true);
    });
    it('a despesa oficial, com os mesmos dados, exige o período', () => {
      expect(validarLinha({ ...RASCUNHO, periodoInicio: '', periodoFim: '' }).erros.periodoInicio).toBeTruthy();
    });
    ['ficha', 'ue', 'fonte', 'despesa', 'descricao', 'essencial'].forEach((campo) => {
      it(`exige "${campo}"`, () => {
        expect(validarPendente({ ...RASCUNHO, [campo]: '  ' }).erros[campo]).toBeTruthy();
      });
    });
    it('mantém o formato dos campos (ex.: U.E com 6 dígitos)', () => {
      expect(validarPendente({ ...RASCUNHO, ue: '123' }).erros.ue).toBeTruthy();
    });
    it('não valida a Observação (Período)', () => {
      expect(validarPendente({ ...RASCUNHO, observacao: 'x'.repeat(400) }).valido).toBe(true);
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
  });
})(window.TestRunner, window.OrcApp);
