/**
 * @file v14.spec.js
 * @description Testes da v1.4: transferências entre fichas (livro de
 * movimentações), saldos projetados e situação orçamentária das fichas.
 */
(function (TestRunner, App) {
  'use strict';

  const { describe, it, expect } = TestRunner;
  const { criarSecretaria } = App.data.schema;
  const mov = App.data.movimentacoes;

  /** 02.07: ficha 338 (2 linhas, sobra) e 345. 02.04: ficha 512 (déficit) e 600 (zerada). */
  function fixture() {
    return [
      criarSecretaria({
        codigo: '02.07', nome: 'Esportes', linhas: [
          { ficha: '338', despesa: '3.3.90.30', essencial: 12000, reserva: 0, saldoFicha: 48000 },
          { ficha: '338', despesa: '3.3.90.30', essencial: 3000 },
          { ficha: '345', despesa: '3.3.90.47', essencial: 1000, reserva: 500, saldoFicha: 1000 }
        ]
      }),
      criarSecretaria({
        codigo: '02.04', nome: 'Educação', linhas: [
          { ficha: '512', despesa: '3.3.90.39', essencial: 10000, reserva: 2000, saldoFicha: 3000 },
          { ficha: '600', despesa: '3.3.90.30', essencial: 0, reserva: 0, saldoFicha: 0 }
        ]
      })
    ];
  }
  const p = (secretaria, ficha) => ({ secretaria, ficha });
  const t = (origem, destino, saldoFicha = 0, reserva = 0) => mov.criar({ origem, destino, saldoFicha, reserva });

  describe('movimentacoes.situacaoFicha (v1.5: Déficit / Atende / Positivo)', () => {
    const s = (disponivel, necessidade) => mov.situacaoFicha({ disponivel, necessidade });
    it('sem disponível e com Essencial = déficit (antiga "zerada")', () => { expect(s(0, 1000)).toBe('deficit'); expect(s(-5, 0)).toBe('deficit'); });
    it('disponível menor que o Essencial = déficit', () => expect(s(900, 1000)).toBe('deficit'));
    it('disponível igual ao Essencial = atende', () => expect(s(1000, 1000)).toBe('atende'));
    it('diferença de até R$ 0,01 = atende', () => { expect(s(1000.01, 1000)).toBe('atende'); expect(s(999.99, 1000)).toBe('atende'); });
    it('qualquer sobra acima da tolerância = positivo', () => { expect(s(1000.02, 1000)).toBe('positivo'); expect(s(1050, 1000)).toBe('positivo'); });
    it('sem Essencial e com saldo = positivo', () => expect(s(1000, 0)).toBe('positivo'));
    it('sem Essencial e sem saldo = atende', () => expect(s(0, 0)).toBe('atende'));
    it('somente o déficit é grave', () => {
      expect(mov.ehGrave('deficit')).toBe(true);
      expect(mov.ehGrave('atende')).toBe(false);
      expect(mov.ehGrave('positivo')).toBe(false);
    });
    it('piora: positivo → atende → déficit', () => {
      expect(mov.piora('positivo', 'atende')).toBe(true);
      expect(mov.piora('atende', 'deficit')).toBe(true);
      expect(mov.piora('deficit', 'positivo')).toBe(false);
    });
  });

  describe('movimentacoes.resumirFichas', () => {
    it('agrupa por ficha, soma o Essencial e usa os saldos da linha-âncora', () => {
      const [f338, f345] = mov.resumirFichas(fixture()[0]);
      expect(f338.necessidade).toBe(15000);
      expect(f338.disponivel).toBe(48000);
      expect(f345.disponivel).toBe(1500);
    });
    it('classifica a situação de cada ficha', () => {
      const [f512, f600] = mov.resumirFichas(fixture()[1]);
      expect(f512.situacao).toBe('deficit');
      expect(f600.situacao).toBe('atende'); // sem Essencial e sem saldo
    });
  });

  describe('movimentacoes.projetar', () => {
    it('debita a origem e credita o destino (entre secretarias) sem alterar os oficiais', () => {
      const oficiais = fixture();
      const proj = mov.projetar(oficiais, [t(p('02.07', '338'), p('02.04', '512'), 6000, 0)]);
      expect(proj[0].linhas[0].saldoFicha).toBe(42000);
      expect(proj[1].linhas[0].saldoFicha).toBe(9000);
      expect(oficiais[0].linhas[0].saldoFicha).toBe(48000);
      expect(proj[1].linhas[0].oficial.saldoFicha).toBe(3000);
      expect(proj[1].linhas[0].movimentado.saldoFicha).toBe(6000);
    });
    it('a ficha de destino muda de situação (déficit → positivo)', () => {
      const proj = mov.projetar(fixture(), [t(p('02.07', '338'), p('02.04', '512'), 6000, 0)]);
      expect(mov.encontrarFicha(proj, p('02.04', '512')).situacao).toBe('positivo');
    });
    it('transferir exatamente o que falta deixa o destino em "atende"', () => {
      const proj = mov.projetar(fixture(), [t(p('02.07', '338'), p('02.04', '512'), 5000, 0)]);
      expect(mov.encontrarFicha(proj, p('02.04', '512')).situacao).toBe('atende');
    });
    it('aplica somente na linha-âncora (demais linhas da ficha ficam em 0)', () => {
      const proj = mov.projetar(fixture(), [t(p('02.04', '512'), p('02.07', '338'), 0, 1000)]);
      expect(proj[0].linhas[0].reserva).toBe(1000);
      expect(proj[0].linhas[1].reserva).toBe(0);
    });
    it('soma em centavos, sem erro de ponto flutuante', () => {
      const proj = mov.projetar(fixture(), [
        t(p('02.07', '345'), p('02.04', '600'), 0.1), t(p('02.07', '345'), p('02.04', '600'), 0.2)
      ]);
      expect(proj[1].linhas[1].saldoFicha).toBe(0.3);
    });
    it('sem movimentações devolve as mesmas secretarias', () => {
      const oficiais = fixture();
      expect(mov.projetar(oficiais, [])).toBe(oficiais);
    });
  });

  describe('movimentacoes.validar', () => {
    const base = { origem: p('02.07', '345'), destino: p('02.04', '512') };
    it('aceita transferência válida', () => expect(Object.keys(mov.validar(fixture(), { ...base, saldoFicha: '1.000,00', reserva: '500' })).length).toBe(0));
    it('impede saldo negativo na origem (por campo)', () => {
      const erros = mov.validar(fixture(), { ...base, saldoFicha: '1000,01', reserva: '600' });
      expect(Boolean(erros.saldoFicha)).toBe(true);
      expect(Boolean(erros.reserva)).toBe(true);
    });
    it('exige algum valor maior que zero', () => expect(Boolean(mov.validar(fixture(), { ...base, saldoFicha: '', reserva: '0' }).saldoFicha)).toBe(true));
    it('rejeita valor inválido e negativo', () => {
      expect(Boolean(mov.validar(fixture(), { ...base, saldoFicha: '12,3,4' }).saldoFicha)).toBe(true);
      expect(Boolean(mov.validar(fixture(), { ...base, reserva: '-10' }).reserva)).toBe(true);
    });
    it('exige destino diferente da origem', () => expect(Boolean(mov.validar(fixture(), { ...base, destino: p('02.07', '345'), saldoFicha: 10 }).destino)).toBe(true));
    it('exige destino selecionado', () => expect(Boolean(mov.validar(fixture(), { origem: base.origem, destino: p('', ''), saldoFicha: 10 }).destino)).toBe(true));
    it('valida contra o saldo PROJETADO (após movimentações anteriores)', () => {
      const proj = mov.projetar(fixture(), [t(p('02.07', '345'), p('02.04', '600'), 800)]);
      expect(Boolean(mov.validar(proj, { ...base, saldoFicha: 300 }).saldoFicha)).toBe(true);
      expect(Object.keys(mov.validar(proj, { ...base, saldoFicha: 200 })).length).toBe(0);
    });
  });

  describe('movimentacoes: valores, simulação e consistência', () => {
    it('"1.500" é lido como mil e quinhentos; "1.234,56" com centavos', () => {
      expect(mov.paraValor('1.500')).toBe(1500);
      expect(mov.criar({ origem: p('a', '1'), destino: p('b', '2'), saldoFicha: '1.234,56' }).saldoFicha).toBe(1234.56);
    });
    it('simular mostra antes e depois da origem e do destino', () => {
      const sim = mov.simular(fixture(), { origem: p('02.07', '338'), destino: p('02.04', '512'), saldoFicha: '6.000,00' });
      expect(sim.origem.antes.saldoFicha).toBe(48000);
      expect(sim.origem.depois.saldoFicha).toBe(42000);
      expect(sim.destino.depois.situacao).toBe('positivo');
    });
    it('detecta movimentação órfã (ficha inexistente)', () => {
      const orfa = t(p('02.07', '338'), p('02.04', '999'), 10);
      expect(mov.listarOrfas(fixture(), [orfa, t(p('02.07', '338'), p('02.04', '512'), 10)]).length).toBe(1);
    });
    it('desfazer a 1ª de duas movimentações encadeadas deixaria saldo negativo', () => {
      const a = t(p('02.07', '345'), p('02.04', '512'), 1000);
      const b = t(p('02.04', '512'), p('02.04', '600'), 3500); // usa parte do valor recebido em "a"
      expect(mov.fichasNegativas(fixture(), [a, b]).length).toBe(0);
      expect(mov.fichasNegativas(fixture(), [b])).toEqual(['02.04|512']);
    });
  });
})(window.TestRunner, window.OrcApp);
