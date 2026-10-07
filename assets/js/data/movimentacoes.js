/**
 * @file movimentacoes.js
 * @description Regras PURAS (sem DOM, sem estado global) das transferências
 * de recursos entre fichas — v1.4.
 *
 * Modelo "livro de movimentações": os valores oficiais (Fiorilli/planilha)
 * nunca são alterados. Cada transferência é um lançamento:
 *
 * Transferencia {
 *   id, data (ISO),
 *   origem:  { secretaria: '02.07', ficha: '338' },
 *   destino: { secretaria: '02.04', ficha: '512' },   // pode ser outra secretaria
 *   saldoFicha: number, reserva: number,              // valores movidos (≥ 0)
 *   instrumento: '' | 'decreto' | 'lei', motivo: string
 * }
 *
 * O saldo PROJETADO de uma ficha = oficial − saídas + entradas, aplicado na
 * linha-âncora (primeira linha da ficha — onde ficam Reserva e Saldo Ficha,
 * ver schema.js). Os cálculos usam centavos inteiros (sem erro de ponto flutuante).
 */
(function (App) {
  'use strict';

  const { arredondar, paraNumero, moeda } = App.utils.format;
  const config = App.core.config;

  /** Campos movimentáveis e seus rótulos. */
  const CAMPOS = Object.freeze(['saldoFicha', 'reserva']);
  const ROTULOS = Object.freeze({ saldoFicha: 'Saldo Ficha', reserva: 'Reserva' });

  const centavos = (valor) => Math.round((Number(valor) || 0) * 100);
  const reais = (c) => arredondar(c / 100);
  const texto = (v) => String(v === null || v === undefined ? '' : v).trim();
  const chave = (ponto) => `${texto(ponto && ponto.secretaria)}|${texto(ponto && ponto.ficha)}`;

  /**
   * Converte o valor digitado. Além do formato aceito por paraNumero, trata
   * "1.500" como mil e quinhentos (ponto de milhar sem vírgula).
   */
  function paraValor(valor) {
    if (typeof valor === 'string' && /^\s*\d{1,3}(\.\d{3})+\s*$/.test(valor)) return Number(valor.replace(/\D/g, ''));
    return paraNumero(valor);
  }

  /* ------------------------------- Situação ------------------------------- */

  /** Diferença (em centavos) até a qual disponível e Essencial são considerados iguais. */
  const TOLERANCIA_C = centavos(config.TOLERANCIA_CONFERENCIA);

  /**
   * Situação da ficha (v1.5): compara o disponível com o Essencial.
   *  - deficit:  disponível < Essencial (inclui fichas zeradas);
   *  - atende:   disponível = Essencial (± R$ 0,01);
   *  - positivo: disponível > Essencial.
   * @returns {'deficit'|'atende'|'positivo'}
   */
  function situacaoFicha({ disponivel, necessidade }) {
    const diferenca = centavos(disponivel) - centavos(necessidade);
    if (Math.abs(diferenca) <= TOLERANCIA_C) return 'atende';
    return diferenca < 0 ? 'deficit' : 'positivo';
  }

  /** Situação que pede ação (déficit). */
  const ehGrave = (situacao) => situacao === 'deficit';

  /** Uma situação é pior que outra? */
  const piora = (antes, depois) => config.SITUACOES_FICHA[depois].ordem < config.SITUACOES_FICHA[antes].ordem;

  /* ------------------------------- Fichas -------------------------------- */

  function completarResumo(resumo) {
    const disponivel = arredondar(resumo.reserva + resumo.saldoFicha);
    return { ...resumo, disponivel, situacao: situacaoFicha({ disponivel, necessidade: resumo.necessidade }) };
  }

  /**
   * Resumo por ficha de uma secretaria (na ordem da tabela).
   * Reserva/Saldo vêm da linha-âncora; a necessidade é a soma do Essencial.
   */
  function resumirFichas(secretaria) {
    const mapa = new Map();
    secretaria.linhas.forEach((l) => {
      if (!mapa.has(l.ficha)) {
        mapa.set(l.ficha, {
          secretaria: secretaria.codigo, nomeSecretaria: secretaria.nome,
          ficha: l.ficha, ue: l.ue, fonte: l.fonte, despesa: l.despesa, descricao: l.descricao,
          idAncora: l.id, reserva: Number(l.reserva) || 0, saldoFicha: Number(l.saldoFicha) || 0,
          oficial: l.oficial || null, movimentado: l.movimentado || null, necessidadeC: 0
        });
      }
      mapa.get(l.ficha).necessidadeC += centavos(l.essencial);
    });
    return [...mapa.values()].map(({ necessidadeC, ...f }) => completarResumo({ ...f, necessidade: reais(necessidadeC) }));
  }

  /** Todas as fichas de todas as secretarias. */
  const listarFichas = (secretarias) => secretarias.flatMap(resumirFichas);

  /** Resumo de uma ficha ({secretaria, ficha}) ou null. */
  function encontrarFicha(secretarias, ponto) {
    const secretaria = secretarias.find((s) => s.codigo === texto(ponto && ponto.secretaria));
    if (!secretaria) return null;
    return resumirFichas(secretaria).find((f) => f.ficha === texto(ponto.ficha)) || null;
  }

  /* ------------------------------- Projeção ------------------------------- */

  /** Variação líquida (em centavos) por ficha. */
  function variacoes(transferencias) {
    const mapa = new Map();
    const somar = (ponto, sinal, t) => {
      const k = chave(ponto);
      if (!mapa.has(k)) mapa.set(k, { saldoFicha: 0, reserva: 0 });
      const v = mapa.get(k);
      CAMPOS.forEach((c) => { v[c] += sinal * centavos(t[c]); });
    };
    transferencias.forEach((t) => { somar(t.origem, -1, t); somar(t.destino, 1, t); });
    return mapa;
  }

  /**
   * Aplica as movimentações às secretarias (cópia; os originais não mudam).
   * A linha-âncora alterada ganha `oficial` (valores Fiorilli/planilha) e
   * `movimentado` (variação líquida).
   */
  function projetar(secretarias, transferencias = []) {
    if (!transferencias.length) return secretarias;
    const mapa = variacoes(transferencias);
    return secretarias.map((s) => {
      const vistas = new Set();
      let alterou = false;
      const linhas = s.linhas.map((l) => {
        if (vistas.has(l.ficha)) return l;
        vistas.add(l.ficha);
        const v = mapa.get(chave({ secretaria: s.codigo, ficha: l.ficha }));
        if (!v || (!v.saldoFicha && !v.reserva)) return l;
        alterou = true;
        return {
          ...l,
          saldoFicha: reais(centavos(l.saldoFicha) + v.saldoFicha),
          reserva: reais(centavos(l.reserva) + v.reserva),
          oficial: { saldoFicha: l.saldoFicha, reserva: l.reserva },
          movimentado: { saldoFicha: reais(v.saldoFicha), reserva: reais(v.reserva) }
        };
      });
      return alterou ? { ...s, linhas } : s;
    });
  }

  /** Movimentações cuja origem ou destino não existe mais na base (ex.: após reimportação). */
  function listarOrfas(secretarias, transferencias) {
    const existentes = new Set(listarFichas(secretarias).map((f) => chave(f)));
    return transferencias.filter((t) => !existentes.has(chave(t.origem)) || !existentes.has(chave(t.destino)));
  }

  /** Fichas com Saldo Ficha ou Reserva projetados negativos. */
  function fichasNegativas(secretarias, transferencias) {
    const tocadas = new Set(transferencias.flatMap((t) => [chave(t.origem), chave(t.destino)]));
    return listarFichas(projetar(secretarias, transferencias))
      .filter((f) => tocadas.has(chave(f)) && (f.saldoFicha < 0 || f.reserva < 0))
      .map((f) => chave(f));
  }

  /* ------------------------- Validação e simulação ------------------------- */

  /**
   * Valida uma transferência contra os saldos PROJETADOS.
   * @param {Array} secretarias secretarias já projetadas
   * @param {Object} dados {origem, destino, saldoFicha, reserva} (valores podem ser texto)
   * @returns {Object} erros { campo: mensagem } — vazio = válido
   */
  function validar(secretarias, dados = {}) {
    const erros = {};
    const origem = encontrarFicha(secretarias, dados.origem);
    const destinoInformado = texto(dados.destino && dados.destino.ficha);
    const destino = destinoInformado ? encontrarFicha(secretarias, dados.destino) : null;

    if (!origem) erros.origem = 'Ficha de origem não encontrada.';
    if (!destinoInformado) erros.destino = 'Selecione a ficha de destino.';
    else if (!destino) erros.destino = 'Ficha de destino não encontrada.';
    else if (chave(dados.origem) === chave(dados.destino)) erros.destino = 'O destino deve ser diferente da origem.';

    const valores = {};
    CAMPOS.forEach((c) => {
      const n = paraValor(dados[c]);
      if (Number.isNaN(n)) erros[c] = 'Valor inválido. Ex.: 1.500,00';
      else if (n < 0) erros[c] = 'Informe um valor positivo.';
      else valores[c] = centavos(n);
    });
    if (erros.saldoFicha || erros.reserva) return erros;

    if (!valores.saldoFicha && !valores.reserva) {
      erros.saldoFicha = 'Informe o valor a transferir (Saldo Ficha e/ou Reserva).';
    } else if (origem) {
      CAMPOS.forEach((c) => {
        if (valores[c] > centavos(origem[c])) erros[c] = `Saldo insuficiente: a origem tem ${moeda(origem[c])} de ${ROTULOS[c]}.`;
      });
    }
    return erros;
  }

  /** Lançamento normalizado (chamar somente após validar). */
  function criar(dados) {
    const ponto = (p) => ({ secretaria: texto(p.secretaria), ficha: texto(p.ficha) });
    const valor = (v) => reais(centavos(paraValor(v)));
    return {
      id: dados.id || App.data.schema.gerarId(),
      data: dados.data || new Date().toISOString(),
      origem: ponto(dados.origem),
      destino: ponto(dados.destino),
      saldoFicha: valor(dados.saldoFicha),
      reserva: valor(dados.reserva),
      instrumento: texto(dados.instrumento),
      motivo: texto(dados.motivo)
    };
  }

  /**
   * Prévia "antes → depois" da origem e do destino.
   * Valores inválidos contam como zero (a prévia acompanha a digitação).
   */
  function simular(secretarias, dados) {
    const valor = (c) => { const n = paraValor(dados[c]); return Number.isNaN(n) || n < 0 ? 0 : centavos(n); };
    const aplicar = (resumo, sinal) => (resumo ? completarResumo({
      ...resumo,
      saldoFicha: reais(centavos(resumo.saldoFicha) + sinal * valor('saldoFicha')),
      reserva: reais(centavos(resumo.reserva) + sinal * valor('reserva'))
    }) : null);
    const origem = encontrarFicha(secretarias, dados.origem);
    const destino = texto(dados.destino && dados.destino.ficha) ? encontrarFicha(secretarias, dados.destino) : null;
    return {
      origem: { antes: origem, depois: aplicar(origem, -1) },
      destino: { antes: destino, depois: aplicar(destino, 1) }
    };
  }

  App.data.movimentacoes = Object.freeze({
    CAMPOS, ROTULOS, chave, paraValor,
    situacaoFicha, ehGrave, piora,
    resumirFichas, listarFichas, encontrarFicha,
    projetar, listarOrfas, fichasNegativas,
    validar, criar, simular
  });
})(window.OrcApp);
