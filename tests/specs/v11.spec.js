/**
 * @file v11.spec.js
 * @description Testes das funcionalidades da v1.1:
 * padrão de período, filtros de coluna (Excel) e integração Fiorilli.
 * A matriz RELATORIO reproduz notas reais do "download-15-09-2026.xls" (v1.2).
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
    it('data no nome do arquivo', () => expect(fio.extrairDataArquivo('download-15-09-2026.xls')).toBe('15/09/2026'));
    it('valida colunas repetidas', () => expect(fio.validarColunas({ ...App.core.config.FIORILLI_COLUNAS_PADRAO, ue: 'R' }).erros.ue).toBeTruthy());
    it('Processo e Saldo Ficha podem ficar em branco', () => expect(fio.validarColunas({ ...App.core.config.FIORILLI_COLUNAS_PADRAO, processo: '', saldoFicha: '' }).valido).toBeTruthy());
    it('Reserva não pode ficar em branco', () => expect(fio.validarColunas({ ...App.core.config.FIORILLI_COLUNAS_PADRAO, reserva: '' }).erros.reserva).toBeTruthy());
  });

  describe('filtro de reservas (processos / fontes)', () => {
    it('padrão: processos 001.003, 001.003.1, 001.003.3 e fonte 1', () => {
      expect(fio.normalizarFiltro(App.core.config.FILTRO_RESERVAS_PADRAO)).toEqual({ processos: ['001.003', '001.003.1', '001.003.3'], fontes: ['1'] });
    });
    it('lê lista digitada (vírgula/ponto e vírgula, sem repetição, fonte "01" = "1")', () => {
      expect(fio.normalizarFiltro({ processos: ' 001.003; 001.003.1 ,001.003 ', fontes: '01, 5' })).toEqual({ processos: ['001.003', '001.003.1'], fontes: ['1', '5'] });
    });
    it('comparação exata do processo', () => {
      const filtro = fio.normalizarFiltro(App.core.config.FILTRO_RESERVAS_PADRAO);
      expect(fio.atendeFiltro({ processo: '001.003', fonte: '1' }, filtro)).toBeTruthy();
      expect(fio.atendeFiltro({ processo: '001.003.2', fonte: '1' }, filtro)).toBeFalsy();
      expect(fio.atendeFiltro({ processo: '001.003', fonte: '2' }, filtro)).toBeFalsy();
    });
    it('"(vazio)" seleciona as notas sem processo', () => {
      const filtro = fio.normalizarFiltro({ processos: '001.003, (Vazio)', fontes: '1' });
      expect(filtro.processos).toEqual(['001.003', '(vazio)']);
      expect(fio.atendeFiltro({ processo: '', fonte: '1' }, filtro)).toBeTruthy();
      expect(fio.atendeFiltro({ processo: '', fonte: '1' }, fio.normalizarFiltro(App.core.config.FILTRO_RESERVAS_PADRAO))).toBeFalsy();
    });
    it('lista vazia = sem restrição', () => expect(fio.atendeFiltro({ processo: 'x', fonte: '8' }, fio.normalizarFiltro({}))).toBeTruthy());
    it('processos exigem a coluna do processo', () => {
      expect(fio.validarFiltro({ processos: '001.003' }, { processo: '' }).erros.processos).toBeTruthy();
      expect(fio.validarFiltro({ processos: '' }, { processo: '' }).valido).toBeTruthy();
    });
    it('fonte precisa ser numérica', () => expect(fio.validarFiltro({ fontes: 'um' }, { processo: 'AS' }).erros.fontes).toBeTruthy());
  });

  describe('integração Fiorilli (relatório de notas de reserva)', () => {
    const COLUNAS = App.core.config.FIORILLI_COLUNAS_PADRAO;
    const FILTRO = App.core.config.FILTRO_RESERVAS_PADRAO;
    // Monta uma linha do relatório com 73 colunas, preenchendo somente as mapeadas
    // (R=Ficha, W=U.E, Y=Despesa, BD=Fonte, AS=Processo, BL=Saldo da Reserva, BM=Saldo da ficha).
    const nota = (ficha, ue, despesa, fonte, processo, saldoReserva, saldoFicha) => {
      const linha = new Array(73).fill(null);
      Object.entries({ R: ficha, W: ue, Y: despesa, BD: fonte, AS: processo, BL: saldoReserva, BM: saldoFicha })
        .forEach(([letra, v]) => { linha[fio.letraParaIndice(letra)] = v; });
      linha[2] = 'NOTA DE RESERVA ORÇAMENTARIA';
      return linha;
    };
    // Notas reais da ficha 29 (download-15-09-2026.xls) + casos de teste.
    const RELATORIO = [
      nota(29, '020101', '3.3.90.39.00', '01', '001.005', 0, 9978.07),     // anulada (saldo 0)
      nota(29, '020101', '3.3.90.39.00', '01', '001.003', 0, 9978.07),
      nota(29, '020101', '3.3.90.39.00', '01', '03333', 300, 8684.27),     // fora do filtro (processo)
      nota(25, '020101', '3.3.90.30.00', '01', '001.003', 1000.5, 20000),
      nota(25, '020101', '3.3.90.30.00', '01', '001.003.1', 500, 20000),
      nota(25, '020101', '3.3.90.30.00', '01', '001.003.2', 7000, 20000), // 001.003.2 não está no filtro
      [null, null, 'linha quebrada do relatório', null],                     // ignorada
      nota(26, '020101', '3.3.90.32.00', '02', '001.003', 900, 0),         // fonte 2 -> fora do filtro
      nota(900, '020201', '3.3.90.39.00', '01', '001.003.3', 5000, 8000),  // nova (02.02), dentro do filtro
      nota(901, '020101', '3.1.90.11.00', '01', '001.003', 9000, 0),       // nova pessoal -> ignorada
      nota(902, '020101', '3.3.90.39.00', '01', '001.005', 100, 100),      // nova fora do filtro
      nota(903, '029901', '3.3.90.39.00', '01', '001.003', 100, 100)       // secretaria inexistente
    ];
    const base = () => [criarSecretaria({
      codigo: '02.01', nome: 'Gabinete',
      linhas: [
        { ficha: '25', ue: '020101', fonte: '1', despesa: '3.3.90.30', descricao: 'Papel', essencial: 100, reserva: 0, saldoFicha: 11972.12, observacao: 'outubro' },
        { ficha: '25', ue: '020101', fonte: '1', despesa: '3.3.90.30', descricao: 'Toalha', essencial: 50, reserva: 10 },
        { ficha: '26', ue: '020101', fonte: '1', despesa: '3.3.90.32', descricao: 'Panfletos', essencial: 10, reserva: 900 },
        { ficha: '27', ue: '020101', fonte: '1', despesa: '3.3.90.33', descricao: 'Passagens', essencial: 10 },
        { ficha: '29', ue: '020101', fonte: '1', despesa: '3.3.90.39', descricao: 'Serviços', essencial: 10, saldoFicha: 8684.27 }
      ]
    }, REF), criarSecretaria({ codigo: '02.02', nome: 'Habitação' }, REF)];
    const lido = fio.lerRegistros(RELATORIO, COLUNAS, FILTRO);
    const ficha = (n) => lido.registros.find((r) => r.ficha === n);

    it('agrega as notas por ficha', () => {
      expect(lido.registros.length).toBe(7);
      expect(lido.resumo.notas).toBe(11);
      expect(lido.resumo.linhasIgnoradas).toBe(1);
      expect(ficha('29').notas).toBe(3);
      expect(ficha('25').despesa).toBe('3.3.90.30');
    });
    it('Reserva = soma do Saldo da Reserva só das notas do filtro', () => {
      expect(ficha('25').reserva).toBe(1500.5);
      expect(ficha('25').porProcesso).toEqual({ '001.003': 1000.5, '001.003.1': 500 });
      expect(ficha('29').reserva).toBe(0);
      expect(ficha('26').reserva).toBe(0); // fonte 2
    });
    it('Saldo Ficha vem da última nota da ficha', () => expect(ficha('29').saldoFicha).toBe(8684.27));
    it('resumo por processo', () => {
      expect(lido.resumo.porProcesso['001.003.1']).toEqual({ notas: 1, fichas: 1, saldo: 500 });
      expect(lido.resumo.porProcesso['001.003.2']).toBe(undefined);
    });
    it('filtro configurável muda o resultado', () => {
      const outro = fio.lerRegistros(RELATORIO, COLUNAS, { processos: '001.003.2', fontes: '1' });
      expect(outro.registros.find((r) => r.ficha === '25').reserva).toBe(7000);
    });
    it('exemplo da 1ª nota para conferir as colunas', () => expect(lido.exemplo.processo).toBe('001.005'));

    it('planeja atualizações, inclusões, ignoradas e reserva por secretaria', () => {
      const plano = fio.planejar(base(), lido.registros, { incluirPessoal: false, incluirZeradas: false });
      const campos = (f) => plano.atualizacoes.find((a) => a.ficha === f).alteracoes.map((a) => a.campo);
      expect(campos('25')).toEqual(['reserva', 'saldoFicha']);
      expect(campos('26')).toEqual(['fonte', 'reserva']);
      expect(plano.inalteradas).toBe(1); // ficha 29
      expect(plano.inclusoes.map((i) => i.registro.ficha)).toEqual(['900']);
      expect(plano.ignoradas.map((i) => i.registro.ficha)).toEqual(['901']);
      expect(plano.foraDoFiltro).toBe(1); // 902
      expect(plano.semSecretaria.length).toBe(1);
      expect(plano.ausentes.map((a) => a.ficha)).toEqual(['27']);
      const gabinete = plano.porSecretaria.find((s) => s.codigo === '02.01');
      expect(gabinete.antes).toBe(910);
      expect(gabinete.depois).toBe(1500.5);
      expect(plano.porSecretaria.find((s) => s.codigo === '02.02').depois).toBe(5000);
    });

    it('aplica sem tocar em Descrição/Essencial/Período e mantém a soma por ficha', () => {
      const secretarias = base();
      const plano = fio.planejar(secretarias, lido.registros, {});
      const [nova, habitacao] = fio.aplicar(secretarias, lido.registros, plano);
      const ficha25 = nova.linhas.filter((l) => l.ficha === '25');
      expect(ficha25[0].saldoFicha).toBe(20000);
      expect(ficha25[1].saldoFicha).toBe(0);
      expect(ficha25[0].reserva).toBe(1500.5);
      expect(ficha25[1].reserva).toBe(0);
      expect(ficha25.map((l) => l.descricao)).toEqual(['Papel', 'Toalha']);
      expect(ficha25[0].essencial).toBe(100);
      expect(ficha25[0].observacao).toBe('Out/2026');
      expect(nova.linhas.find((l) => l.ficha === '26').reserva).toBe(0);
      const incluida = habitacao.linhas.find((l) => l.ficha === '900');
      expect(incluida.reserva).toBe(5000);
      expect(incluida.descricao).toBe('');
      expect(incluida.essencial).toBe(0);
      expect(secretarias[0].linhas[0].saldoFicha).toBe(11972.12); // original intacto (imutável)
    });

    it('sem coluna de Saldo Ficha, o saldo da planilha é mantido', () => {
      const semSaldo = fio.lerRegistros(RELATORIO, { ...COLUNAS, saldoFicha: '' }, FILTRO);
      const secretarias = base();
      const plano = fio.planejar(secretarias, semSaldo.registros, {});
      expect(plano.atualizacoes.find((a) => a.ficha === '25').alteracoes.map((a) => a.campo)).toEqual(['reserva']);
      const [nova] = fio.aplicar(secretarias, semSaldo.registros, plano);
      expect(nova.linhas.find((l) => l.ficha === '25').saldoFicha).toBe(11972.12);
    });

    it('incluir pessoal quando solicitado', () => {
      const plano = fio.planejar(base(), lido.registros, { incluirPessoal: true });
      expect(plano.inclusoes.map((i) => i.registro.ficha)).toEqual(['900', '901']);
    });
  });
})(window.TestRunner, window.OrcApp);
