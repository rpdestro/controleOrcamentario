/**
 * @file schema.js
 * @description Modelo de dados (fábricas + normalização).
 *
 * Secretaria {
 *   codigo: '02.01', nome: string, folha: number (valor positivo),
 *   atualizadoEm: string, linhas: Linha[], pendentes: Linha[],
 *   referencia: { essencial, reserva, saldoFicha, total, folhaGeral } | null
 * }
 *
 * Linha { id, ficha, ue, fonte, despesa, descricao, observacao,
 *         periodoInicio ('AAAA-MM'), periodoFim ('AAAA-MM'), anotacao,
 *         essencial, antes, reserva, saldoFicha }
 * (A coluna "Cortes" da planilha é ignorada.)
 *
 * Regras de negócio:
 *  - Uma mesma FICHA pode ocupar várias linhas (itens do Essencial).
 *    Reserva/Saldo ficha ficam somente na primeira linha da ficha;
 *    as demais ficam em 0. Assim, os totais são somas simples (= SUBTOTAL do Excel).
 *  - "observacao" guarda o rótulo canônico do período (ex.: "Out/2026 a Dez/2026").
 *    Textos antigos são convertidos; os não reconhecidos ficam como estão
 *    (período "não padronizado") até o usuário revisar.
 */
(function (App) {
  'use strict';

  const { paraNumero, arredondar } = App.utils.format;
  const periodo = App.utils.periodo;
  const { CAMPOS_NUMERICOS } = App.core.config;

  let contador = 0;
  let referenciaAtual = periodo.referenciaDe(''); // mês base para interpretar períodos

  /** Define o mês de referência (data da base) usado na conversão de períodos. */
  function definirReferencia(ref) {
    if (ref && ref.ano && ref.mes) referenciaAtual = { ano: ref.ano, mes: ref.mes };
  }
  const obterReferencia = () => ({ ...referenciaAtual });

  /** Gera identificador único (crypto quando disponível). */
  function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    contador += 1;
    return `id-${Date.now().toString(36)}-${contador}`;
  }

  const texto = (v) => String(v === null || v === undefined ? '' : v).trim();
  const digitos = (v) => texto(v).replace(/\D/g, '');

  /** U.E numérica perde o zero à esquerda no Excel (20101 -> "020101"). */
  function normalizarUe(valor) {
    const t = texto(valor);
    const d = digitos(t);
    if (/^\d{5}$/.test(d) && d === t) return `0${d}`;
    if (/^\d{6}$/.test(d)) return d; // "02.01.01" -> "020101"
    return t;
  }

  /** Fonte de recurso: "01" (Fiorilli) e "1" (planilha) representam a mesma fonte. */
  function normalizarFonte(valor) {
    const t = texto(valor);
    return /^\d+$/.test(t) ? String(Number(t)) : t;
  }

  /**
   * Código de despesa no padrão da planilha (4 níveis: 3.3.90.30).
   * "3.3.90.39.00" (Fiorilli, com desdobro) -> "3.3.90.39"; "33903900" -> "3.3.90.39".
   * Códigos fora do padrão são mantidos como vieram.
   */
  function normalizarDespesa(valor) {
    const t = texto(valor);
    const d = digitos(t);
    if (d.length < 6 || !/^[\d.\s]+$/.test(t)) return t;
    return `${d[0]}.${d[1]}.${d.slice(2, 4)}.${d.slice(4, 6)}`;
  }

  /** Chave de comparação de despesas (6 primeiros dígitos). */
  const chaveDespesa = (valor) => digitos(valor).slice(0, 6);

  /** Acrescenta um texto às anotações sem duplicar. */
  function anexarAnotacao(anotacao, extra) {
    if (!extra || anotacao.includes(extra)) return anotacao;
    return anotacao ? `${anotacao} | ${extra}` : extra;
  }

  /**
   * Resolve período e anotações:
   *  1. campos estruturados (periodoInicio/Fim) têm prioridade;
   *  2. senão, o texto da observação é interpretado. Se tiver conteúdo além
   *     dos meses, o texto ORIGINAL vai para "anotacao" (nada se perde);
   *  3. texto sem mês reconhecível permanece como "não padronizado".
   */
  function resolverPeriodo(parcial, ref) {
    const anotacao = texto(parcial.anotacao);
    const inicio = texto(parcial.periodoInicio);
    let fim = texto(parcial.periodoFim);
    if (periodo.valido(inicio)) {
      if (!periodo.valido(fim) || fim < inicio) fim = inicio;
      return { periodoInicio: inicio, periodoFim: fim, observacao: periodo.rotulo(inicio, fim), anotacao };
    }
    const observacao = texto(parcial.observacao);
    const extraido = periodo.extrair(observacao, ref);
    if (extraido) {
      return {
        periodoInicio: extraido.inicio,
        periodoFim: extraido.fim,
        observacao: periodo.rotulo(extraido.inicio, extraido.fim),
        anotacao: extraido.exato ? anotacao : anexarAnotacao(anotacao, observacao)
      };
    }
    return { periodoInicio: '', periodoFim: '', observacao, anotacao };
  }

  /**
   * Cria uma linha normalizada a partir de dados parciais.
   * Valores numéricos inválidos viram 0 (a validação deve ocorrer antes).
   * @param {Object} parcial
   * @param {{ano:number, mes:number}} [ref] mês de referência para períodos
   */
  function criarLinha(parcial = {}, ref = referenciaAtual) {
    const linha = {
      id: parcial.id || gerarId(),
      ficha: texto(parcial.ficha),
      ue: normalizarUe(parcial.ue),
      fonte: normalizarFonte(parcial.fonte),
      despesa: texto(parcial.despesa),
      descricao: texto(parcial.descricao),
      ...resolverPeriodo(parcial, ref)
    };
    CAMPOS_NUMERICOS.forEach((campo) => {
      const n = paraNumero(parcial[campo]);
      linha[campo] = Number.isNaN(n) ? 0 : arredondar(n);
    });
    return linha;
  }

  /** Cria uma secretaria normalizada. */
  function criarSecretaria(parcial = {}, ref = referenciaAtual) {
    const folha = paraNumero(parcial.folha);
    return {
      codigo: texto(parcial.codigo),
      nome: texto(parcial.nome),
      folha: Number.isNaN(folha) ? 0 : Math.abs(arredondar(folha)),
      atualizadoEm: texto(parcial.atualizadoEm),
      linhas: (parcial.linhas || []).map((l) => criarLinha(l, ref)),
      pendentes: (parcial.pendentes || []).map((l) => criarLinha(l, ref)),
      referencia: parcial.referencia || null
    };
  }

  /** Ordena secretarias pelo código (02.01, 02.02, ...). */
  function ordenarSecretarias(lista) {
    return [...lista].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  }

  App.data.schema = Object.freeze({
    gerarId, criarLinha, criarSecretaria, ordenarSecretarias,
    normalizarUe, normalizarFonte, normalizarDespesa, chaveDespesa,
    definirReferencia, obterReferencia, anexarAnotacao
  });
})(window.OrcApp);
