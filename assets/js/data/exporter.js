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

  /**
   * Campos gravados nos arquivos exportados (v1.5: "Antes"/"Valor Anterior" não é exportado;
   * o campo continua no modelo e, na reimportação, volta como 0).
   */
  const CAMPOS_EXPORTACAO = Object.freeze(config.CAMPOS_LINHA.filter((c) => c.chave !== 'antes'));
  const CABECALHO_ABA = CAMPOS_EXPORTACAO.map((c) => c.cabecalhoPlanilha);
  const FORMATO_NUMERO = '#,##0.00';

  /** 0 -> "A", 27 -> "AB". */
  function letraColuna(indice) {
    let letra = '';
    for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) letra = String.fromCharCode(65 + ((n - 1) % 26)) + letra;
    return letra;
  }

  /** Posição (índice e letra) de cada campo na aba da secretaria — as fórmulas derivam daqui. */
  const POSICAO = Object.freeze(Object.fromEntries(CAMPOS_EXPORTACAO.map((c, i) => [c.chave, Object.freeze({ indice: i, letra: letraColuna(i) })])));
  const COL_ESSENCIAL = POSICAO.essencial.letra;
  const COL_RESERVA = POSICAO.reserva.letra;
  const COL_SALDO = POSICAO.saldoFicha.letra;
  /** Rótulos do bloco-resumo ficam na coluna imediatamente antes do Essencial. */
  const IDX_ROTULO_RESUMO = POSICAO.essencial.indice - 1;

  /** Linha com valores nas colunas indicadas ({ chaveOuIndice: valor }). */
  function linhaEsparsa(valores) {
    const linha = [];
    Object.entries(valores).forEach(([chave, valor]) => {
      const indice = chave in POSICAO ? POSICAO[chave].indice : Number(chave);
      while (linha.length < indice) linha.push('');
      linha[indice] = valor;
    });
    return linha;
  }

  const MIME = Object.freeze({
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv;charset=utf-8'
  });

  /** Converte uma linha do modelo em array na ordem de CAMPOS_EXPORTACAO. */
  function linhaParaArray(linha) {
    return CAMPOS_EXPORTACAO.map((c) => (c.tipo === 'moeda' ? Number(linha[c.chave]) || 0 : linha[c.chave]));
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
    aoa.push(linhaEsparsa({ essencial: -t.essencial, reserva: t.reserva, saldoFicha: t.saldoFicha }));
    aoa.push([]);
    const linhaResumo = aoa.length + 1;
    const resumo = (rotulo, valor) => linhaEsparsa({ [IDX_ROTULO_RESUMO]: rotulo, essencial: valor });
    aoa.push(resumo('Essencial', -t.essencial));
    aoa.push(resumo('Reserva', t.reserva));
    aoa.push(resumo('Saldo ficha', t.saldoFicha));
    aoa.push(resumo('Folha', -t.folha));
    const linhaFolha = linhaResumo + 3;
    aoa.push(resumo('TOTAL', t.resultado));
    const linhaTotal = linhaResumo + 4;

    if (secretaria.pendentes.length) {
      // Rótulo na coluna "Descrição" (sem ficha) para não ser lido como despesa na reimportação.
      aoa.push([], linhaEsparsa({ descricao: 'Lançamentos fora do quadro (não somados)' }));
      secretaria.pendentes.forEach((l) => aoa.push(linhaParaArray(l)));
    }

    // Fórmulas equivalentes às da planilha original (valores já calculados acima).
    // As letras vêm de POSICAO (Essencial, Reserva e Saldo ficha).
    const formulas = {};
    if (secretaria.linhas.length) {
      [COL_ESSENCIAL, COL_RESERVA, COL_SALDO].forEach((col) => {
        const sinal = col === COL_ESSENCIAL ? '*-1' : '';
        formulas[`${col}${linhaSubtotal}`] = `SUBTOTAL(9,${col}${inicioDados}:${col}${fimDados})${sinal}`;
      });
    }
    formulas[`${COL_ESSENCIAL}${linhaResumo}`] = `${COL_ESSENCIAL}${linhaSubtotal}`;
    formulas[`${COL_ESSENCIAL}${linhaResumo + 1}`] = `${COL_RESERVA}${linhaSubtotal}`;
    formulas[`${COL_ESSENCIAL}${linhaResumo + 2}`] = `${COL_SALDO}${linhaSubtotal}`;
    formulas[`${COL_ESSENCIAL}${linhaTotal}`] = `SUM(${COL_ESSENCIAL}${linhaResumo}:${COL_ESSENCIAL}${linhaFolha})`;

    return { aoa, formulas, linhaSubtotal, linhaFolha, linhaTotal };
  }

  /** Matriz da aba GERAL (consolidado), com referências às abas das secretarias. */
  function montarAbaGeral(secretarias, posicoes, atualizadoEm) {
    const { geral, porSecretaria } = totaisGerais(secretarias);
    const aoa = [
      [config.ORGAO],
      [`${config.APP_NOME} — Consolidado`],
      [],
      ['U.O.', 'LOCAL', 'ESSENCIAL', 'FOLHA', 'RESERVA', 'SALDO FICHA', 'TOTAL']
    ];
    const formulas = {};
    const inicio = aoa.length + 1;

    porSecretaria.forEach((t) => {
      const r = aoa.length + 1;
      aoa.push([t.codigo, t.nome, -t.essencial, -t.folha, t.reserva, t.saldoFicha, t.resultado]);
      const p = posicoes[t.codigo];
      const aba = `'${t.codigo}'`;
      if (p) {
        formulas[`C${r}`] = `${aba}!${COL_ESSENCIAL}${p.linhaSubtotal}`;
        formulas[`D${r}`] = `${aba}!${COL_ESSENCIAL}${p.linhaFolha}`;
        formulas[`E${r}`] = `${aba}!${COL_RESERVA}${p.linhaSubtotal}`;
        formulas[`F${r}`] = `${aba}!${COL_SALDO}${p.linhaSubtotal}`;
      }
      formulas[`G${r}`] = `C${r}+E${r}+F${r}+D${r}`;
    });

    const fim = aoa.length;
    const rTotal = aoa.length + 2;
    aoa.push([], ['', `Atualizado em ${atualizadoEm}`, -geral.essencial, -geral.folha, geral.reserva, geral.saldoFicha, geral.resultado]);
    if (porSecretaria.length) {
      ['C', 'D', 'E', 'F', 'G'].forEach((col) => { formulas[`${col}${rTotal}`] = `SUM(${col}${inicio}:${col}${fim})`; });
    }

    aoa.push([], [], ['Textos-padrão de despacho:']);
    Object.values(config.MENSAGENS_PARECER).forEach((m) => aoa.push([m]));
    return { aoa, formulas };
  }

  /** Tabela plana (uma linha por despesa) — usada no CSV e no XLSX simples. */
  function montarTabelaPlana(secretarias, filtro = {}) {
    const cabecalho = ['U.O.', 'Secretaria', ...CAMPOS_EXPORTACAO.map((c) => c.rotulo), 'Folha (secretaria)', 'Tipo'];
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
    const aoa = [['U.O.', 'Secretaria', 'Essencial', 'Folha', 'Reserva', 'Saldo Ficha', 'Resultado']];
    porSecretaria.forEach((t) => aoa.push([t.codigo, t.nome, t.essencial, t.folha, t.reserva, t.saldoFicha, t.resultado]));
    aoa.push(['', 'TOTAL GERAL', geral.essencial, geral.folha, geral.reserva, geral.saldoFicha, geral.resultado]);
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

  const LARGURA_CAMPO = Object.freeze({ ficha: 8, ue: 9, fonte: 5, despesa: 12, descricao: 50, observacao: 22, anotacao: 45 });
  const LARGURAS_ABA = CAMPOS_EXPORTACAO.map((c) => LARGURA_CAMPO[c.chave] || 15);

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
    XLSX.utils.book_append_sheet(wb, criarAba(XLSX, geral.aoa, geral.formulas, [8, 55, 16, 16, 16, 16, 16]), 'GERAL');
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
      XLSX.utils.book_append_sheet(wb, criarAba(XLSX, montarConsolidado(alvo, filtro), {}, [8, 55, 16, 16, 16, 16, 16]), 'Consolidado');
    } else {
      wb = montarWorkbookBase(XLSX, alvo.map((s) => aplicarFiltro(s, filtro)), data);
    }
    const bytes = XLSX.write(wb, { bookType: formato === 'xls' ? 'biff8' : 'xlsx', type: 'array' });
    return { blob: new Blob([bytes], { type: MIME[formato] }), nomeArquivo };
  }

  App.data.exporter = Object.freeze({
    CAMPOS_EXPORTACAO, gerarArquivo, montarWorkbookBase, montarAbaSecretaria, montarAbaGeral, montarTabelaPlana, montarConsolidado, gerarCsv
  });
})(window.OrcApp);
