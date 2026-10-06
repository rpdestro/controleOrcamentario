/**
 * @file calculos.js
 * @description Regras de negócio PURAS (sem DOM, sem estado global).
 *
 * Fórmula do resultado (idêntica à aba GERAL da planilha):
 *   RESULTADO = Reserva + Saldo Ficha − Essencial − Folha
 * A coluna "Cortes" da planilha é ignorada (não é lida, somada nem exportada).
 */
(function (App) {
  'use strict';

  const { arredondar, normalizarTexto, moeda } = App.utils.format;
  const { TOLERANCIA_CONFERENCIA } = App.core.config;
  const periodo = App.utils.periodo;

  const CAMPOS_SOMA = Object.freeze(['essencial', 'antes', 'reserva', 'saldoFicha']);

  /** Soma os campos numéricos de um conjunto de linhas. */
  function somarLinhas(linhas) {
    const soma = { essencial: 0, antes: 0, reserva: 0, saldoFicha: 0 };
    linhas.forEach((linha) => CAMPOS_SOMA.forEach((c) => { soma[c] += Number(linha[c]) || 0; }));
    CAMPOS_SOMA.forEach((c) => { soma[c] = arredondar(soma[c]); });
    return soma;
  }

  /**
   * Filtra linhas por período e por texto livre.
   * `filtro.periodo` aceita uma competência 'AAAA-MM' (linhas cujo intervalo
   * inclui o mês), 'nao-padronizado' ou 'sem-periodo' (ver utils/periodo.js).
   * @param {Array} linhas
   * @param {{periodo?:string, busca?:string}} filtro
   */
  function filtrarLinhas(linhas, filtro = {}) {
    const busca = normalizarTexto(filtro.busca);

    return linhas.filter((linha) => {
      if (filtro.periodo && !periodo.atendeFiltro(linha, filtro.periodo)) return false;
      if (!busca) return true;
      const alvo = normalizarTexto([linha.ficha, linha.ue, linha.fonte, linha.despesa, linha.descricao, linha.observacao, linha.anotacao].join(' '));
      return alvo.includes(busca);
    });
  }

  /**
   * Indica se algum filtro está ativo.
   * `filtro.colunasAtivas` sinaliza filtros de coluna (estilo Excel) aplicados pela tela.
   */
  function filtroAtivo(filtro = {}) {
    return Boolean(normalizarTexto(filtro.periodo) || normalizarTexto(filtro.busca) || filtro.colunasAtivas);
  }

  /**
   * Totais de uma secretaria.
   * Com filtro ativo, a Folha (valor global da secretaria) não é considerada,
   * pois não pertence a um período/linha específico.
   */
  function totaisSecretaria(secretaria, filtro = {}) {
    const linhas = filtrarLinhas(secretaria.linhas, filtro);
    const soma = somarLinhas(linhas);
    const folha = filtroAtivo(filtro) ? 0 : Number(secretaria.folha) || 0;

    return {
      ...soma,
      folha: arredondar(folha),
      resultado: arredondar(soma.reserva + soma.saldoFicha - soma.essencial - folha),
      qtdLinhas: linhas.length,
      qtdFichas: new Set(linhas.map((l) => l.ficha)).size
    };
  }

  /** Totais consolidados de todas as secretarias + detalhamento. */
  function totaisGerais(secretarias, filtro = {}) {
    const porSecretaria = secretarias.map((s) => ({
      codigo: s.codigo,
      nome: s.nome,
      ...totaisSecretaria(s, filtro)
    }));

    const geral = { essencial: 0, antes: 0, reserva: 0, saldoFicha: 0, folha: 0, resultado: 0, qtdLinhas: 0, qtdFichas: 0 };
    porSecretaria.forEach((t) => Object.keys(geral).forEach((c) => { geral[c] += t[c]; }));
    Object.keys(geral).forEach((c) => { geral[c] = arredondar(geral[c]); });

    return { geral, porSecretaria };
  }

  /**
   * Agrupa linhas por ficha (visão orçamentária consolidada).
   * Mantém a ordem de primeira aparição da ficha.
   */
  function agruparPorFicha(linhas) {
    const mapa = new Map();
    linhas.forEach((linha) => {
      if (!mapa.has(linha.ficha)) {
        mapa.set(linha.ficha, { ficha: linha.ficha, ue: linha.ue, fonte: linha.fonte, despesa: linha.despesa, itens: [] });
      }
      mapa.get(linha.ficha).itens.push(linha);
    });
    return [...mapa.values()].map((grupo) => ({ ...grupo, ...somarLinhas(grupo.itens), qtdItens: grupo.itens.length }));
  }

  /**
   * Opções do filtro de período: competências (meses) cobertas pelas linhas,
   * seguidas de "Não padronizado" e "Sem período" quando existirem.
   * @returns {Array<{valor:string, rotulo:string}>}
   */
  function listarPeriodos(secretarias) {
    const meses = new Set();
    let naoPadronizado = false;
    let semPeriodo = false;
    secretarias.forEach((s) => s.linhas.forEach((l) => {
      if (periodo.valido(l.periodoInicio)) periodo.expandir(l.periodoInicio, l.periodoFim).forEach((m) => meses.add(m));
      else if (l.observacao) naoPadronizado = true;
      else semPeriodo = true;
    }));
    const opcoes = [...meses].sort().map((m) => ({ valor: m, rotulo: periodo.rotuloMes(m) }));
    if (naoPadronizado) opcoes.push({ valor: periodo.FILTRO_NAO_PADRONIZADO, rotulo: '⚠ Não padronizado' });
    if (semPeriodo) opcoes.push({ valor: periodo.FILTRO_SEM_PERIODO, rotulo: 'Sem período' });
    return opcoes;
  }

  /** Quantidade de linhas com período em texto livre (a revisar). */
  function contarNaoPadronizados(secretarias) {
    return secretarias.reduce((t, s) => t + s.linhas.filter((l) => l.observacao && !periodo.valido(l.periodoInicio)).length, 0);
  }

  /**
   * Essencial agrupado por período. Períodos padronizados vêm primeiro,
   * em ordem cronológica; depois os não padronizados e "sem período".
   */
  function agruparPorPeriodo(secretarias) {
    const mapa = new Map();
    secretarias.forEach((s) => s.linhas.forEach((l) => {
      const padronizado = periodo.valido(l.periodoInicio);
      const rotulo = padronizado ? l.observacao : (l.observacao ? `${l.observacao} (não padronizado)` : 'Sem período informado');
      const ordem = padronizado ? `0|${l.periodoInicio}|${l.periodoFim}` : (l.observacao ? '1|' : '2|');
      const chave = normalizarTexto(rotulo);
      if (!mapa.has(chave)) mapa.set(chave, { periodo: rotulo, essencial: 0, qtdLinhas: 0, ordem });
      const item = mapa.get(chave);
      item.essencial = arredondar(item.essencial + l.essencial);
      item.qtdLinhas += 1;
    }));
    return [...mapa.values()]
      .sort((a, b) => (a.ordem === b.ordem ? b.essencial - a.essencial : a.ordem.localeCompare(b.ordem)))
      .map(({ ordem, ...item }) => item);
  }

  /**
   * Essencial distribuído por competência de INÍCIO (fluxo de demandas por mês).
   * @returns {Array<{mes:string, rotulo:string, essencial:number, qtdLinhas:number}>}
   */
  function essencialPorMesInicial(secretarias) {
    const mapa = new Map();
    secretarias.forEach((s) => s.linhas.forEach((l) => {
      if (!periodo.valido(l.periodoInicio) || !l.essencial) return;
      if (!mapa.has(l.periodoInicio)) mapa.set(l.periodoInicio, { mes: l.periodoInicio, rotulo: periodo.rotuloMes(l.periodoInicio), essencial: 0, qtdLinhas: 0 });
      const item = mapa.get(l.periodoInicio);
      item.essencial = arredondar(item.essencial + l.essencial);
      item.qtdLinhas += 1;
    }));
    return [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  /**
   * Consulta se uma demanda consta na planilha (gera o despacho padrão).
   * @returns {{situacao:'consta'|'valorMenor'|'naoConsta', linhas:Array, essencialPlanilha:number}}
   */
  function consultarDemanda(secretaria, { ficha, despesa, valor }) {
    const fichaN = normalizarTexto(ficha);
    // Despesa comparada pelos 6 primeiros dígitos: "3.3.90.39" = "3.3.90.39.00".
    const despesaN = App.data.schema.chaveDespesa(despesa);
    const linhas = secretaria.linhas.filter((l) =>
      (!fichaN || normalizarTexto(l.ficha) === fichaN) &&
      (!despesaN || App.data.schema.chaveDespesa(l.despesa) === despesaN));

    if (linhas.length === 0 || (!fichaN && !despesaN)) {
      return { situacao: 'naoConsta', linhas: [], essencialPlanilha: 0 };
    }
    const essencialPlanilha = somarLinhas(linhas).essencial;
    const situacao = essencialPlanilha + TOLERANCIA_CONFERENCIA >= Number(valor) ? 'consta' : 'valorMenor';
    return { situacao, linhas, essencialPlanilha };
  }

  /**
   * Confere os totais calculados com os totais gravados na planilha de origem
   * (subtotal da aba e linha da aba GERAL). Retorna alertas de divergência.
   */
  function conferirSecretaria(secretaria) {
    const alertas = [];
    const calculado = totaisSecretaria(secretaria);
    const ref = secretaria.referencia;
    const rotulo = `${secretaria.codigo} – ${secretaria.nome}`;
    const diverge = (a, b) => Math.abs(arredondar(a) - arredondar(b)) > TOLERANCIA_CONFERENCIA;

    if (secretaria.linhas.length > 0 && !secretaria.folha) {
      alertas.push({ nivel: 'aviso', codigo: secretaria.codigo, mensagem: `${rotulo}: valor da Folha não informado.` });
    }
    if (!ref) return alertas;

    [['essencial', 'Essencial'], ['reserva', 'Reserva'], ['saldoFicha', 'Saldo ficha']].forEach(([campo, nome]) => {
      if (typeof ref[campo] === 'number' && diverge(ref[campo], calculado[campo])) {
        alertas.push({ nivel: 'erro', codigo: secretaria.codigo, mensagem: `${rotulo}: ${nome} da planilha (${moeda(ref[campo])}) difere do calculado (${moeda(calculado[campo])}).` });
      }
    });
    if (typeof ref.folhaGeral === 'number' && diverge(ref.folhaGeral, secretaria.folha)) {
      alertas.push({
        nivel: 'erro',
        codigo: secretaria.codigo,
        mensagem: `${rotulo}: a aba GERAL considera Folha de ${moeda(ref.folhaGeral)}, mas a aba da secretaria informa ${moeda(secretaria.folha)}. Verifique a fórmula da aba GERAL.`
      });
    }
    return alertas;
  }

  App.data.calculos = Object.freeze({
    somarLinhas, filtrarLinhas, filtroAtivo, totaisSecretaria, totaisGerais,
    agruparPorFicha, listarPeriodos, contarNaoPadronizados, agruparPorPeriodo, essencialPorMesInicial,
    consultarDemanda, conferirSecretaria
  });
})(window.OrcApp);
