/**
 * @file filtroTabela.js
 * @description Lógica PURA dos filtros de coluna no padrão Excel
 * (AutoFiltro: lista de valores com caixas de seleção + classificação).
 *
 * Estado de filtro de uma tabela:
 *   {
 *     selecoes: { [idColuna]: string[] },   // valores marcados (ausente = sem filtro)
 *     ordem: { coluna: idColuna, direcao: 'asc'|'desc' } | null
 *   }
 *
 * Colunas (as mesmas da tabela) podem definir:
 *   - id / chave ........ identificador
 *   - filtravel ......... true para exibir o botão de filtro
 *   - valorFiltro(l) .... texto exibido na lista (padrão: valor formatado)
 *   - valorOrdem(l) ..... valor usado na classificação (padrão: valor bruto)
 */
(function (App) {
  'use strict';

  const { moeda } = App.utils.format;
  const VAZIAS = '(Vazias)';
  const comparador = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

  const criarEstado = () => ({ selecoes: {}, ordem: null });
  const idColuna = (coluna) => coluna.id || coluna.chave;

  /** Texto da célula usado na lista de valores do filtro. */
  function textoFiltro(coluna, linha) {
    if (coluna.valorFiltro) return coluna.valorFiltro(linha) || VAZIAS;
    const valor = linha[coluna.chave];
    if (coluna.moeda) return moeda(valor);
    const texto = String(valor ?? '').trim();
    return texto || VAZIAS;
  }

  /** Valor usado na classificação. */
  function valorOrdem(coluna, linha) {
    if (coluna.valorOrdem) return coluna.valorOrdem(linha);
    return linha[coluna.chave];
  }

  /** Há algum filtro de coluna ativo? */
  const temFiltro = (estado) => Object.keys(estado.selecoes).length > 0;

  /**
   * Aplica filtros e classificação.
   * @param {Array} linhas
   * @param {Array} colunas
   * @param {Object} estado
   * @param {string} [ignorar] id de coluna a ignorar (para montar a lista dela, como no Excel)
   */
  function aplicar(linhas, colunas, estado, ignorar) {
    const filtrantes = colunas.filter((c) => {
      const id = idColuna(c);
      return id !== ignorar && Array.isArray(estado.selecoes[id]);
    });
    let resultado = linhas.filter((linha) => filtrantes.every((c) => estado.selecoes[idColuna(c)].includes(textoFiltro(c, linha))));

    if (estado.ordem && ignorar === undefined) {
      const coluna = colunas.find((c) => idColuna(c) === estado.ordem.coluna);
      if (coluna) {
        const fator = estado.ordem.direcao === 'desc' ? -1 : 1;
        // Ordenação estável: em empate, preserva a ordem original.
        resultado = resultado
          .map((linha, i) => ({ linha, i }))
          .sort((a, b) => {
            const va = valorOrdem(coluna, a.linha);
            const vb = valorOrdem(coluna, b.linha);
            const ambosNumeros = typeof va === 'number' && typeof vb === 'number';
            const cmp = ambosNumeros ? va - vb : comparador.compare(String(va ?? ''), String(vb ?? ''));
            return cmp * fator || a.i - b.i;
          })
          .map((x) => x.linha);
      }
    }
    return resultado;
  }

  /**
   * Valores distintos de uma coluna considerando os DEMAIS filtros (comportamento do Excel).
   * Ordenados numericamente quando a coluna é numérica; "(Vazias)" por último.
   */
  function valoresDistintos(linhas, colunas, estado, coluna) {
    const visiveis = aplicar(linhas, colunas, estado, idColuna(coluna));
    const mapa = new Map();
    visiveis.forEach((linha) => {
      const texto = textoFiltro(coluna, linha);
      if (!mapa.has(texto)) mapa.set(texto, valorOrdem(coluna, linha));
    });
    return [...mapa.entries()]
      .sort(([ta, va], [tb, vb]) => {
        if (ta === VAZIAS) return 1;
        if (tb === VAZIAS) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return va - vb;
        return comparador.compare(ta, tb);
      })
      .map(([texto]) => texto);
  }

  /** Define a seleção de uma coluna; todos marcados = remove o filtro. */
  function definirSelecao(estado, id, selecionados, todos) {
    const selecoes = { ...estado.selecoes };
    if (!selecionados || selecionados.length === todos.length) delete selecoes[id];
    else selecoes[id] = [...selecionados];
    return { ...estado, selecoes };
  }

  function limparColuna(estado, id) {
    const selecoes = { ...estado.selecoes };
    delete selecoes[id];
    return { ...estado, selecoes };
  }

  const definirOrdem = (estado, id, direcao) => ({ ...estado, ordem: { coluna: id, direcao } });

  App.utils.filtroTabela = Object.freeze({
    VAZIAS, criarEstado, idColuna, textoFiltro, temFiltro, aplicar, valoresDistintos,
    definirSelecao, limparColuna, definirOrdem
  });
})(window.OrcApp);
