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
 * v1.5: cada ficha guarda também a COMPOSIÇÃO da Reserva (todas as notas,
 * somadas por processo × fonte), para recalcular a Reserva quando o filtro
 * muda em Configurações, sem reler o arquivo.
 *
 * v1.6: o relatório vira uma CAMADA separada da planilha (ver combinar):
 * a ordem "Importar planilha" / "Atualizar Fiorilli" não altera o resultado.
 *
 * Fluxo em etapas puras (testáveis):
 *   1. lerRegistros(matriz, colunas, filtro)       -> fichas (notas agregadas)
 *   2. planejar(secretarias, registros, op)        -> o que muda / fichas novas (pré-visualização)
 *   3. criarCamada({ registros, filtro, incluidas }) -> camada Fiorilli (guardada no navegador)
 *   4. combinar(planilha, camada)                  -> base exibida (sem alterar as entradas)
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

  /* ------------------------ Composição da Reserva (v1.5) ------------------------ */

  /**
   * Composição = Saldo da Reserva de TODAS as notas da ficha, somado por processo e fonte:
   *   { [processo ou PROCESSO_VAZIO]: { [fonte]: valor } }
   * Guardada após a atualização Fiorilli, permite recalcular a Reserva quando o
   * filtro muda, sem reler o arquivo.
   */
  function somarComposicao(composicao, nota) {
    const processo = nota.processo || PROCESSO_VAZIO;
    const porFonte = composicao[processo] || (composicao[processo] = {});
    porFonte[nota.fonte] = arredondar((porFonte[nota.fonte] || 0) + nota.saldoReserva);
  }

  /** Reserva de uma ficha conforme o filtro (soma das células da composição que atendem a ele). */
  function reservaPorFiltro(composicao, filtroBruto) {
    const filtro = normalizarFiltro(filtroBruto);
    let total = 0;
    Object.entries(composicao || {}).forEach(([processo, porFonte]) => Object.entries(porFonte).forEach(([fonte, valor]) => {
      if (atendeFiltro({ processo: processo === PROCESSO_VAZIO ? '' : processo, fonte }, filtro)) total += valor;
    }));
    return arredondar(total);
  }

  /** Processos e fontes presentes nas composições (para oferecer como opção no filtro). */
  function opcoesDasComposicoes(composicoes) {
    const processos = new Set();
    const fontes = new Set();
    Object.values(composicoes || {}).forEach((c) => Object.entries(c).forEach(([processo, porFonte]) => {
      processos.add(processo);
      Object.keys(porFonte).forEach((f) => fontes.add(f));
    }));
    const ordenar = (a, b) => a.localeCompare(b, 'pt-BR', { numeric: true });
    return { processos: [...processos].sort(ordenar), fontes: [...fontes].sort(ordenar) };
  }

  /* ------------------ Camada Fiorilli e base combinada (v1.6) ------------------ */

  /**
   * v1.6: a planilha e o Fiorilli ficam em CAMADAS separadas e a base exibida é a
   * combinação das duas (função pura `combinar`):
   *   - planilha → campos do usuário + valores oficiais da planilha (valem para as
   *     fichas que não estão no relatório do Fiorilli);
   *   - Fiorilli → último relatório aplicado, por ficha.
   * "Importar planilha" troca só a planilha e "Atualizar Fiorilli" troca só a camada
   * Fiorilli. O resultado é o mesmo em qualquer ordem de carregamento.
   *
   * Camada {
   *   meta: { arquivo, dataSaldos, aplicadoEm, ... },
   *   filtro: { processos, fontes },            // filtro EM VIGOR da Reserva
   *   fichas: { [ficha]: { ue, fonte, despesa, saldoFicha (null = não informado), composicao } },
   *   incluidas: [ficha]                        // fichas novas aceitas na pré-visualização
   * }
   */

  /** Id fixo da linha de uma ficha incluída pelo Fiorilli (estável entre recombinações). */
  const idLinhaIncluida = (ficha) => `fiorilli-${ficha}`;

  /** Monta a camada a partir dos registros lidos (saída de lerRegistros). */
  function criarCamada({ registros, meta = {}, filtro = {}, incluidas = [] }) {
    const fichas = {};
    registros.forEach((r) => {
      fichas[r.ficha] = {
        ue: r.ue, fonte: r.fonte, despesa: r.despesa,
        saldoFicha: temSaldoFicha(r) ? r.saldoFicha : null,
        composicao: r.composicao || {}
      };
    });
    return {
      meta: { ...meta },
      filtro: normalizarFiltro(filtro),
      fichas,
      incluidas: listaDeTexto(incluidas).filter((f) => fichas[f])
    };
  }

  /** Camada lida do navegador: garante a estrutura mínima (ou null se inválida). */
  function normalizarCamada(camada) {
    if (!camada || typeof camada !== 'object' || !camada.fichas || typeof camada.fichas !== 'object') return null;
    return {
      meta: { ...(camada.meta || {}) },
      filtro: normalizarFiltro(camada.filtro),
      fichas: camada.fichas,
      incluidas: listaDeTexto(camada.incluidas || []).filter((f) => camada.fichas[f])
    };
  }

  /** Valores oficiais de uma ficha na camada (Reserva pelo filtro em vigor), ou null. */
  function valoresOficiais(camada, ficha) {
    const f = camada && camada.fichas[ficha];
    if (!f) return null;
    return { ue: f.ue, fonte: f.fonte, despesa: f.despesa, reserva: reservaPorFiltro(f.composicao, camada.filtro), saldoFicha: f.saldoFicha };
  }

  /** Insere a linha mantendo a ordem aproximada por número de ficha. */
  function inserirPorFicha(linhas, linha) {
    const posicao = linhas.findIndex((l) => Number(l.ficha) > Number(linha.ficha));
    if (posicao < 0) linhas.push(linha);
    else linhas.splice(posicao, 0, linha);
  }

  /**
   * Base exibida = planilha + camada Fiorilli. Não altera as entradas.
   *  - Ficha no relatório: U.E, Fonte e Despesa em todas as linhas; Reserva e Saldo Ficha
   *    na 1ª linha da ficha e 0 nas demais (a soma continua igual ao SUBTOTAL do Excel).
   *    Sem Saldo Ficha no relatório, vale o da planilha.
   *  - Ficha fora do relatório: valores da planilha.
   *  - Fichas incluídas pelo Fiorilli que não estão na planilha entram como linhas novas.
   * Cada linha recebe `origem` ('fiorilli' | 'planilha'), de onde vêm Reserva e Saldo.
   * @param {Array} secretarias camada da planilha
   * @param {Object|null} camada camada Fiorilli
   */
  function combinar(secretarias, camada) {
    const naPlanilha = new Set();
    const combinadas = secretarias.map((s) => {
      const vistas = new Set();
      const linhas = s.linhas.map((l) => {
        naPlanilha.add(l.ficha);
        const oficial = valoresOficiais(camada, l.ficha);
        if (!oficial) return { ...l, origem: 'planilha' };
        const primeira = !vistas.has(l.ficha);
        vistas.add(l.ficha);
        return {
          ...l,
          ue: oficial.ue,
          fonte: oficial.fonte,
          despesa: oficial.despesa,
          reserva: primeira ? oficial.reserva : 0,
          saldoFicha: oficial.saldoFicha === null ? l.saldoFicha : (primeira ? oficial.saldoFicha : 0),
          origem: 'fiorilli'
        };
      });
      return { ...s, linhas, pendentes: s.pendentes.map((l) => ({ ...l })) };
    });

    (camada ? camada.incluidas : []).forEach((ficha) => {
      if (naPlanilha.has(ficha)) return;
      const oficial = valoresOficiais(camada, ficha);
      const secretaria = combinadas.find((s) => s.codigo === codigoPorUe(oficial.ue));
      if (!secretaria) return;
      inserirPorFicha(secretaria.linhas, {
        ...schema.criarLinha({ ...oficial, id: idLinhaIncluida(ficha), ficha, saldoFicha: oficial.saldoFicha || 0, descricao: '', observacao: '', essencial: 0 }),
        origem: 'fiorilli'
      });
    });
    return combinadas;
  }

  /** Soma da Reserva por ficha de uma secretaria. */
  function reservaPorFicha(secretaria) {
    const somas = new Map();
    secretaria.linhas.forEach((l) => somas.set(l.ficha, arredondar((somas.get(l.ficha) || 0) + (Number(l.reserva) || 0))));
    return somas;
  }

  /**
   * Prévia da troca do filtro em vigor (nada é alterado aqui): compara a base
   * combinada com o filtro atual e com o novo filtro.
   * Fichas fora do relatório Fiorilli ("sem composição") mantêm a Reserva da planilha.
   * @param {Array} secretarias camada da planilha
   * @param {Object|null} camada camada Fiorilli
   * @param {Object} filtro novo filtro { processos, fontes }
   * @returns {Object} plano; `plano.secretarias` = base combinada com o novo filtro
   */
  function planejarRecalculo(secretarias, camada, filtro) {
    const antes = combinar(secretarias, camada);
    const depois = combinar(secretarias, camada && { ...camada, filtro: normalizarFiltro(filtro) });
    const plano = { alteracoes: [], semComposicao: 0, recalculaveis: 0, porSecretaria: [], totalAntes: 0, totalDepois: 0, secretarias: depois };
    antes.forEach((s, i) => {
      const somasDepois = reservaPorFicha(depois[i]);
      let antesSec = 0;
      let depoisSec = 0;
      reservaPorFicha(s).forEach((valorAntes, ficha) => {
        const valorDepois = somasDepois.get(ficha) || 0;
        antesSec += valorAntes;
        depoisSec += valorDepois;
        if (!camada || !camada.fichas[ficha]) { plano.semComposicao += 1; return; }
        plano.recalculaveis += 1;
        if (Math.abs(valorDepois - valorAntes) > TOLERANCIA) plano.alteracoes.push({ codigo: s.codigo, ficha, antes: valorAntes, depois: valorDepois });
      });
      plano.porSecretaria.push({ codigo: s.codigo, nome: s.nome, antes: arredondar(antesSec), depois: arredondar(depoisSec) });
      plano.totalAntes += antesSec;
      plano.totalDepois += depoisSec;
    });
    plano.totalAntes = arredondar(plano.totalAntes);
    plano.totalDepois = arredondar(plano.totalDepois);
    return plano;
  }

  /**
   * Migração dos dados da v1.5, em que os valores do Fiorilli eram gravados nas
   * linhas e só as composições das fichas da base eram guardadas.
   * Cria a camada a partir das linhas dessas fichas; o filtro em vigor é, entre os
   * candidatos, o que reproduz o maior número de Reservas gravadas.
   * @returns {Object|null}
   */
  function camadaDaVersaoAnterior(secretarias, composicoes, meta, candidatosFiltro) {
    if (!composicoes || !Object.keys(composicoes).length) return null;
    const porFicha = new Map();
    secretarias.forEach((s) => s.linhas.forEach((l) => {
      if (!composicoes[l.ficha]) return;
      if (!porFicha.has(l.ficha)) {
        porFicha.set(l.ficha, { ficha: l.ficha, ue: l.ue, fonte: l.fonte, despesa: l.despesa, saldoFicha: 0, reserva: 0, composicao: composicoes[l.ficha] });
      }
      const r = porFicha.get(l.ficha);
      r.saldoFicha = arredondar(r.saldoFicha + (Number(l.saldoFicha) || 0));
      r.reserva = arredondar(r.reserva + (Number(l.reserva) || 0));
    }));
    const registros = [...porFicha.values()];
    const acertos = (f) => registros.filter((r) => Math.abs(reservaPorFiltro(r.composicao, f) - r.reserva) <= TOLERANCIA).length;
    const filtro = candidatosFiltro.filter(Boolean).reduce((melhor, f) => (acertos(f) > acertos(melhor) ? f : melhor));
    return criarCamada({ registros, meta: meta || {}, filtro });
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
        porFicha.set(nota.ficha, { ficha: nota.ficha, reserva: 0, notas: 0, notasFiltradas: 0, porProcesso: {}, composicao: {}, linhaOrigem: i + 1 });
      }
      const registro = porFicha.get(nota.ficha);
      somarComposicao(registro.composicao, nota);
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

  App.data.fiorilli = Object.freeze({
    CAMPOS_OFICIAIS, CAMPOS_OPCIONAIS, ROTULOS, PROCESSO_VAZIO,
    letraParaIndice, indiceParaLetra, detectarColunas, validarColunas, normalizarFiltro, validarFiltro, atendeFiltro, listaDeTexto,
    extrairDataArquivo, codigoPorUe, lerRegistros, planejar,
    reservaPorFiltro, opcoesDasComposicoes, planejarRecalculo,
    criarCamada, normalizarCamada, combinar, idLinhaIncluida, camadaDaVersaoAnterior
  });
})(window.OrcApp);
