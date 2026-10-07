/**
 * @file relatorioGestao.js
 * @description Regras PURAS (sem DOM, sem estado global) do relatório de
 * gerenciamento das movimentações (v1.5):
 *  - movimentações entre fichas (transferências registradas), com filtros;
 *  - resumo por secretaria (entradas, saídas e líquido);
 *  - fichas cujas Reserva/Saldo Ficha foram alterados pelas movimentações
 *    (oficial → atual), com a situação antes e depois.
 */
(function (App) {
  'use strict';

  const { arredondar } = App.utils.format;
  const mov = App.data.movimentacoes;
  const config = App.core.config;

  const centavos = (v) => Math.round((Number(v) || 0) * 100);
  const reais = (c) => arredondar(c / 100);

  /** Rótulo curto do instrumento ("Decreto", "Projeto de Lei", "A definir"). */
  function rotuloInstrumento(valor) {
    const item = config.INSTRUMENTOS_TRANSFERENCIA.find((i) => i.valor === (valor || ''));
    return (item ? item.rotulo : String(valor)).replace(/ \(.*\)$/, '');
  }

  /** ISO (UTC) -> 'AAAA-MM-DD' no fuso do navegador (o mesmo dos campos de data). */
  function diaLocal(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const dois = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  }

  /**
   * A movimentação atende ao filtro?
   * @param {Object} filtro { inicio?:'AAAA-MM-DD', fim?:'AAAA-MM-DD', secretaria?:'02.07' }
   */
  function atendeFiltro(t, filtro = {}) {
    const dia = diaLocal(t.data);
    if (filtro.inicio && dia < filtro.inicio) return false;
    if (filtro.fim && dia > filtro.fim) return false;
    if (filtro.secretaria && t.origem.secretaria !== filtro.secretaria && t.destino.secretaria !== filtro.secretaria) return false;
    return true;
  }

  /**
   * Movimentações filtradas, em ordem cronológica, com nomes e situação de existência.
   * @param {Array} transferencias livro de movimentações
   * @param {Array} secretarias base OFICIAL (para nomes e fichas existentes)
   */
  function listarMovimentacoes(transferencias, secretarias, filtro = {}) {
    const nomes = new Map(secretarias.map((s) => [s.codigo, s.nome]));
    const orfas = new Set(mov.listarOrfas(secretarias, transferencias).map((t) => t.id));
    return transferencias
      .filter((t) => atendeFiltro(t, filtro))
      .sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .map((t) => ({
        id: t.id,
        data: t.data,
        origem: { ...t.origem, nome: nomes.get(t.origem.secretaria) || '' },
        destino: { ...t.destino, nome: nomes.get(t.destino.secretaria) || '' },
        saldoFicha: t.saldoFicha,
        reserva: t.reserva,
        total: reais(centavos(t.saldoFicha) + centavos(t.reserva)),
        instrumento: rotuloInstrumento(t.instrumento),
        motivo: t.motivo,
        orfa: orfas.has(t.id)
      }));
  }

  /** Totais movidos (Saldo Ficha, Reserva e soma). */
  function totaisMovimentacoes(lista) {
    const c = lista.reduce((t, m) => ({ saldoFicha: t.saldoFicha + centavos(m.saldoFicha), reserva: t.reserva + centavos(m.reserva) }), { saldoFicha: 0, reserva: 0 });
    return { quantidade: lista.length, saldoFicha: reais(c.saldoFicha), reserva: reais(c.reserva), total: reais(c.saldoFicha + c.reserva) };
  }

  /**
   * Entradas e saídas por secretaria. Movimentação dentro da mesma secretaria
   * conta como entrada e saída (líquido zero) — é remanejamento interno.
   * @param {string} [somente] limita o resultado a uma secretaria
   */
  function resumoPorSecretaria(lista, secretarias, somente = '') {
    const mapa = new Map();
    const item = (codigo, nome) => {
      if (!mapa.has(codigo)) mapa.set(codigo, { codigo, nome, entradasC: 0, saidasC: 0, quantidade: 0 });
      return mapa.get(codigo);
    };
    lista.forEach((m) => {
      const valor = centavos(m.total);
      const origem = item(m.origem.secretaria, m.origem.nome);
      origem.saidasC += valor;
      origem.quantidade += 1;
      const destino = item(m.destino.secretaria, m.destino.nome);
      destino.entradasC += valor;
      if (destino !== origem) destino.quantidade += 1;
    });
    const ordem = new Map(secretarias.map((s, i) => [s.codigo, i]));
    return [...mapa.values()]
      .filter((s) => !somente || s.codigo === somente)
      .sort((a, b) => (ordem.get(a.codigo) ?? 999) - (ordem.get(b.codigo) ?? 999))
      .map(({ entradasC, saidasC, ...s }) => ({ ...s, entradas: reais(entradasC), saidas: reais(saidasC), liquido: reais(entradasC - saidasC) }));
  }

  /**
   * Fichas com Reserva e/ou Saldo Ficha alterados pelas movimentações:
   * valores oficiais (Fiorilli/planilha), variação líquida e valores atuais (projetados),
   * com a situação antes e depois.
   * @param {Array} secretarias base OFICIAL
   * @param {Array} transferencias TODAS as movimentações (o saldo atual depende de todas)
   * @param {string} [somente] limita a uma secretaria
   */
  function fichasAlteradas(secretarias, transferencias, somente = '') {
    if (!transferencias.length) return [];
    const oficiais = new Map(mov.listarFichas(secretarias).map((f) => [mov.chave(f), f]));
    return mov.listarFichas(mov.projetar(secretarias, transferencias))
      .filter((f) => f.movimentado && (!somente || f.secretaria === somente))
      .map((f) => {
        const antes = oficiais.get(mov.chave(f));
        return {
          secretaria: f.secretaria, nomeSecretaria: f.nomeSecretaria, ficha: f.ficha, despesa: f.despesa, descricao: f.descricao,
          reservaOficial: antes.reserva, reservaVariacao: f.movimentado.reserva, reserva: f.reserva,
          saldoOficial: antes.saldoFicha, saldoVariacao: f.movimentado.saldoFicha, saldoFicha: f.saldoFicha,
          necessidade: f.necessidade,
          situacaoAntes: antes.situacao, situacao: f.situacao
        };
      });
  }

  App.data.relatorioGestao = Object.freeze({
    rotuloInstrumento, diaLocal, atendeFiltro, listarMovimentacoes, totaisMovimentacoes, resumoPorSecretaria, fichasAlteradas
  });
})(window.OrcApp);
