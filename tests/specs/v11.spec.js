/**
 * @file v11.spec.js
 * @description Testes das funcionalidades da v1.1:
 * padrão de período, filtros de coluna (Excel) e integração Fiorilli.
 * A matriz FIORILLI reproduz linhas reais do "download-SaldoDotacao-02-10-2026.csv".
 */
(function (TestRunner, App) {
  'use strict';

  const { describe, it, expect } = TestRunner;
  const per = App.utils.periodo;
  const ft = App.utils.filtroTabela;
  const fio = App.data.fiorilli;
  const { criarSecretaria, normalizarDespesa, normalizarFonte } = App.data.schema;
  const REF = { ano: 2026, mes: 10 };

  describe('periodo.interpretar (textos reais da planilha)', () => {
    const casos = [
      ['outubro', '2026-10', '2026-10'],
      ['a partir de outubro', '2026-10', '2026-12'],
      ['a partir de agosto', '2026-08', '2026-12'],
      ['outubro e novembro', '2026-10', '2026-11'],
      ['novembro, dezembro e janeiro', '2026-11', '2027-01'],
      ['outubro a dezembro', '2026-10', '2026-12'],
      ['imediato', '2026-10', '2026-10'],
      ['Out/2026 a Dez/2026', '2026-10', '2026-12'],
      ['Jan/2027', '2027-01', '2027-01']
    ];
    casos.forEach(([texto, inicio, fim]) => {
      it(`"${texto}" → ${inicio} a ${fim}`, () => expect(per.interpretar(texto, REF)).toEqual({ inicio, fim }));
    });
    it('texto com informação extra não é convertido', () => expect(per.interpretar('a partir de outubro + décimo terceiro', REF)).toBe(null));
    it('texto com valores não é convertido', () => expect(per.interpretar('outubro R$ 231.858,22, novembro R$ 753.335,97', REF)).toBe(null));
    it('período com texto extra: converte e preserva o original em Anotações', () => {
      const linha = App.data.schema.criarLinha({ ficha: '1', observacao: 'PL 16 a partir de agosto - transferir 83.662,69 para ficha 730' }, REF);
      expect(linha.observacao).toBe('Ago/2026 a Dez/2026');
      expect(linha.anotacao).toBe('PL 16 a partir de agosto - transferir 83.662,69 para ficha 730');
    });
    it('texto sem mês permanece não padronizado', () => {
      const linha = App.data.schema.criarLinha({ ficha: '1', observacao: 'aguardando ata' }, REF);
      expect(linha.periodoInicio).toBe('');
      expect(linha.observacao).toBe('aguardando ata');
    });
    it('rótulo canônico', () => expect(per.rotulo('2026-10', '2026-12')).toBe('Out/2026 a Dez/2026'));
    it('filtro por competência', () => {
      const linha = { periodoInicio: '2026-10', periodoFim: '2026-12', observacao: 'x' };
      expect(per.atendeFiltro(linha, '2026-11')).toBeTruthy();
      expect(per.atendeFiltro(linha, '2027-01')).toBeFalsy();
    });
    it('lista 24 competências (ano base + seguinte)', () => expect(per.listarMeses(REF).length).toBe(24));
  });

  describe('validators: período obrigatório com Essencial', () => {
    const base = { ficha: '25', ue: '020101', fonte: '1', despesa: '3.3.90.30', essencial: '100', periodoInicio: '', periodoFim: '' };
    it('exige mês inicial quando há Essencial', () => expect(App.utils.validators.validarLinha(base).erros.periodoInicio).toBeTruthy());
    it('rejeita fim anterior ao início', () => expect(App.utils.validators.validarLinha({ ...base, periodoInicio: '2026-11', periodoFim: '2026-10' }).erros.periodoFim).toBeTruthy());
    it('aceita período válido', () => expect(App.utils.validators.validarLinha({ ...base, periodoInicio: '2026-10', periodoFim: '2026-12' }).valido).toBeTruthy());
  });

  describe('filtroTabela (padrão Excel)', () => {
    const colunas = [{ chave: 'nome', filtravel: true }, { chave: 'valor', moeda: true, filtravel: true }];
    const linhas = [{ nome: 'B', valor: 10 }, { nome: 'A', valor: 30 }, { nome: '', valor: 20 }, { nome: 'A', valor: 5 }];

    it('filtra por valores selecionados', () => {
      const estado = ft.definirSelecao(ft.criarEstado(), 'nome', ['A'], ['A', 'B', '(Vazias)']);
      expect(ft.aplicar(linhas, colunas, estado).length).toBe(2);
    });
    it('selecionar todos remove o filtro', () => {
      const estado = ft.definirSelecao(ft.criarEstado(), 'nome', ['A', 'B', '(Vazias)'], ['A', 'B', '(Vazias)']);
      expect(ft.temFiltro(estado)).toBeFalsy();
    });
    it('lista "(Vazias)" por último', () => expect(ft.valoresDistintos(linhas, colunas, ft.criarEstado(), colunas[0])).toEqual(['A', 'B', '(Vazias)']));
    it('classifica numericamente (maior → menor)', () => {
      const estado = ft.definirOrdem(ft.criarEstado(), 'valor', 'desc');
      expect(ft.aplicar(linhas, colunas, estado).map((l) => l.valor)).toEqual([30, 20, 10, 5]);
    });
    it('valores de uma coluna respeitam os filtros das outras', () => {
      const estado = ft.definirSelecao(ft.criarEstado(), 'nome', ['A'], ['A', 'B', '(Vazias)']);
      expect(ft.valoresDistintos(linhas, colunas, estado, colunas[1]).length).toBe(2);
    });
  });

  describe('normalizações Fiorilli', () => {
    it('despesa com desdobro', () => expect(normalizarDespesa('3.3.90.39.00')).toBe('3.3.90.39'));
    it('despesa só dígitos', () => expect(normalizarDespesa('33903900')).toBe('3.3.90.39'));
    it('fonte "01" = "1"', () => expect(normalizarFonte('01')).toBe('1'));
    it('notação científica vira 0', () => expect(App.utils.format.arredondar(App.utils.format.paraNumero('1,16415321826935E-10'))).toBe(0));
    it('letras de coluna', () => {
      expect(fio.letraParaIndice('V')).toBe(21);
      expect(fio.letraParaIndice('AT')).toBe(45);
      expect(fio.letraParaIndice('BK')).toBe(62);
      expect(fio.letraParaIndice('1')).toBe(-1);
    });
    it('data no nome do arquivo', () => expect(fio.extrairDataArquivo('download-SaldoDotacao-02-10-2026.csv')).toBe('02/10/2026'));
    it('valida colunas repetidas', () => expect(fio.validarColunas({ ...App.core.config.FIORILLI_COLUNAS_PADRAO, ue: 'V' }).erros.ue).toBeTruthy());
  });

  describe('integração Fiorilli', () => {
    // Monta uma linha do CSV com 75 colunas, preenchendo somente as mapeadas.
    const linhaCsv = (valores) => {
      const linha = new Array(75).fill('');
      Object.entries(valores).forEach(([letra, v]) => { linha[fio.letraParaIndice(letra)] = v; });
      return linha;
    };
    const cabecalho = linhaCsv({ V: 'FICHA', AT: 'CODLO', AV: 'CATEC', AZ: 'FONGRUPO', BD: 'SALDO_RESERVA', BK: 'SALDORESERVA' });
    const FIORILLI = [
      cabecalho,
      linhaCsv({ V: '25', AT: '020101', AV: '3.3.90.30.00', AZ: '01', BD: '20000', BK: '1500,50' }), // existente: muda saldo e reserva
      linhaCsv({ V: '26', AT: '020101', AV: '3.3.90.32.00', AZ: '01', BD: '0', BK: '0' }),          // existente: sem alteração
      linhaCsv({ V: '900', AT: '020102', AV: '3.3.90.39.00', AZ: '01', BD: '5000', BK: '0' }),       // nova (fonte 1)
      linhaCsv({ V: '901', AT: '020101', AV: '3.1.90.11.00', AZ: '01', BD: '9000', BK: '0' }),       // nova pessoal -> ignorada
      linhaCsv({ V: '902', AT: '020101', AV: '3.3.90.39.00', AZ: '05', BD: '100', BK: '0' }),        // nova fonte 5 -> ignorada
      linhaCsv({ V: '903', AT: '029901', AV: '3.3.90.39.00', AZ: '01', BD: '100', BK: '0' }),        // secretaria inexistente
      linhaCsv({ V: '904', AT: '020101', AV: '3.3.90.39.00', AZ: '01', BD: '1,16415321826935E-10', BK: '0' }) // zerada -> ignorada
    ];
    const base = () => [criarSecretaria({
      codigo: '02.01', nome: 'Gabinete',
      linhas: [
        { ficha: '25', ue: '020101', fonte: '1', despesa: '3.3.90.30', descricao: 'Papel', essencial: 100, reserva: 0, saldoFicha: 11972.12, observacao: 'outubro' },
        { ficha: '25', ue: '020101', fonte: '1', despesa: '3.3.90.30', descricao: 'Toalha', essencial: 50 },
        { ficha: '26', ue: '020101', fonte: '1', despesa: '3.3.90.32', descricao: 'Panfletos', essencial: 10 },
        { ficha: '27', ue: '020101', fonte: '1', despesa: '3.3.90.33', descricao: 'Passagens', essencial: 10 }
      ]
    }, REF)];
    const lido = fio.lerRegistros(FIORILLI, App.core.config.FIORILLI_COLUNAS_PADRAO);

    it('lê registros e títulos das colunas', () => {
      expect(lido.registros.length).toBe(7);
      expect(lido.cabecalho.ficha).toBe('FICHA');
      expect(lido.registros[0].despesa).toBe('3.3.90.30');
      expect(lido.registros[0].reserva).toBe(1500.5);
    });

    it('planeja atualizações, inclusões e ignoradas', () => {
      const plano = fio.planejar(base(), lido.registros, { fontes: ['1'], incluirPessoal: false, incluirZeradas: false });
      expect(plano.atualizacoes.length).toBe(1);
      expect(plano.atualizacoes[0].alteracoes.map((a) => a.campo)).toEqual(['reserva', 'saldoFicha']);
      expect(plano.inalteradas).toBe(1);
      expect(plano.inclusoes.map((i) => i.registro.ficha)).toEqual(['900']);
      expect(plano.ignoradas.length).toBe(3);
      expect(plano.semSecretaria.length).toBe(1);
      expect(plano.ausentes.map((a) => a.ficha)).toEqual(['27']);
    });

    it('aplica sem tocar em Descrição/Essencial/Período e mantém a soma por ficha', () => {
      const secretarias = base();
      const plano = fio.planejar(secretarias, lido.registros, { fontes: ['1'] });
      const [nova] = fio.aplicar(secretarias, lido.registros, plano);
      const ficha25 = nova.linhas.filter((l) => l.ficha === '25');
      expect(ficha25[0].saldoFicha).toBe(20000);
      expect(ficha25[1].saldoFicha).toBe(0);
      expect(ficha25[0].reserva).toBe(1500.5);
      expect(ficha25.map((l) => l.descricao)).toEqual(['Papel', 'Toalha']);
      expect(ficha25[0].essencial).toBe(100);
      expect(ficha25[0].observacao).toBe('Out/2026');
      const incluida = nova.linhas.find((l) => l.ficha === '900');
      expect(incluida.descricao).toBe('');
      expect(incluida.essencial).toBe(0);
      expect(secretarias[0].linhas[0].saldoFicha).toBe(11972.12); // original intacto (imutável)
    });

    it('incluir pessoal e outras fontes quando solicitado', () => {
      const plano = fio.planejar(base(), lido.registros, { fontes: ['1', '5'], incluirPessoal: true, incluirZeradas: true });
      expect(plano.inclusoes.length).toBe(4);
    });
  });
})(window.TestRunner, window.OrcApp);
