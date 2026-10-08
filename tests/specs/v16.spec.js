/**
 * @file v16.spec.js
 * @description Testes da v1.6: planilha e Fiorilli em camadas separadas.
 * O resultado não depende da ordem "Importar planilha" / "Atualizar Fiorilli".
 */
(function (TestRunner, App) {
  'use strict';

  const { describe, it, expect } = TestRunner;
  const { criarSecretaria } = App.data.schema;
  const fio = App.data.fiorilli;
  const { compararDatasBR } = App.utils.format;
  const REF = { ano: 2026, mes: 10 };

  // Colunas: A=Ficha B=U.E C=Fonte D=Despesa E=Processo F=Saldo da Reserva G=Saldo ficha
  const COLUNAS = { ficha: 'A', ue: 'B', fonte: 'C', despesa: 'D', processo: 'E', reserva: 'F', saldoFicha: 'G' };
  const FILTRO = { processos: ['001.003'], fontes: ['1'] };
  const RELATORIO = [
    ['Ficha', 'UE', 'Fonte', 'Despesa', 'Processo', 'Saldo reserva', 'Saldo'],
    [338, '020702', '01', '3.3.90.30.00', '001.003', 100, 4000],
    [338, '020702', '01', '3.3.90.30.00', '001.003.2', 40, 5000], // última nota: Saldo Ficha = 5000
    [345, '020702', '01', '3.3.90.47.00', '001.003', 60, 900],
    [900, '020702', '01', '3.3.90.39.00', '001.003', 70, 1200] // ficha nova
  ];
  const lido = fio.lerRegistros(RELATORIO, COLUNAS, FILTRO);
  const camada = fio.criarCamada({ registros: lido.registros, filtro: FILTRO, incluidas: ['900'], meta: { arquivo: 'download-08-10-2026.csv', dataSaldos: '08/10/2026' } });

  /** Planilha de trabalho: valores de Reserva/Saldo DESATUALIZADOS em relação ao Fiorilli. */
  const planilha = () => [criarSecretaria({
    codigo: '02.07', nome: 'Esportes', linhas: [
      { id: 'a', ficha: '338', ue: '020702', fonte: '1', despesa: '3.3.90.30', descricao: 'Material', essencial: 300, reserva: 10, saldoFicha: 1111, observacao: 'outubro' },
      { id: 'b', ficha: '338', ue: '020702', fonte: '1', despesa: '3.3.90.30', descricao: 'Uniformes', essencial: 20, reserva: 0, saldoFicha: 0 },
      { id: 'c', ficha: '777', ue: '020702', fonte: '1', despesa: '3.3.90.39', descricao: 'Fora do relatório', essencial: 5, reserva: 80, saldoFicha: 300 }
    ]
  }, REF)];
  /** Planilha anterior (ex.: a do mês passado), carregada antes do Fiorilli no cenário invertido. */
  const planilhaAntiga = () => [criarSecretaria({
    codigo: '02.07', nome: 'Esportes', linhas: [{ id: 'z', ficha: '338', ue: '020702', fonte: '1', despesa: '3.3.90.30', reserva: 999, saldoFicha: 999 }]
  }, REF)];

  /*
   * Transições do store, em forma pura: importar troca só a planilha; Fiorilli troca só a camada.
   * (store.substituirDados / store.aplicarFiorilli fazem exatamente isso.)
   */
  const importar = (estado, secretarias) => ({ ...estado, planilha: secretarias });
  const atualizarFiorilli = (estado, novaCamada) => ({ ...estado, camada: novaCamada });
  const exibida = (estado) => fio.combinar(estado.planilha, estado.camada);
  const valores = (secretarias) => secretarias.map((s) => s.linhas.map((l) => [l.id, l.ficha, l.reserva, l.saldoFicha, l.ue, l.fonte, l.despesa, l.descricao, l.essencial]));

  describe('v1.6 — ordem dos carregamentos', () => {
    const inicial = { planilha: [], camada: null };
    const planilhaDepoisFiorilli = atualizarFiorilli(importar(inicial, planilha()), camada);
    const fiorilliDepoisPlanilha = importar(atualizarFiorilli(importar(inicial, planilhaAntiga()), camada), planilha());

    it('Importar → Fiorilli e Fiorilli → Importar dão a mesma base', () => {
      expect(valores(exibida(fiorilliDepoisPlanilha))).toEqual(valores(exibida(planilhaDepoisFiorilli)));
    });
    it('Saldo Ficha e Reserva vêm do Fiorilli mesmo com a planilha importada por último', () => {
      const ficha338 = exibida(fiorilliDepoisPlanilha)[0].linhas.filter((l) => l.ficha === '338');
      expect(ficha338.map((l) => l.saldoFicha)).toEqual([5000, 0]);
      expect(ficha338.map((l) => l.reserva)).toEqual([100, 0]);
      expect(ficha338.map((l) => l.descricao)).toEqual(['Material', 'Uniformes']);
    });
    it('a planilha antiga não deixa resíduos', () => {
      expect(exibida(fiorilliDepoisPlanilha)[0].linhas.some((l) => l.id === 'z')).toBe(false);
    });
  });

  describe('v1.6 — combinar(planilha, camada)', () => {
    const [esportes] = fio.combinar(planilha(), camada);
    const linha = (id) => esportes.linhas.find((l) => l.id === id);

    it('campos oficiais do Fiorilli: U.E, Fonte e Despesa (4 níveis)', () => {
      expect(linha('a').despesa).toBe('3.3.90.30');
      expect(linha('b').ue).toBe('020702');
    });
    it('ficha fora do relatório usa os valores da planilha', () => {
      expect(linha('c').reserva).toBe(80);
      expect(linha('c').saldoFicha).toBe(300);
    });
    it('cada linha informa a origem dos saldos', () => {
      expect(linha('a').origem).toBe('fiorilli');
      expect(linha('c').origem).toBe('planilha');
    });
    it('ficha incluída pelo Fiorilli volta mesmo se a planilha não a tiver (id estável)', () => {
      const incluida = esportes.linhas.filter((l) => l.ficha === '900');
      expect(incluida.length).toBe(1);
      expect(incluida[0].id).toBe(fio.idLinhaIncluida('900'));
      expect(incluida[0].reserva).toBe(70);
      expect(incluida[0].descricao).toBe('');
      expect(esportes.linhas.map((l) => l.ficha)).toEqual(['338', '338', '777', '900']);
    });
    it('ficha incluída que já está na planilha não é duplicada', () => {
      const comFicha = planilha();
      comFicha[0].linhas.push(App.data.schema.criarLinha({ id: 'd', ficha: '900', descricao: 'Preenchida', essencial: 10 }, REF));
      const linhas900 = fio.combinar(comFicha, camada)[0].linhas.filter((l) => l.ficha === '900');
      expect(linhas900.map((l) => l.id)).toEqual(['d']);
      expect(linhas900[0].reserva).toBe(70);
    });
    it('sem camada, a base é a própria planilha', () => {
      const [semFiorilli] = fio.combinar(planilha(), null);
      expect(semFiorilli.linhas.map((l) => l.saldoFicha)).toEqual([1111, 0, 300]);
    });
    it('relatório sem Saldo Ficha mantém o saldo da planilha', () => {
      const semSaldo = fio.criarCamada({ registros: fio.lerRegistros(RELATORIO, { ...COLUNAS, saldoFicha: '' }, FILTRO).registros, filtro: FILTRO });
      const [s] = fio.combinar(planilha(), semSaldo);
      expect(s.linhas.find((l) => l.id === 'a').saldoFicha).toBe(1111);
      expect(s.linhas.find((l) => l.id === 'a').reserva).toBe(100);
    });
    it('o filtro em vigor da camada define a Reserva', () => {
      const [s] = fio.combinar(planilha(), { ...camada, filtro: fio.normalizarFiltro({ processos: '001.003, 001.003.2', fontes: '1' }) });
      expect(s.linhas.find((l) => l.id === 'a').reserva).toBe(140);
    });
    it('não altera as entradas', () => {
      const original = planilha();
      fio.combinar(original, camada);
      expect(original[0].linhas[0].saldoFicha).toBe(1111);
      expect(original[0].linhas.length).toBe(3);
      expect('origem' in original[0].linhas[0]).toBe(false);
    });
  });

  describe('v1.6 — camada Fiorilli', () => {
    it('criarCamada guarda só o necessário por ficha', () => {
      expect(Object.keys(camada.fichas).sort()).toEqual(['338', '345', '900']);
      expect(camada.fichas['338']).toEqual({ ue: '020702', fonte: '1', despesa: '3.3.90.30', saldoFicha: 5000, composicao: { '001.003': { 1: 100 }, '001.003.2': { 1: 40 } } });
    });
    it('incluidas só mantém fichas presentes no relatório', () => {
      expect(fio.criarCamada({ registros: lido.registros, filtro: FILTRO, incluidas: ['900', '901', '900'] }).incluidas).toEqual(['900']);
    });
    it('normalizarCamada recusa dados inválidos', () => {
      expect(fio.normalizarCamada(null)).toBe(null);
      expect(fio.normalizarCamada({ meta: {} })).toBe(null);
      expect(fio.normalizarCamada(JSON.parse(JSON.stringify(camada)))).toEqual(camada);
    });
  });

  describe('v1.6 — migração dos dados da v1.5', () => {
    // Na v1.5 os valores do Fiorilli eram gravados nas linhas e só as composições eram guardadas.
    const comp = Object.fromEntries(lido.registros.map((r) => [r.ficha, r.composicao]));
    const gravada = () => [criarSecretaria({
      codigo: '02.07', nome: 'Esportes', linhas: [
        { ficha: '338', ue: '020702', fonte: '1', despesa: '3.3.90.30', reserva: 140, saldoFicha: 5000 },
        { ficha: '338', ue: '020702', fonte: '1', despesa: '3.3.90.30', reserva: 0, saldoFicha: 0 },
        { ficha: '777', reserva: 80, saldoFicha: 300 }
      ]
    }, REF)];
    const recalculado = fio.normalizarFiltro({ processos: '001.003, 001.003.2', fontes: '1' });

    it('sem composições não há camada', () => expect(fio.camadaDaVersaoAnterior(gravada(), {}, null, [FILTRO])).toBe(null));
    it('reconstrói a camada e escolhe o filtro que reproduz as Reservas gravadas', () => {
      const migrada = fio.camadaDaVersaoAnterior(gravada(), { 338: comp['338'] }, { arquivo: 'x.xls' }, [FILTRO, recalculado]);
      expect(migrada.filtro).toEqual(recalculado);
      expect(Object.keys(migrada.fichas)).toEqual(['338']);
      expect(migrada.fichas['338'].saldoFicha).toBe(5000);
    });
    it('a base combinada após a migração é igual à gravada', () => {
      const migrada = fio.camadaDaVersaoAnterior(gravada(), { 338: comp['338'] }, {}, [FILTRO, recalculado]);
      const [s] = fio.combinar(gravada(), migrada);
      expect(s.linhas.map((l) => [l.reserva, l.saldoFicha])).toEqual([[140, 5000], [0, 0], [80, 300]]);
    });
  });

  describe('v1.6 — compararDatasBR', () => {
    it('compara datas dd/mm/aaaa', () => {
      expect(compararDatasBR('08/10/2026', '15/09/2026')).toBe(1);
      expect(compararDatasBR('01/01/2026', '31/12/2025')).toBe(1);
      expect(compararDatasBR('15/09/2026', '08/10/2026')).toBe(-1);
      expect(compararDatasBR('8/10/2026', '08/10/2026')).toBe(0);
    });
    it('aceita texto em volta e ignora datas não reconhecidas', () => {
      expect(compararDatasBR('Atualizado em 08/10/2026', '07/10/2026')).toBe(1);
      expect(compararDatasBR('', '07/10/2026')).toBe(0);
      expect(compararDatasBR('não informado', null)).toBe(0);
    });
  });
})(window.TestRunner, window.OrcApp);
