/**
 * @file exporter.js
 * @description Geração de arquivos XLSX, XLS e CSV.
 *
 * - "Base completa" (XLSX/XLS) reproduz o LAYOUT DA PLANILHA ORIGINAL
 *   (aba GERAL + uma aba por secretaria, com fórmulas SUBTOTAL/TOTAL),
 *   garantindo ida-e-volta: o arquivo exportado pode ser reimportado.
 * - CSV usa "tabela plana" (uma linha por despesa), separador ";" e
 *   vírgula decimal, compatível com o Excel em português.
 *
 * As funções `montar*` devolvem matrizes puras (testáveis); somente
 * `gerarArquivo` depende da biblioteca SheetJS (window.XLSX).
 */
(function (App) {
  'use strict';

  const config = App.core.config;
  const { filtrarLinhas, filtroAtivo, totaisSecretaria, totaisGerais } = App.data.calculos;
  const { dataBR, slug } = App.utils.format;

  const CABECALHO_ABA = config.CAMPOS_LINHA.map((c) => c.cabecalhoPlanilha);
  const FORMATO_NUMERO = '#,##0.00';

  const MIME = Object.freeze({
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv;charset=utf-8'
  });

  /** Converte uma linha do modelo em array na ordem de CAMPOS_LINHA. */
  function linhaParaArray(linha) {
    return config.CAMPOS_LINHA.map((c) => (c.tipo === 'moeda' ? Number(linha[c.chave]) || 0 : linha[c.chave]));
  }

  /** Aplica o filtro (período/busca) a uma secretaria, sem alterar o original. */
  function aplicarFiltro(secretaria, filtro) {
    if (!filtroAtivo(filtro)) return secretaria;
    return { ...secretaria, linhas: filtrarLinhas(secretaria.linhas, filtro), pendentes: [], folha: 0 };
  }

  /**
   * Monta a matriz de uma aba de secretaria no layout original.
   * @returns {{aoa:Array, formulas:Object, linhaSubtotal:number, linhaFolha:number, linhaTotal:number}}
   *          (números de linha 1-based, como no Excel)
   */
  function montarAbaSecretaria(secretaria, atualizadoEm) {
    const t = totaisSecretaria(secretaria);
    const aoa = [
      [secretaria.nome],
      [`Atualizado em ${atualizadoEm}`],
      CABECALHO_ABA,
      []
    ];
    const inicioDados = aoa.length + 1; // 1-based
    secretaria.linhas.forEach((l) => aoa.push(linhaParaArray(l)));
    const fimDados = aoa.length;

    aoa.push([]);
    const linhaSubtotal = aoa.length + 1;
    aoa.push(['', '', '', '', '', '', -t.essencial, t.antes, t.cortes, t.reserva, t.saldoFicha]);
    aoa.push([]);
    const linhaResumo = aoa.length + 1;
    aoa.push(['', '', '', '', '', 'Essencial', -t.essencial]);
    aoa.push(['', '', '', '', '', 'Reserva', t.reserva]);
    aoa.push(['', '', '', '', '', 'Saldo ficha', t.saldoFicha]);
    aoa.push(['', '', '', '', '', 'Folha', -t.folha]);
    const linhaFolha = linhaResumo + 3;
    aoa.push(['', '', '', '', '', 'TOTAL', t.resultado]);
    const linhaTotal = linhaResumo + 4;

    if (secretaria.pendentes.length) {
      // Rótulo na coluna "Descrição" (sem ficha) para não ser lido como despesa na reimportação.
      aoa.push([], ['', '', '', '', 'Lançamentos fora do quadro (não somados)']);
      secretaria.pendentes.forEach((l) => aoa.push(linhaParaArray(l)));
    }

    // Fórmulas equivalentes às da planilha original (valores já calculados acima).
    const formulas = {};
    if (secretaria.linhas.length) {
      ['G', 'H', 'I', 'J', 'K'].forEach((col) => {
        const sinal = col === 'G' ? '*-1' : '';
        formulas[`${col}${linhaSubtotal}`] = `SUBTOTAL(9,${col}${inicioDados}:${col}${fimDados})${sinal}`;
      });
    }
    formulas[`G${linhaResumo}`] = `G${linhaSubtotal}`;
    formulas[`G${linhaResumo + 1}`] = `J${linhaSubtotal}`;
    formulas[`G${linhaResumo + 2}`] = `K${linhaSubtotal}`;
    formulas[`G${linhaTotal}`] = `SUM(G${linhaResumo}:G${linhaFolha})`;

    return { aoa, formulas, linhaSubtotal, linhaFolha, linhaTotal };
  }

  /** Matriz da aba GERAL (consolidado), com referências às abas das secretarias. */
  function montarAbaGeral(secretarias, posicoes, atualizadoEm) {
    const { geral, porSecretaria } = totaisGerais(secretarias);
    const aoa = [
      [config.ORGAO],
      [`${config.APP_NOME} — Consolidado`],
      [],
      ['U.O.', 'LOCAL', 'ESSENCIAL', 'Cortes despesa', 'FOLHA', 'RESERVA', 'SALDO FICHA', 'TOTAL']
    ];
    const formulas = {};
    const inicio = aoa.length + 1;

    porSecretaria.forEach((t) => {
      const r = aoa.length + 1;
      aoa.push([t.codigo, t.nome, -t.essencial, t.cortes, -t.folha, t.reserva, t.saldoFicha, t.resultado]);
      const p = posicoes[t.codigo];
      const aba = `'${t.codigo}'`;
      if (p) {
        formulas[`C${r}`] = `${aba}!G${p.linhaSubtotal}`;
        formulas[`D${r}`] = `${aba}!I${p.linhaSubtotal}`;
        formulas[`E${r}`] = `${aba}!G${p.linhaFolha}`;
        formulas[`F${r}`] = `${aba}!J${p.linhaSubtotal}`;
        formulas[`G${r}`] = `${aba}!K${p.linhaSubtotal}`;
      }
      formulas[`H${r}`] = `C${r}+F${r}+G${r}+E${r}`;
    });

    const fim = aoa.length;
    const rTotal = aoa.length + 2;
    aoa.push([], ['', `Atualizado em ${atualizadoEm}`, -geral.essencial, geral.cortes, -geral.folha, geral.reserva, geral.saldoFicha, geral.resultado]);
    if (porSecretaria.length) {
      ['C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => { formulas[`${col}${rTotal}`] = `SUM(${col}${inicio}:${col}${fim})`; });
    }

    aoa.push([], [], ['Textos-padrão de despacho:']);
    Object.values(config.MENSAGENS_PARECER).forEach((m) => aoa.push([m]));
    return { aoa, formulas };
  }

  /** Tabela plana (uma linha por despesa) — usada no CSV e no XLSX simples. */
  function montarTabelaPlana(secretarias, filtro = {}) {
    const cabecalho = ['U.O.', 'Secretaria', ...config.CAMPOS_LINHA.map((c) => c.rotulo), 'Folha (secretaria)', 'Tipo'];
    const aoa = [cabecalho];
    secretarias.forEach((original) => {
      const s = aplicarFiltro(original, filtro);
      s.linhas.forEach((l) => aoa.push([s.codigo, s.nome, ...linhaParaArray(l), s.folha, 'Quadro']));
      s.pendentes.forEach((l) => aoa.push([s.codigo, s.nome, ...linhaParaArray(l), s.folha, 'Fora do quadro']));
    });
    return aoa;
  }

  /** Quadro consolidado (uma linha por secretaria). */
  function montarConsolidado(secretarias, filtro = {}) {
    const { geral, porSecretaria } = totaisGerais(secretarias, filtro);
    const aoa = [['U.O.', 'Secretaria', 'Essencial', 'Cortes', 'Folha', 'Reserva', 'Saldo Ficha', 'Resultado']];
    porSecretaria.forEach((t) => aoa.push([t.codigo, t.nome, t.essencial, t.cortes, t.folha, t.reserva, t.saldoFicha, t.resultado]));
    aoa.push(['', 'TOTAL GERAL', geral.essencial, geral.cortes, geral.folha, geral.reserva, geral.saldoFicha, geral.resultado]);
    return aoa;
  }

  /** Converte matriz em CSV (";" + vírgula decimal + BOM para o Excel BR). */
  function gerarCsv(aoa) {
    const celula = (v) => {
      if (typeof v === 'number') return String(v).replace('.', ',');
      const t = String(v === null || v === undefined ? '' : v);
      return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    return `﻿${aoa.map((linha) => linha.map(celula).join(';')).join('\r\n')}`;
  }

  /* ---------------------- Camada dependente do SheetJS ---------------------- */

  /** Cria uma aba SheetJS a partir da matriz, aplicando fórmulas e formatos. */
  function criarAba(XLSX, aoa, formulas = {}, larguras = []) {
    const aba = XLSX.utils.aoa_to_sheet(aoa);
    Object.entries(formulas).forEach(([endereco, formula]) => {
      if (aba[endereco]) aba[endereco].f = formula;
    });
    Object.keys(aba).forEach((endereco) => {
      if (endereco[0] !== '!' && aba[endereco].t === 'n') aba[endereco].z = FORMATO_NUMERO;
    });
    if (larguras.length) aba['!cols'] = larguras.map((wch) => ({ wch }));
    return aba;
  }

  const LARGURAS_ABA = [8, 9, 5, 12, 50, 22, 15, 15, 15, 15, 15, 45];

  /** Workbook completo no layout original (GERAL + abas por secretaria). */
  function montarWorkbookBase(XLSX, secretarias, atualizadoEm) {
    const wb = XLSX.utils.book_new();
    const posicoes = {};
    const abas = secretarias.map((s) => {
      const montada = montarAbaSecretaria(s, atualizadoEm);
      posicoes[s.codigo] = montada;
      return [s.codigo, criarAba(XLSX, montada.aoa, montada.formulas, LARGURAS_ABA)];
    });
    const geral = montarAbaGeral(secretarias, posicoes, atualizadoEm);
    XLSX.utils.book_append_sheet(wb, criarAba(XLSX, geral.aoa, geral.formulas, [8, 55, 16, 16, 16, 16, 16, 16]), 'GERAL');
    abas.forEach(([nome, aba]) => XLSX.utils.book_append_sheet(wb, aba, nome));
    return wb;
  }

  /**
   * Gera o arquivo solicitado.
   * @param {Object} opcoes
   * @param {'xlsx'|'xls'|'csv'} opcoes.formato
   * @param {'base'|'consolidado'|'secretaria'} opcoes.escopo
   * @param {string} [opcoes.codigo] secretaria (escopo 'secretaria')
   * @param {Object} [opcoes.filtro] { periodo }
   * @param {Array}  opcoes.secretarias
   * @param {string} [opcoes.atualizadoEm]
   * @returns {{blob:Blob, nomeArquivo:string}}
   */
  function gerarArquivo({ formato, escopo, codigo, filtro = {}, secretarias, atualizadoEm }) {
    if (!MIME[formato]) throw new Error(`Formato "${formato}" não suportado.`);
    const data = atualizadoEm || dataBR(new Date());
    const sufixoFiltro = filtroAtivo(filtro) ? `-${slug(filtro.periodo || filtro.busca)}` : '';

    let alvo = secretarias;
    if (escopo === 'secretaria') {
      alvo = secretarias.filter((s) => s.codigo === codigo);
      if (!alvo.length) throw new Error('Selecione a secretaria a ser exportada.');
    }
    if (!alvo.length) throw new Error('Não há dados para exportar. Importe uma planilha primeiro.');

    const base = escopo === 'secretaria' ? `secretaria-${slug(codigo)}` : `orcamento-${escopo}`;
    const nomeArquivo = `${base}${sufixoFiltro}-${slug(dataBR(new Date()))}.${formato}`;

    if (formato === 'csv') {
      const aoa = escopo === 'consolidado' ? montarConsolidado(alvo, filtro) : montarTabelaPlana(alvo, filtro);
      return { blob: new Blob([gerarCsv(aoa)], { type: MIME.csv }), nomeArquivo };
    }

    const XLSX = window.XLSX;
    if (!XLSX) throw new Error('Biblioteca de planilhas (SheetJS) não carregada.');

    let wb;
    if (escopo === 'consolidado') {
      wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, criarAba(XLSX, montarConsolidado(alvo, filtro), {}, [8, 55, 16, 16, 16, 16, 16, 16]), 'Consolidado');
    } else {
      wb = montarWorkbookBase(XLSX, alvo.map((s) => aplicarFiltro(s, filtro)), data);
    }
    const bytes = XLSX.write(wb, { bookType: formato === 'xls' ? 'biff8' : 'xlsx', type: 'array' });
    return { blob: new Blob([bytes], { type: MIME[formato] }), nomeArquivo };
  }

  App.data.exporter = Object.freeze({
    gerarArquivo, montarWorkbookBase, montarAbaSecretaria, montarAbaGeral, montarTabelaPlana, montarConsolidado, gerarCsv
  });
})(window.OrcApp);
