/**
 * @file fiorilli.js
 * @description Integração com o arquivo oficial do Sistema Fiorilli
 * ("download-SaldoDotacao-dd-mm-aaaa.csv").
 *
 * Campos OFICIAIS (vêm do Fiorilli, por letra de coluna — ver config):
 *   Ficha (V) · U.E (AT) · Fonte (AZ) · Cód. Despesa (AV) · Reserva (BK) · Saldo Ficha (BD)
 * Campos do USUÁRIO (nunca alterados pela integração):
 *   Descrição · Essencial · Observação (Período) · Antes · Cortes · Folha
 *
 * Fluxo em 3 etapas puras (testáveis):
 *   1. lerRegistros(matriz, colunas)        -> registros normalizados
 *   2. planejar(secretarias, registros, op) -> o que será atualizado/incluído (pré-visualização)
 *   3. aplicar(secretarias, registros, plano) -> novas secretarias (sem alterar as originais)
 *
 * Chave de ligação: Nº da FICHA (única no Fiorilli). A secretaria de uma
 * ficha nova é definida pelos 4 primeiros dígitos da U.E (020101 -> 02.01).
 */
(function (App) {
  'use strict';

  const { paraNumero, arredondar } = App.utils.format;
  const schema = App.data.schema;

  const CAMPOS_OFICIAIS = Object.freeze(['ficha', 'ue', 'fonte', 'despesa', 'reserva', 'saldoFicha']);
  const ROTULOS = Object.freeze({ ficha: 'Ficha', ue: 'U.E', fonte: 'Fonte', despesa: 'Cód. Despesa', reserva: 'Reserva', saldoFicha: 'Saldo Ficha' });
  const TOLERANCIA = 0.005;

  const vazio = (v) => v === null || v === undefined || String(v).trim() === '';

  /** "A" -> 0, "V" -> 21, "AT" -> 45, "BK" -> 62. Retorna -1 se inválida. */
  function letraParaIndice(letra) {
    const t = String(letra || '').trim().toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(t)) return -1;
    return [...t].reduce((total, c) => total * 26 + (c.charCodeAt(0) - 64), 0) - 1;
  }

  /** Valida o mapeamento de colunas (letras válidas e sem repetição). */
  function validarColunas(colunas) {
    const erros = {};
    const usadas = new Map();
    CAMPOS_OFICIAIS.forEach((campo) => {
      const letra = String(colunas[campo] || '').trim().toUpperCase();
      if (letraParaIndice(letra) < 0) erros[campo] = 'Informe a letra da coluna (ex.: V, AT).';
      else if (usadas.has(letra)) erros[campo] = `Coluna já usada em "${ROTULOS[usadas.get(letra)]}".`;
      else usadas.set(letra, campo);
    });
    return { valido: Object.keys(erros).length === 0, erros };
  }

  /** "download-SaldoDotacao-02-10-2026.csv" -> "02/10/2026" */
  function extrairDataArquivo(nome) {
    const m = String(nome || '').match(/(\d{2})[-_.](\d{2})[-_.](\d{4})/);
    return m ? `${m[1]}/${m[2]}/${m[3]}` : '';
  }

  /** Código da secretaria a partir da U.E: "020101" -> "02.01". */
  const codigoPorUe = (ue) => (/^\d{6}$/.test(ue) ? `${ue.slice(0, 2)}.${ue.slice(2, 4)}` : '');

  /**
   * Etapa 1 — lê os registros da matriz do arquivo.
   * Linhas cuja coluna de ficha não é numérica (cabeçalho, totais) são ignoradas.
   * @returns {{registros:Array, alertas:Array, cabecalho:Object}}
   */
  function lerRegistros(aoa, colunas) {
    const indices = {};
    CAMPOS_OFICIAIS.forEach((campo) => { indices[campo] = letraParaIndice(colunas[campo]); });

    const registros = [];
    const alertas = [];
    const vistos = new Set();
    let cabecalho = null;

    aoa.forEach((linha, i) => {
      if (!linha || linha.every(vazio)) return;
      const fichaBruta = String(linha[indices.ficha] ?? '').trim();
      if (!/^\d+$/.test(fichaBruta)) {
        if (!cabecalho && !registros.length) cabecalho = linha; // primeira linha de títulos
        return;
      }

      const numero = (campo) => {
        const n = paraNumero(linha[indices[campo]]);
        if (Number.isNaN(n)) {
          alertas.push({ nivel: 'aviso', mensagem: `Linha ${i + 1}, ficha ${fichaBruta}: valor inválido "${linha[indices[campo]]}" em ${ROTULOS[campo]} — considerado 0.` });
          return 0;
        }
        return arredondar(n); // "1,16E-10" (resíduo do Fiorilli) vira 0
      };

      const registro = {
        ficha: String(Number(fichaBruta)),
        ue: schema.normalizarUe(linha[indices.ue]),
        fonte: schema.normalizarFonte(linha[indices.fonte]),
        despesa: schema.normalizarDespesa(linha[indices.despesa]),
        reserva: numero('reserva'),
        saldoFicha: numero('saldoFicha'),
        linhaOrigem: i + 1
      };

      if (!/^\d{6}$/.test(registro.ue)) {
        alertas.push({ nivel: 'aviso', mensagem: `Linha ${i + 1}, ficha ${registro.ficha}: U.E inválida "${linha[indices.ue] ?? ''}". Registro ignorado.` });
        return;
      }
      if (vistos.has(registro.ficha)) {
        alertas.push({ nivel: 'aviso', mensagem: `Linha ${i + 1}: ficha ${registro.ficha} repetida no arquivo. Mantida a primeira ocorrência.` });
        return;
      }
      vistos.add(registro.ficha);
      registros.push(registro);
    });

    // Títulos encontrados em cada coluna mapeada (para o usuário conferir o mapeamento).
    const titulos = {};
    CAMPOS_OFICIAIS.forEach((campo) => {
      titulos[campo] = cabecalho ? String(cabecalho[indices[campo]] ?? '').trim() : '';
    });
    return { registros, alertas, cabecalho: titulos };
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

  /**
   * Fontes usadas atualmente na base (padrão sugerido para incluir fichas novas).
   * Base vazia -> null (= todas as fontes).
   */
  function fontesDaBase(secretarias) {
    const fontes = new Set();
    secretarias.forEach((s) => s.linhas.forEach((l) => { if (l.fonte) fontes.add(schema.normalizarFonte(l.fonte)); }));
    return fontes.size ? [...fontes] : null;
  }

  /**
   * Etapa 2 — monta o plano de atualização (nada é alterado aqui).
   * @param {Array} secretarias base atual
   * @param {Array} registros   saída de lerRegistros
   * @param {Object} opcoes     regras para fichas NOVAS
   * @param {string[]|null} opcoes.fontes  fontes a incluir (null = todas)
   * @param {boolean} opcoes.incluirPessoal  incluir despesas de pessoal (3.1.x)
   * @param {boolean} opcoes.incluirZeradas  incluir fichas com Reserva e Saldo = 0
   */
  function planejar(secretarias, registros, opcoes = {}) {
    const { fontes = null, incluirPessoal = false, incluirZeradas = false } = opcoes;
    const indice = indexarFichas(secretarias);
    const codigos = new Set(secretarias.map((s) => s.codigo));
    const plano = {
      atualizacoes: [], inclusoes: [], ignoradas: [], semSecretaria: [], ausentes: [],
      inalteradas: 0, totalRegistros: registros.length, fontesNovas: {}
    };

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
          const antes = soma(campo);
          if (Math.abs(antes - r[campo]) > TOLERANCIA) alteracoes.push({ campo, antes, depois: r[campo] });
        });
        if (alteracoes.length) plano.atualizacoes.push({ codigo: existente.codigo, ficha: r.ficha, alteracoes });
        else plano.inalteradas += 1;
        return;
      }

      const codigo = codigoPorUe(r.ue);
      if (!codigos.has(codigo)) {
        plano.semSecretaria.push({ codigo, registro: r });
        return;
      }
      plano.fontesNovas[r.fonte] = (plano.fontesNovas[r.fonte] || 0) + 1;
      const motivo = (fontes && !fontes.includes(r.fonte)) ? `fonte ${r.fonte}`
        : (!incluirPessoal && ehPessoal(r)) ? 'pessoal (3.1)'
          : (!incluirZeradas && ehZerada(r)) ? 'reserva e saldo zerados' : '';
      if (motivo) plano.ignoradas.push({ codigo, registro: r, motivo });
      else plano.inclusoes.push({ codigo, registro: r });
    });

    const noArquivo = new Set(registros.map((r) => r.ficha));
    indice.forEach((item, ficha) => {
      if (!noArquivo.has(ficha)) plano.ausentes.push({ codigo: item.codigo, ficha });
    });
    return plano;
  }

  /**
   * Etapa 3 — aplica o plano e devolve NOVAS secretarias (imutável).
   * - Fichas existentes: U.E, Fonte e Despesa atualizadas em todas as linhas da ficha;
   *   Reserva e Saldo gravados na 1ª linha (demais = 0), mantendo a soma correta.
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
          saldoFicha: primeira ? r.saldoFicha : 0
        };
      });
      return { ...s, linhas, pendentes: s.pendentes.map((l) => ({ ...l })) };
    });

    plano.inclusoes.forEach(({ codigo, registro }) => {
      const secretaria = novas.find((s) => s.codigo === codigo);
      if (!secretaria) return;
      const linha = schema.criarLinha({
        ficha: registro.ficha, ue: registro.ue, fonte: registro.fonte, despesa: registro.despesa,
        reserva: registro.reserva, saldoFicha: registro.saldoFicha,
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
    CAMPOS_OFICIAIS, ROTULOS,
    letraParaIndice, validarColunas, extrairDataArquivo, codigoPorUe, fontesDaBase,
    lerRegistros, planejar, aplicar
  });
})(window.OrcApp);
