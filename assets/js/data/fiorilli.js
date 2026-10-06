/**
 * @file fiorilli.js
 * @description Integração com o relatório oficial de RESERVAS do Sistema Fiorilli
 * ("download-dd-mm-aaaa.xls" — Notas de Reserva / Anulação / Reforço).
 *
 * O relatório tem UMA LINHA POR NOTA de reserva (várias por ficha). Colunas
 * usadas (por letra — ver config, alteráveis em Configurações):
 *   Ficha (R) · U.E (W) · Despesa (Y) · Fonte (BD) · Processo (AS)
 *   Saldo da Reserva (BL) · Saldo da ficha (BM, opcional — valor da última nota)
 * Campos do USUÁRIO (nunca alterados pela integração):
 *   Descrição · Essencial · Observação (Período) · Antes · Folha
 *
 * Regra da Reserva: soma do "Saldo da Reserva" das notas da ficha que atendem
 * ao FILTRO configurável (processos 001.003 / 001.003.1 / 001.003.3 e Fonte 1).
 * Notas de anulação já vêm com saldo 0, então a soma é o saldo atual.
 *
 * Fluxo em 3 etapas puras (testáveis):
 *   1. lerRegistros(matriz, colunas, filtro) -> fichas (notas agregadas)
 *   2. planejar(secretarias, registros, op)  -> o que será atualizado/incluído (pré-visualização)
 *   3. aplicar(secretarias, registros, plano) -> novas secretarias (sem alterar as originais)
 *
 * Chave de ligação: Nº da FICHA. A secretaria de uma ficha nova é definida
 * pelos 4 primeiros dígitos da U.E (020101 -> 02.01).
 */
(function (App) {
  'use strict';

  const { paraNumero, arredondar } = App.utils.format;
  const schema = App.data.schema;

  const CAMPOS_OFICIAIS = Object.freeze(['ficha', 'ue', 'fonte', 'despesa', 'processo', 'reserva', 'saldoFicha']);
  /** Colunas que podem ficar em branco: sem processo não há filtro por processo; sem saldo, o Saldo Ficha não é alterado. */
  const CAMPOS_OPCIONAIS = Object.freeze(['processo', 'saldoFicha']);
  const ROTULOS = Object.freeze({
    ficha: 'Ficha', ue: 'U.E', fonte: 'Fonte', despesa: 'Cód. Despesa', processo: 'Processo',
    reserva: 'Saldo da Reserva', saldoFicha: 'Saldo Ficha'
  });
  const TOLERANCIA = 0.005;

  const vazio = (v) => v === null || v === undefined || String(v).trim() === '';
  const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

  /** "A" -> 0, "V" -> 21, "AS" -> 44, "BL" -> 63. Retorna -1 se inválida. */
  function letraParaIndice(letra) {
    const t = String(letra || '').trim().toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(t)) return -1;
    return [...t].reduce((total, c) => total * 26 + (c.charCodeAt(0) - 64), 0) - 1;
  }

  /** 0 -> "A", 27 -> "AB". */
  function indiceParaLetra(indice) {
    let letra = '';
    for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) letra = String.fromCharCode(65 + ((n - 1) % 26)) + letra;
    return letra;
  }

  /**
   * Títulos das colunas no CSV de Notas de Reserva do Fiorilli (download-dd-mm-aaaa.csv),
   * cujo layout difere do XLS. Conferido no arquivo de 06/10/2026.
   */
  const CABECALHOS_CSV = Object.freeze({
    ficha: 'FICHA', ue: 'CODLO', fonte: 'FONGRUPO', despesa: 'CATEC',
    processo: 'PROCESSO', reserva: 'SALDO_RESERVA', saldoFicha: 'SALDO'
  });

  /**
   * Procura, nas primeiras linhas, um cabeçalho com os títulos do CSV do Fiorilli.
   * @returns {Object|null} mapeamento de colunas (letras) ou null se não reconhecido
   */
  function detectarColunas(aoa) {
    for (const linha of aoa.slice(0, 10)) {
      if (!Array.isArray(linha)) continue;
      const titulos = linha.map((v) => texto(v).toUpperCase());
      const colunas = {};
      CAMPOS_OFICIAIS.forEach((campo) => {
        const i = titulos.indexOf(CABECALHOS_CSV[campo]);
        colunas[campo] = i < 0 ? '' : indiceParaLetra(i);
      });
      const completo = CAMPOS_OFICIAIS.every((c) => colunas[c] || CAMPOS_OPCIONAIS.includes(c));
      if (completo) return colunas;
    }
    return null;
  }

  /** Valida o mapeamento de colunas (letras válidas, obrigatórias preenchidas e sem repetição). */
  function validarColunas(colunas) {
    const erros = {};
    const usadas = new Map();
    CAMPOS_OFICIAIS.forEach((campo) => {
      const letra = String(colunas[campo] || '').trim().toUpperCase();
      if (!letra && CAMPOS_OPCIONAIS.includes(campo)) return;
      if (letraParaIndice(letra) < 0) erros[campo] = 'Informe a letra da coluna (ex.: R, AS).';
      else if (usadas.has(letra)) erros[campo] = `Coluna já usada em "${ROTULOS[usadas.get(letra)]}".`;
      else usadas.set(letra, campo);
    });
    return { valido: Object.keys(erros).length === 0, erros };
  }

  /** "001.003; 001.003.1, 001.003.3" -> ["001.003", "001.003.1", "001.003.3"] (sem repetição). */
  function listaDeTexto(valor) {
    const itens = Array.isArray(valor) ? valor : String(valor || '').split(/[,;\n]+/);
    return [...new Set(itens.map(texto).filter(Boolean))];
  }

  /** Normaliza o filtro de reservas: processos como texto exato, fontes sem zeros à esquerda. */
  function normalizarFiltro(filtro = {}) {
    return {
      processos: listaDeTexto(filtro.processos).map((p) => (p.toLowerCase() === PROCESSO_VAZIO ? PROCESSO_VAZIO : p)),
      fontes: listaDeTexto(filtro.fontes).map(schema.normalizarFonte)
    };
  }

  /** Valida o filtro em conjunto com as colunas (processos exigem a coluna do processo). */
  function validarFiltro(filtro, colunas) {
    const erros = {};
    const f = normalizarFiltro(filtro);
    if (f.processos.length && letraParaIndice(colunas.processo) < 0) {
      erros.processos = 'Para filtrar por processo, informe a coluna do Processo (ex.: AS).';
    }
    if (f.fontes.some((fonte) => !/^\d+$/.test(fonte))) erros.fontes = 'Informe as fontes com números (ex.: 1 ou 1, 5).';
    return { valido: Object.keys(erros).length === 0, erros };
  }

  /** Item do filtro que representa as notas SEM número de processo. */
  const PROCESSO_VAZIO = '(vazio)';

  /** A nota entra na soma da Reserva? (lista vazia = sem restrição) */
  function atendeFiltro(nota, filtro) {
    return (!filtro.processos.length || filtro.processos.includes(nota.processo || PROCESSO_VAZIO)) &&
      (!filtro.fontes.length || filtro.fontes.includes(nota.fonte));
  }

  /** "download-15-09-2026.xls" -> "15/09/2026" */
  function extrairDataArquivo(nome) {
    const m = String(nome || '').match(/(\d{2})[-_.](\d{2})[-_.](\d{4})/);
    return m ? `${m[1]}/${m[2]}/${m[3]}` : '';
  }

  /** Código da secretaria a partir da U.E: "020101" -> "02.01". */
  const codigoPorUe = (ue) => (/^\d{6}$/.test(ue) ? `${ue.slice(0, 2)}.${ue.slice(2, 4)}` : '');

  /**
   * Etapa 1 — lê as notas do relatório e agrega por ficha.
   * Linhas cuja coluna de ficha não é numérica (títulos, quebras do relatório) são ignoradas.
   * Por ficha: U.E, Fonte, Despesa e Saldo Ficha vêm da ÚLTIMA nota do arquivo;
   * Reserva = soma do Saldo da Reserva das notas que atendem ao filtro.
   * @returns {{registros:Array, alertas:Array, cabecalho:Object, exemplo:Object, resumo:Object}}
   */
  function lerRegistros(aoa, colunas, filtroBruto = {}) {
    const filtro = normalizarFiltro(filtroBruto);
    const indices = {};
    CAMPOS_OFICIAIS.forEach((campo) => { indices[campo] = letraParaIndice(colunas[campo]); });
    const celula = (linha, campo) => (indices[campo] < 0 ? null : linha[indices[campo]]);

    const porFicha = new Map();
    const alertas = [];
    const resumo = { notas: 0, notasFiltradas: 0, linhasIgnoradas: 0, porProcesso: {} };
    let cabecalho = null;
    let exemplo = null;

    aoa.forEach((linha, i) => {
      if (!linha || linha.every(vazio)) return;
      const fichaBruta = texto(celula(linha, 'ficha'));
      if (!/^\d+$/.test(fichaBruta)) {
        if (!cabecalho && !porFicha.size) cabecalho = linha; // primeira linha de títulos (se houver)
        else resumo.linhasIgnoradas += 1;
        return;
      }

      const numero = (campo) => {
        if (indices[campo] < 0) return null;
        const n = paraNumero(celula(linha, campo));
        if (Number.isNaN(n)) {
          alertas.push({ nivel: 'aviso', mensagem: `Linha ${i + 1}, ficha ${fichaBruta}: valor inválido "${celula(linha, campo)}" em ${ROTULOS[campo]} — considerado 0.` });
          return 0;
        }
        return arredondar(n); // "1,16E-10" (resíduo do Fiorilli) vira 0
      };

      const nota = {
        ficha: String(Number(fichaBruta)),
        ue: schema.normalizarUe(celula(linha, 'ue')),
        fonte: schema.normalizarFonte(celula(linha, 'fonte')),
        despesa: schema.normalizarDespesa(celula(linha, 'despesa')),
        processo: texto(celula(linha, 'processo')),
        saldoReserva: numero('reserva') || 0,
        saldoFicha: numero('saldoFicha')
      };

      if (!/^\d{6}$/.test(nota.ue)) {
        alertas.push({ nivel: 'aviso', mensagem: `Linha ${i + 1}, ficha ${nota.ficha}: U.E inválida "${celula(linha, 'ue') ?? ''}". Nota ignorada.` });
        return;
      }
      if (!exemplo) exemplo = linha;
      resumo.notas += 1;

      if (!porFicha.has(nota.ficha)) {
        porFicha.set(nota.ficha, { ficha: nota.ficha, reserva: 0, notas: 0, notasFiltradas: 0, porProcesso: {}, linhaOrigem: i + 1 });
      }
      const registro = porFicha.get(nota.ficha);
      if (registro.ue && registro.ue !== nota.ue) {
        alertas.push({ nivel: 'aviso', mensagem: `Linha ${i + 1}: ficha ${nota.ficha} com U.E diferente (${registro.ue} → ${nota.ue}). Usada a da última nota.` });
      }
      Object.assign(registro, { ue: nota.ue, fonte: nota.fonte, despesa: nota.despesa });
      if (nota.saldoFicha !== null) registro.saldoFicha = nota.saldoFicha;
      registro.notas += 1;

      if (atendeFiltro(nota, filtro)) {
        registro.notasFiltradas += 1;
        registro.reserva = arredondar(registro.reserva + nota.saldoReserva);
        registro.porProcesso[nota.processo] = arredondar((registro.porProcesso[nota.processo] || 0) + nota.saldoReserva);
        resumo.notasFiltradas += 1;
        const p = resumo.porProcesso[nota.processo] || (resumo.porProcesso[nota.processo] = { notas: 0, fichas: new Set(), saldo: 0 });
        p.notas += 1;
        p.fichas.add(nota.ficha);
        p.saldo = arredondar(p.saldo + nota.saldoReserva);
      }
    });

    // Sem coluna de saldo mapeada, o Saldo Ficha fica sem valor (não é atualizado).
    const registros = [...porFicha.values()].map((r) => ({ saldoFicha: null, ...r }));

    // Títulos (se o arquivo tiver cabeçalho) e valores da 1ª nota, para o usuário conferir o mapeamento.
    const extrair = (linha) => {
      const valores = {};
      CAMPOS_OFICIAIS.forEach((campo) => {
        const v = linha && indices[campo] >= 0 ? linha[indices[campo]] : '';
        valores[campo] = typeof v === 'number' ? String(arredondar(v)) : texto(v);
      });
      return valores;
    };
    resumo.porProcesso = Object.fromEntries(Object.entries(resumo.porProcesso)
      .map(([processo, p]) => [processo, { notas: p.notas, fichas: p.fichas.size, saldo: p.saldo }]));
    return { registros, alertas, cabecalho: extrair(cabecalho), exemplo: extrair(exemplo), resumo, filtro };
  }

  /** Índice ficha -> { codigo, linhas[] } das linhas existentes. */
  function indexarFichas(secretarias) {
    const indice = new Map();
    secretarias.forEach((s) => s.linhas.forEach((l) => {
      if (!indice.has(l.ficha)) indice.set(l.ficha, { codigo: s.codigo, linhas: [] });
      const item = indice.get(l.ficha);
      if (item.codigo === s.codigo) item.linhas.push(l);
    }));
    return indice;
  }

  const ehPessoal = (registro) => registro.despesa.startsWith('3.1.');
  const ehZerada = (registro) => !registro.reserva && !registro.saldoFicha;
  const temSaldoFicha = (registro) => registro.saldoFicha !== null && registro.saldoFicha !== undefined;

  /**
   * Etapa 2 — monta o plano de atualização (nada é alterado aqui).
   * Fichas NOVAS só são sugeridas quando têm notas dentro do filtro (processo/fonte).
   * @param {Array} secretarias base atual
   * @param {Array} registros   saída de lerRegistros
   * @param {Object} opcoes     regras para fichas NOVAS
   * @param {boolean} opcoes.incluirPessoal  incluir despesas de pessoal (3.1.x)
   * @param {boolean} opcoes.incluirZeradas  incluir fichas com Saldo da Reserva = 0
   */
  function planejar(secretarias, registros, opcoes = {}) {
    const { incluirPessoal = false, incluirZeradas = false } = opcoes;
    const indice = indexarFichas(secretarias);
    const codigos = new Set(secretarias.map((s) => s.codigo));
    const plano = {
      atualizacoes: [], inclusoes: [], ignoradas: [], semSecretaria: [], ausentes: [],
      inalteradas: 0, foraDoFiltro: 0, totalRegistros: registros.length, porSecretaria: []
    };
    const variacaoReserva = new Map(); // codigo -> diferença na Reserva

    const somarVariacao = (codigo, valor) => variacaoReserva.set(codigo, arredondar((variacaoReserva.get(codigo) || 0) + valor));

    registros.forEach((r) => {
      const existente = indice.get(r.ficha);
      if (existente) {
        const primeira = existente.linhas[0];
        const soma = (campo) => arredondar(existente.linhas.reduce((t, l) => t + (Number(l[campo]) || 0), 0));
        const alteracoes = [];
        if (primeira.ue !== r.ue) alteracoes.push({ campo: 'ue', antes: primeira.ue, depois: r.ue });
        if (schema.normalizarFonte(primeira.fonte) !== r.fonte) alteracoes.push({ campo: 'fonte', antes: primeira.fonte, depois: r.fonte });
        if (schema.chaveDespesa(primeira.despesa) !== schema.chaveDespesa(r.despesa)) alteracoes.push({ campo: 'despesa', antes: primeira.despesa, depois: r.despesa });
        ['reserva', 'saldoFicha'].forEach((campo) => {
          if (campo === 'saldoFicha' && !temSaldoFicha(r)) return;
          const antes = soma(campo);
          if (Math.abs(antes - r[campo]) > TOLERANCIA) {
            alteracoes.push({ campo, antes, depois: r[campo] });
            if (campo === 'reserva') somarVariacao(existente.codigo, r.reserva - antes);
          }
        });
        if (alteracoes.length) plano.atualizacoes.push({ codigo: existente.codigo, ficha: r.ficha, alteracoes });
        else plano.inalteradas += 1;
        return;
      }

      if (!r.notasFiltradas) { plano.foraDoFiltro += 1; return; }
      const codigo = codigoPorUe(r.ue);
      if (!codigos.has(codigo)) {
        plano.semSecretaria.push({ codigo, registro: r });
        return;
      }
      const motivo = (!incluirPessoal && ehPessoal(r)) ? 'pessoal (3.1)'
        : (!incluirZeradas && ehZerada(r)) ? 'saldo da reserva zerado' : '';
      if (motivo) plano.ignoradas.push({ codigo, registro: r, motivo });
      else {
        plano.inclusoes.push({ codigo, registro: r });
        somarVariacao(codigo, r.reserva);
      }
    });

    const noArquivo = new Set(registros.map((r) => r.ficha));
    indice.forEach((item, ficha) => {
      if (!noArquivo.has(ficha)) plano.ausentes.push({ codigo: item.codigo, ficha });
    });

    // Quanto cada secretaria passa a ter de Reserva (o que pode gastar).
    plano.porSecretaria = secretarias.map((s) => {
      const antes = arredondar(s.linhas.reduce((t, l) => t + (Number(l.reserva) || 0), 0));
      return { codigo: s.codigo, nome: s.nome, antes, depois: arredondar(antes + (variacaoReserva.get(s.codigo) || 0)) };
    });
    return plano;
  }

  /**
   * Etapa 3 — aplica o plano e devolve NOVAS secretarias (imutável).
   * - Fichas existentes: U.E, Fonte e Despesa atualizadas em todas as linhas da ficha;
   *   Reserva e Saldo gravados na 1ª linha (demais = 0), mantendo a soma correta.
   *   Sem coluna de saldo mapeada, o Saldo Ficha da planilha é mantido.
   * - Fichas novas: incluídas com Descrição e Essencial em branco (preenchidos pelo usuário).
   */
  function aplicar(secretarias, registros, plano) {
    const porFicha = new Map(registros.map((r) => [r.ficha, r]));
    const novas = secretarias.map((s) => {
      const vistas = new Set();
      const linhas = s.linhas.map((l) => {
        const r = porFicha.get(l.ficha);
        if (!r) return { ...l };
        const primeira = !vistas.has(l.ficha);
        vistas.add(l.ficha);
        return {
          ...l,
          ue: r.ue,
          fonte: r.fonte,
          despesa: r.despesa,
          reserva: primeira ? r.reserva : 0,
          saldoFicha: temSaldoFicha(r) ? (primeira ? r.saldoFicha : 0) : l.saldoFicha
        };
      });
      return { ...s, linhas, pendentes: s.pendentes.map((l) => ({ ...l })) };
    });

    plano.inclusoes.forEach(({ codigo, registro }) => {
      const secretaria = novas.find((s) => s.codigo === codigo);
      if (!secretaria) return;
      const linha = schema.criarLinha({
        ficha: registro.ficha, ue: registro.ue, fonte: registro.fonte, despesa: registro.despesa,
        reserva: registro.reserva, saldoFicha: registro.saldoFicha || 0,
        descricao: '', observacao: '', essencial: 0
      });
      // Mantém a ordem aproximada por número de ficha.
      const posicao = secretaria.linhas.findIndex((l) => Number(l.ficha) > Number(registro.ficha));
      if (posicao < 0) secretaria.linhas.push(linha);
      else secretaria.linhas.splice(posicao, 0, linha);
    });
    return novas;
  }

  App.data.fiorilli = Object.freeze({
    CAMPOS_OFICIAIS, CAMPOS_OPCIONAIS, ROTULOS, PROCESSO_VAZIO,
    letraParaIndice, indiceParaLetra, detectarColunas, validarColunas, normalizarFiltro, validarFiltro, atendeFiltro, listaDeTexto,
    extrairDataArquivo, codigoPorUe, lerRegistros, planejar, aplicar
  });
})(window.OrcApp);
