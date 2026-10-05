/**
 * @file periodo.js
 * @description Padrão de "Observação (Período)" — funções PURAS.
 *
 * PADRÃO ADOTADO (v1.1): todo período é um intervalo de COMPETÊNCIAS mensais
 *   periodoInicio = 'AAAA-MM'  e  periodoFim = 'AAAA-MM'
 * exibido/gravado no Excel como rótulo canônico:
 *   - um mês ........ "Out/2026"
 *   - intervalo ..... "Out/2026 a Dez/2026"
 *
 * Textos livres da planilha antiga são convertidos automaticamente:
 *   "outubro"                       -> Out/2026
 *   "a partir de outubro"           -> Out/2026 a Dez/2026 (até o fim do exercício)
 *   "outubro e novembro"            -> Out/2026 a Nov/2026
 *   "novembro, dezembro e janeiro"  -> Nov/2026 a Jan/2027 (virada de ano)
 *   "outubro a dezembro"            -> Out/2026 a Dez/2026
 *   "imediato"                      -> mês de referência da base
 * Textos com meses + informação extra (ex.: "a partir de outubro + décimo terceiro",
 * "PL 16 a partir de agosto - transferir ...") têm o período convertido e o texto
 * ORIGINAL preservado no campo "Anotações" (nada se perde).
 * Textos sem nenhum mês (ex.: "aguardando ata", "outubto") ficam como
 * "não padronizados" para revisão do usuário.
 */
(function (App) {
  'use strict';

  const { normalizarTexto } = App.utils.format;

  const NOMES = Object.freeze(['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']);
  const ABREV = Object.freeze(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']);
  const ABREV_N = ABREV.map((a) => a.toLowerCase());

  /** Valores especiais usados nos filtros. */
  const FILTRO_NAO_PADRONIZADO = 'nao-padronizado';
  const FILTRO_SEM_PERIODO = 'sem-periodo';

  const PADRAO_CHAVE = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const valido = (chave) => PADRAO_CHAVE.test(String(chave || ''));
  const chave = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}`;
  const partes = (c) => { const m = String(c).match(PADRAO_CHAVE); return m ? { ano: Number(m[1]), mes: Number(m[2]) } : null; };

  /** 'AAAA-MM' -> "Out/2026" */
  function rotuloMes(c) {
    const p = partes(c);
    return p ? `${ABREV[p.mes - 1]}/${p.ano}` : '';
  }

  /** Rótulo canônico de um intervalo. */
  function rotulo(inicio, fim) {
    if (!valido(inicio)) return '';
    if (!valido(fim) || fim === inicio) return rotuloMes(inicio);
    return `${rotuloMes(inicio)} a ${rotuloMes(fim)}`;
  }

  /** Referência (ano/mês base) a partir de "dd/mm/aaaa"; padrão = hoje. */
  function referenciaDe(dataBR) {
    const m = String(dataBR || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return { ano: Number(m[3]), mes: Number(m[2]) };
    const hoje = new Date();
    return { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
  }

  const REGEX_MES = /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b(?:\s*(?:\/|de)\s*(\d{4}))?/g;
  const CONECTORES = /\b(a partir de|a partir|de|e|a|ate|ao)\b|[,/\-–]/g;

  const indiceMes = (nome) => {
    const i = NOMES.indexOf(nome);
    return (i >= 0 ? i : ABREV_N.indexOf(nome)) + 1;
  };

  /**
   * Extrai o período de um texto livre, informando se havia conteúdo extra.
   * Ex.: "a partir de outubro + décimo terceiro" -> { Out..Dez, exato: false }
   * @returns {{inicio:string, fim:string, exato:boolean}|null} null = nenhum mês encontrado
   */
  function extrair(texto, ref) {
    const t = normalizarTexto(texto);
    if (!t) return null;
    if (t === 'imediato' || t === 'imediata') {
      const c = chave(ref.ano, ref.mes);
      return { inicio: c, fim: c, exato: true };
    }

    const meses = [];
    let m;
    REGEX_MES.lastIndex = 0;
    while ((m = REGEX_MES.exec(t)) !== null) meses.push({ mes: indiceMes(m[1]), ano: m[2] ? Number(m[2]) : null });
    if (!meses.length) return null;

    // Sobras além de meses e conectores = informação extra (anotação).
    const exato = !t.replace(REGEX_MES, ' ').replace(CONECTORES, ' ').trim();

    // Define o ano de cada mês: o 1º pelo mês de referência; os seguintes viram o ano quando o mês "volta".
    let ano = meses[0].ano;
    if (!ano) {
      const diferenca = ref.mes - meses[0].mes;
      ano = ref.ano + (diferenca > 6 ? 1 : diferenca < -6 ? -1 : 0);
    }
    const chaves = [];
    meses.forEach((item, i) => {
      if (i > 0) {
        if (item.ano) ano = item.ano;
        else if (item.mes < meses[i - 1].mes) ano += 1;
      }
      chaves.push(chave(item.ano || ano, item.mes));
    });

    const inicio = chaves[0];
    let fim = chaves[chaves.length - 1];
    if (/a partir/.test(t) && chaves.length === 1) fim = chave(partes(inicio).ano, 12); // até o fim do exercício
    if (fim < inicio) return null;
    return { inicio, fim, exato };
  }

  /**
   * Converte texto que seja SOMENTE período (canônico ou livre) em { inicio, fim }.
   * @param {string} texto
   * @param {{ano:number, mes:number}} ref mês de referência da base
   * @returns {{inicio:string, fim:string}|null} null = não reconhecido ou com conteúdo extra
   */
  function interpretar(texto, ref) {
    const r = extrair(texto, ref);
    return r && r.exato ? { inicio: r.inicio, fim: r.fim } : null;
  }

  /** Lista de competências para seleção: Jan do ano base até Dez do ano seguinte. */
  function listarMeses(ref) {
    const lista = [];
    [ref.ano, ref.ano + 1].forEach((ano) => {
      for (let mes = 1; mes <= 12; mes += 1) lista.push({ valor: chave(ano, mes), rotulo: `${ABREV[mes - 1]}/${ano}` });
    });
    return lista;
  }

  /** Indica se a linha atende ao filtro de período selecionado. */
  function atendeFiltro(linha, filtro) {
    if (!filtro) return true;
    if (filtro === FILTRO_NAO_PADRONIZADO) return Boolean(linha.observacao) && !valido(linha.periodoInicio);
    if (filtro === FILTRO_SEM_PERIODO) return !linha.observacao;
    if (valido(filtro)) return valido(linha.periodoInicio) && linha.periodoInicio <= filtro && filtro <= (linha.periodoFim || linha.periodoInicio);
    return normalizarTexto(linha.observacao) === normalizarTexto(filtro); // compatibilidade
  }

  /** Rótulo legível de um valor de filtro. */
  function rotuloFiltro(filtro) {
    if (filtro === FILTRO_NAO_PADRONIZADO) return 'Não padronizado';
    if (filtro === FILTRO_SEM_PERIODO) return 'Sem período';
    return valido(filtro) ? `Competência ${rotuloMes(filtro)}` : filtro;
  }

  /** Meses entre início e fim (inclusive). */
  function expandir(inicio, fim) {
    const resultado = [];
    let p = partes(inicio);
    const f = partes(fim || inicio);
    if (!p || !f) return resultado;
    while (p.ano < f.ano || (p.ano === f.ano && p.mes <= f.mes)) {
      resultado.push(chave(p.ano, p.mes));
      p = p.mes === 12 ? { ano: p.ano + 1, mes: 1 } : { ano: p.ano, mes: p.mes + 1 };
      if (resultado.length > 60) break; // proteção contra intervalos absurdos
    }
    return resultado;
  }

  App.utils.periodo = Object.freeze({
    FILTRO_NAO_PADRONIZADO, FILTRO_SEM_PERIODO,
    valido, chave, rotulo, rotuloMes, referenciaDe, extrair, interpretar, listarMeses, atendeFiltro, rotuloFiltro, expandir
  });
})(window.OrcApp);
