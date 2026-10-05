/**
 * @file dados.spec.js
 * @description Testes de regras de negócio, importação e exportação.
 * A matriz FIXTURE_ABA reproduz o layout real de uma aba da planilha
 * "Planilha Léo Outubro.xlsx" (cabeçalho na linha 3, SUBTOTAL, bloco-resumo
 * e lançamento abaixo do TOTAL).
 */
(function (TestRunner, App) {
  'use strict';

  const { describe, it, expect } = TestRunner;
  const { criarSecretaria } = App.data.schema;
  const calc = App.data.calculos;
  const imp = App.data.importer;
  const exp = App.data.exporter;

  const FIXTURE_ABA = [
    ['Esportes'],
    ['Atualizado em 01/10/2026'],
    ['Ficha', 'U.E', 'FR', 'N. Despesa', 'Descrição', 'Observação', 'Essencial', 'Antes', 'Cortes', 'Reserva', 'Saldo ficha'],
    [],
    [338, '020702', 1, '3.3.90.30', 'Kit Lanche viagens', 'a partir de outubro', 12000, 12000, 0, 0, 48000],
    [338, '020702', 1, '3.3.90.30', 'Tinta', 'a partir de outubro', 3000, 3000, 0, null, null],
    [345, '020702', 1, '3.3.90.47', 'INSS', 'outubro', 1000, 1000, '300,69,', 500, 1000],
    [],
    [null, null, null, null, null, null, -16000, 16000, 0, 500, 49000],
    [],
    [null, null, null, null, null, 'Essencial', -16000],
    [null, null, null, null, null, 'Reserva', 500],
    [null, null, null, null, null, 'Saldo ficha', 49000],
    [null, null, null, null, null, 'Folha', -640000],
    [null, null, null, null, null, 'TOTAL', -606500],
    [],
    [344, '020702', 1, '3.3.90.39', 'Corrida BTC', 'a partir de agosto', 1270]
  ];

  const lerFixture = () => imp.lerAbaSecretaria(FIXTURE_ABA, '02.07');

  describe('importer.lerAbaSecretaria (layout original)', () => {
    it('lê nome e data de atualização', () => {
      const r = lerFixture();
      expect(r.nome).toBe('Esportes');
      expect(r.atualizadoEm).toBe('01/10/2026');
    });
    it('lê somente as linhas do quadro', () => expect(lerFixture().linhas.length).toBe(3));
    it('lê a Folha como valor positivo', () => expect(lerFixture().folha).toBe(640000));
    it('separa lançamentos abaixo do TOTAL como pendentes', () => {
      const r = lerFixture();
      expect(r.pendentes.length).toBe(1);
      expect(r.pendentes[0].descricao).toBe('Corrida BTC');
    });
    it('guarda o SUBTOTAL da planilha para conferência', () => {
      const r = lerFixture();
      expect(r.referencia.essencial).toBe(16000);
      expect(r.referencia.saldoFicha).toBe(49000);
    });
    it('gera alerta para valor inválido e considera 0', () => {
      const r = lerFixture();
      expect(r.alertas.length).toBe(1);
      expect(r.linhas[2].cortes).toBe(0);
    });
    it('tolera título "Ficha" digitado errado (caso real da aba 02.35)', () => {
      const aba = FIXTURE_ABA.map((linha, i) => (i === 2 ? [202, ...linha.slice(1)] : linha));
      const r = imp.lerAbaSecretaria(aba, '02.35');
      expect(r.linhas.length).toBe(3);
      expect(r.alertas.some((a) => a.mensagem.includes('Ficha'))).toBeTruthy();
    });
    it('alerta quando não há cabeçalho',() => expect(imp.lerAbaSecretaria([['x']], '02.99').alertas[0].nivel).toBe('erro'));
  });

  describe('importer.lerAbaGeral', () => {
    const geral = [
      [], ['U.O.', 'LOCAL', 'ESSENCIAL', 'Cortes despesa', 'FOLHA', 'RESERVA', 'SALDO FICHA', 'TOTAL'],
      ['02.10', 'Fundo Municipal de Assistência Social', -2028384.66, 0, -2500000, 4000, 505918.45, -4018466.21],
      [null, 'Atualizado em 01/10/2026']
    ];
    it('mapeia nome completo e folha do consolidado', () => {
      const r = imp.lerAbaGeral(geral);
      expect(r.secretarias['02.10'].nome).toBe('Fundo Municipal de Assistência Social');
      expect(r.secretarias['02.10'].folhaGeral).toBe(2500000);
      expect(r.atualizadoEm).toBe('01/10/2026');
    });
  });

  describe('importer.parseCsv', () => {
    it('detecta ponto e vírgula e aspas', () => {
      const m = imp.parseCsv('﻿a;b\r\n"x;1";"di""z"\n');
      expect(m).toEqual([['a', 'b'], ['x;1', 'di"z']]);
    });
    it('detecta vírgula', () => expect(imp.parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]));
  });

  const REF = { ano: 2026, mes: 10 }; // base "Atualizado em 01/10/2026"

  describe('calculos', () => {
    const sec = criarSecretaria({ codigo: '02.07', nome: 'Esportes', ...lerFixture() }, REF);

    it('resultado = Reserva + Saldo − Essencial − Folha', () => {
      const t = calc.totaisSecretaria(sec);
      expect(t.essencial).toBe(16000);
      expect(t.resultado).toBe(500 + 49000 - 16000 - 640000);
    });
    it('converte períodos da planilha para o padrão', () => {
      expect(sec.linhas[0].observacao).toBe('Out/2026 a Dez/2026');
      expect(sec.linhas[2].observacao).toBe('Out/2026');
    });
    it('filtro por competência (mês) desconsidera a folha', () => {
      const t = calc.totaisSecretaria(sec, { periodo: '2026-11' });
      expect(t.qtdLinhas).toBe(2); // somente "a partir de outubro" cobre novembro
      expect(t.folha).toBe(0);
    });
    it('agrupa por ficha somando itens', () => {
      const g = calc.agruparPorFicha(sec.linhas);
      expect(g.length).toBe(2);
      expect(g[0].essencial).toBe(15000);
      expect(g[0].qtdItens).toBe(2);
    });
    it('consulta: consta', () => expect(calc.consultarDemanda(sec, { ficha: '338', despesa: '', valor: 15000 }).situacao).toBe('consta'));
    it('consulta: valor menor', () => expect(calc.consultarDemanda(sec, { ficha: '338', despesa: '', valor: 20000 }).situacao).toBe('valorMenor'));
    it('consulta: não consta', () => expect(calc.consultarDemanda(sec, { ficha: '999', despesa: '', valor: 1 }).situacao).toBe('naoConsta'));
    it('lista competências cobertas', () => expect(calc.listarPeriodos([sec]).map((p) => p.valor)).toEqual(['2026-10', '2026-11', '2026-12']));
    it('consulta aceita despesa com desdobro (3.3.90.30.00)', () => expect(calc.consultarDemanda(sec, { ficha: '', despesa: '3.3.90.30.00', valor: 1 }).situacao).toBe('consta'));
    it('conferência acusa folha divergente da aba GERAL', () => {
      const s = criarSecretaria({ codigo: '02.10', nome: 'Fundo', folha: 0, linhas: sec.linhas, referencia: { folhaGeral: 2500000 } });
      const alertas = calc.conferirSecretaria(s);
      expect(alertas.some((a) => a.nivel === 'erro')).toBeTruthy();
    });
  });

  describe('exporter (ida e volta)', () => {
    const sec = criarSecretaria({ codigo: '02.07', nome: 'Esportes', ...lerFixture() }, REF);

    it('aba exportada é reimportada com os mesmos totais e períodos', () => {
      const { aoa } = exp.montarAbaSecretaria(sec, '02/10/2026');
      const relida = criarSecretaria({ ...imp.lerAbaSecretaria(aoa, '02.07'), codigo: '02.07' }, REF);
      expect(relida.linhas.map((l) => l.periodoFim)).toEqual(sec.linhas.map((l) => l.periodoFim));
      expect(calc.totaisSecretaria(relida)).toEqual(calc.totaisSecretaria(sec));
      expect(relida.pendentes.length).toBe(1);
    });
    it('tabela plana é reimportada', () => {
      const plana = exp.montarTabelaPlana([sec]);
      const relida = imp.lerTabelaPlana(plana);
      expect(relida.secretarias.length).toBe(1);
      expect(relida.secretarias[0].linhas.length).toBe(3);
      expect(relida.secretarias[0].pendentes.length).toBe(1);
      expect(relida.secretarias[0].folha).toBe(640000);
    });
    it('CSV usa ; e vírgula decimal', () => {
      const csv = exp.gerarCsv([['a', 1.5], ['x;y', 2]]);
      expect(csv).toBe('﻿a;1,5\r\n"x;y";2');
    });
    it('CSV gerado é reimportado (pipeline completo)', () => {
      const csv = exp.gerarCsv(exp.montarTabelaPlana([sec]));
      const relida = imp.lerTabelaPlana(imp.parseCsv(csv));
      const t = calc.totaisSecretaria(criarSecretaria(relida.secretarias[0]));
      expect(t.essencial).toBe(16000);
    });
  });
})(window.TestRunner, window.OrcApp);
