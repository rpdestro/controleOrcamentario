/**
 * @file v15.spec.js
 * @description Testes da v1.5: exportação sem "Antes", composição da Reserva
 * (recálculo em tempo real pelo filtro) e relatório de gestão das movimentações.
 */
(function (TestRunner, App) {
  'use strict';

  const { describe, it, expect } = TestRunner;
  const { criarSecretaria } = App.data.schema;
  const exp = App.data.exporter;
  const fio = App.data.fiorilli;
  const mov = App.data.movimentacoes;
  const rel = App.data.relatorioGestao;

  /* ------------------------------ Exportação ------------------------------ */

  describe('exporter sem a coluna "Antes" (v1.5)', () => {
    const sec = criarSecretaria({
      codigo: '02.07', nome: 'Esportes', folha: 100, linhas: [
        { ficha: '338', ue: '020702', fonte: '1', despesa: '3.3.90.30', essencial: 1000, antes: 999, reserva: 50, saldoFicha: 2000 },
        { ficha: '345', ue: '020702', fonte: '1', despesa: '3.3.90.47', essencial: 200, antes: 1, reserva: 0, saldoFicha: 300 }
      ]
    });

    it('cabeçalho da aba (XLS/XLSX) não tem "Antes"', () => {
      const { aoa } = exp.montarAbaSecretaria(sec, '07/10/2026');
      expect(aoa[2].includes('Antes')).toBe(false);
      expect(aoa[2]).toEqual(['Ficha', 'U.E', 'FR', 'N. Despesa', 'Descrição', 'Observação', 'Essencial', 'Reserva', 'Saldo ficha', 'Anotações']);
    });
    it('fórmulas apontam para as novas colunas (G=Essencial, H=Reserva, I=Saldo ficha)', () => {
      const { formulas, linhaSubtotal } = exp.montarAbaSecretaria(sec, '07/10/2026');
      expect(formulas[`G${linhaSubtotal}`]).toBe('SUBTOTAL(9,G5:G6)*-1');
      expect(formulas[`H${linhaSubtotal}`]).toBe('SUBTOTAL(9,H5:H6)');
      expect(formulas[`I${linhaSubtotal}`]).toBe('SUBTOTAL(9,I5:I6)');
      expect(formulas[`J${linhaSubtotal}`]).toBe(undefined);
    });
    it('aba GERAL referencia Reserva (H) e Saldo ficha (I) da secretaria', () => {
      const montada = exp.montarAbaSecretaria(sec, '07/10/2026');
      const { formulas } = exp.montarAbaGeral([sec], { '02.07': montada }, '07/10/2026');
      expect(formulas.E5).toBe(`'02.07'!H${montada.linhaSubtotal}`);
      expect(formulas.F5).toBe(`'02.07'!I${montada.linhaSubtotal}`);
    });
    it('tabela plana (CSV) não tem "Valor Anterior"', () => {
      const [cabecalho, primeira] = exp.montarTabelaPlana([sec]);
      expect(cabecalho.includes('Valor Anterior')).toBe(false);
      expect(cabecalho[9]).toBe('Valor Reserva'); // antes era a coluna J = "Valor Anterior"
      expect(primeira[9]).toBe(50);
      expect(cabecalho.length).toBe(primeira.length);
    });
  });

  /* ------------------------- Composição da Reserva ------------------------- */

  // Colunas: A=Ficha B=U.E C=Fonte D=Despesa E=Processo F=Saldo da Reserva G=Saldo ficha
  const COLUNAS = { ficha: 'A', ue: 'B', fonte: 'C', despesa: 'D', processo: 'E', reserva: 'F', saldoFicha: 'G' };
  const NOTAS = [
    ['Ficha', 'UE', 'Fonte', 'Despesa', 'Processo', 'Saldo reserva', 'Saldo'],
    [338, '020702', '01', '3.3.90.30', '001.003', 100, 5000],
    [338, '020702', '01', '3.3.90.30', '001.003.2', 40, 5000],
    [338, '020702', '05', '3.3.90.30', '001.003', 7, 5000],
    [338, '020702', '01', '3.3.90.30', '', 3, 5000],
    [345, '020702', '01', '3.3.90.47', '001.005', 60, 900]
  ];
  const FILTRO = { processos: ['001.003'], fontes: ['1'] };
  const lido = fio.lerRegistros(NOTAS, COLUNAS, FILTRO);
  const comp = (ficha) => lido.registros.find((r) => r.ficha === ficha).composicao;

  describe('fiorilli: composição da Reserva por processo × fonte', () => {
    it('guarda TODAS as notas (inclusive fora do filtro)', () => {
      expect(comp('338')).toEqual({ '001.003': { 1: 100, 5: 7 }, '001.003.2': { 1: 40 }, '(vazio)': { 1: 3 } });
    });
    it('Reserva lida = soma das notas do filtro', () => expect(lido.registros.find((r) => r.ficha === '338').reserva).toBe(100));
    it('reservaPorFiltro reproduz a soma para qualquer filtro', () => {
      expect(fio.reservaPorFiltro(comp('338'), FILTRO)).toBe(100);
      expect(fio.reservaPorFiltro(comp('338'), { processos: ['001.003', '001.003.2'], fontes: ['1'] })).toBe(140);
      expect(fio.reservaPorFiltro(comp('338'), { processos: [], fontes: [] })).toBe(150);
      expect(fio.reservaPorFiltro(comp('338'), { processos: ['(vazio)'], fontes: ['01'] })).toBe(3);
    });
    it('opcoesDasComposicoes lista processos e fontes presentes', () => {
      const op = fio.opcoesDasComposicoes({ 338: comp('338'), 345: comp('345') });
      expect(op.processos).toEqual(['(vazio)', '001.003', '001.003.2', '001.005']);
      expect(op.fontes).toEqual(['1', '5']);
    });
  });

  describe('fiorilli: recálculo da Reserva ao salvar o filtro', () => {
    const base = () => [criarSecretaria({
      codigo: '02.07', nome: 'Esportes', linhas: [
        { ficha: '338', despesa: '3.3.90.30', essencial: 50, reserva: 100, saldoFicha: 5000 },
        { ficha: '338', despesa: '3.3.90.30', essencial: 10, reserva: 0 },
        { ficha: '345', despesa: '3.3.90.47', essencial: 10, reserva: 0, saldoFicha: 900 },
        { ficha: '999', despesa: '3.3.90.39', essencial: 0, reserva: 80 } // sem composição
      ]
    })];
    const composicoes = fio.composicoesDaBase(base(), lido.registros);
    const novoFiltro = fio.normalizarFiltro({ processos: '001.003, 001.003.2, 001.005', fontes: '1' });

    it('composições guardadas somente das fichas da base', () => expect(Object.keys(composicoes).sort()).toEqual(['338', '345']));
    it('mesmo filtro da carga = nenhuma alteração', () => expect(fio.planejarRecalculo(base(), composicoes, FILTRO).alteracoes.length).toBe(0));
    it('novo filtro: lista as fichas alteradas e os totais', () => {
      const plano = fio.planejarRecalculo(base(), composicoes, novoFiltro);
      expect(plano.alteracoes).toEqual([
        { codigo: '02.07', ficha: '338', antes: 100, depois: 140 },
        { codigo: '02.07', ficha: '345', antes: 0, depois: 60 }
      ]);
      expect(plano.semComposicao).toBe(1);
      expect(plano.totalAntes).toBe(180);
      expect(plano.totalDepois).toBe(280);
    });
    it('aplicar grava na linha-âncora, zera as demais e mantém fichas sem composição', () => {
      const oficiais = base();
      const novas = fio.aplicarRecalculo(oficiais, fio.planejarRecalculo(oficiais, composicoes, novoFiltro));
      expect(novas[0].linhas.map((l) => l.reserva)).toEqual([140, 0, 60, 80]);
      expect(oficiais[0].linhas[0].reserva).toBe(100); // imutável
    });
  });

  /* ------------------------- Relatório de gestão ------------------------- */

  describe('relatorioGestao', () => {
    const secretarias = [
      criarSecretaria({ codigo: '02.07', nome: 'Esportes', linhas: [{ ficha: '338', despesa: '3.3.90.30', essencial: 100, reserva: 0, saldoFicha: 1000 }] }),
      criarSecretaria({ codigo: '02.04', nome: 'Educação', linhas: [{ ficha: '512', despesa: '3.3.90.39', essencial: 500, reserva: 100, saldoFicha: 100 }] })
    ];
    const t = (data, de, para, saldoFicha, reserva = 0) => mov.criar({ data, origem: de, destino: para, saldoFicha, reserva, instrumento: 'decreto', motivo: 'teste' });
    const a = t('2026-10-01T15:00:00.000Z', { secretaria: '02.07', ficha: '338' }, { secretaria: '02.04', ficha: '512' }, 300);
    const b = t('2026-10-05T15:00:00.000Z', { secretaria: '02.07', ficha: '338' }, { secretaria: '02.04', ficha: '512' }, 0, 0.1);
    const transferencias = [b, a];

    it('lista em ordem cronológica, com nomes e instrumento', () => {
      const lista = rel.listarMovimentacoes(transferencias, secretarias);
      expect(lista.map((m) => m.id)).toEqual([a.id, b.id]);
      expect(lista[0].origem.nome).toBe('Esportes');
      expect(lista[0].instrumento).toBe('Decreto');
    });
    it('filtra por período e secretaria', () => {
      expect(rel.listarMovimentacoes(transferencias, secretarias, { inicio: '2026-10-02' }).length).toBe(1);
      expect(rel.listarMovimentacoes(transferencias, secretarias, { fim: '2026-10-01' }).length).toBe(1);
      expect(rel.listarMovimentacoes(transferencias, secretarias, { secretaria: '02.10' }).length).toBe(0);
    });
    it('totais e resumo por secretaria (entradas, saídas, líquido)', () => {
      const lista = rel.listarMovimentacoes(transferencias, secretarias);
      expect(rel.totaisMovimentacoes(lista)).toEqual({ quantidade: 2, saldoFicha: 300, reserva: 0.1, total: 300.1 });
      const [esportes, educacao] = rel.resumoPorSecretaria(lista, [secretarias[0], secretarias[1]]);
      expect(esportes).toEqual({ codigo: '02.07', nome: 'Esportes', quantidade: 2, entradas: 0, saidas: 300.1, liquido: -300.1 });
      expect(educacao.liquido).toBe(300.1);
    });
    it('fichas alteradas: oficial, variação, atual e situação antes → depois', () => {
      const fichas = rel.fichasAlteradas(secretarias, transferencias);
      const f512 = fichas.find((f) => f.ficha === '512');
      expect(f512.saldoOficial).toBe(100);
      expect(f512.saldoVariacao).toBe(300);
      expect(f512.saldoFicha).toBe(400);
      expect(f512.reserva).toBe(100.1);
      expect(f512.situacaoAntes).toBe('deficit');
      expect(f512.situacao).toBe('positivo');
      expect(rel.fichasAlteradas(secretarias, transferencias, '02.07').length).toBe(1);
      expect(rel.fichasAlteradas(secretarias, []).length).toBe(0);
    });
  });
})(window.TestRunner, window.OrcApp);
