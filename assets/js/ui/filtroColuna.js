/**
 * @file filtroColuna.js
 * @description Popover de filtro de coluna no padrão Excel:
 *   - Classificar de A a Z / de Z a A (ou menor → maior em números);
 *   - Pesquisar valores; "(Selecionar tudo)" com estado intermediário;
 *   - Lista de valores com caixas de seleção; OK / Cancelar / Limpar filtro.
 * Fecha com Esc ou clique fora e devolve o foco ao botão da coluna.
 * A lógica de filtragem fica em utils/filtroTabela.js (pura e testada).
 */
(function (App) {
  'use strict';

  const { criar } = App.utils.dom;
  const filtro = App.utils.filtroTabela;

  let aberto = null;

  function fechar() {
    if (!aberto) return;
    aberto.elemento.remove();
    document.removeEventListener('mousedown', aberto.aoClicarFora, true);
    document.removeEventListener('keydown', aberto.aoTeclar, true);
    window.removeEventListener('resize', fechar);
    const ancora = aberto.ancora;
    aberto = null;
    if (ancora && ancora.isConnected) ancora.focus();
  }

  /** Posiciona o popover abaixo do botão, sem ultrapassar a largura da tela. */
  function posicionar(elemento, ancora) {
    const r = ancora.getBoundingClientRect();
    const largura = elemento.offsetWidth;
    const esquerda = Math.min(Math.max(8, r.left), window.innerWidth - largura - 8);
    elemento.style.top = `${r.bottom + window.scrollY + 4}px`;
    elemento.style.left = `${esquerda + window.scrollX}px`;
  }

  /**
   * Abre o filtro de uma coluna.
   * @param {Object} opcoes
   * @param {HTMLElement} opcoes.ancora   botão da coluna
   * @param {Object} opcoes.coluna        definição da coluna
   * @param {Array}  opcoes.linhas        linhas ANTES dos filtros de coluna
   * @param {Array}  opcoes.colunas       todas as colunas da tabela
   * @param {Object} opcoes.estado        estado atual de filtros
   * @param {Function} opcoes.aoAplicar   recebe o novo estado
   */
  function abrir({ ancora, coluna, linhas, colunas, estado, aoAplicar }) {
    fechar();
    const id = filtro.idColuna(coluna);
    const valores = filtro.valoresDistintos(linhas, colunas, estado, coluna);
    const marcados = new Set(estado.selecoes[id] || valores);
    const numerica = Boolean(coluna.moeda || coluna.numerico);

    const aplicarEFechar = (novoEstado) => {
      fechar();
      aoAplicar(novoEstado);
      // A tabela é recriada: devolve o foco ao novo botão da mesma coluna.
      const novoBotao = document.querySelector(`[data-testid="filtro-coluna-${CSS.escape(id)}"]`);
      if (novoBotao) novoBotao.focus();
    };

    const caixas = valores.map((valor) => criar('input', {
      classe: 'filtro-popover__caixa',
      testid: `filtro-opcao-${id}`,
      attrs: { type: 'checkbox', value: valor, checked: marcados.has(valor) }
    }));
    const itens = caixas.map((caixa) => criar('li', {
      classe: 'filtro-popover__item',
      filhos: [criar('label', { classe: 'filtro-popover__rotulo', filhos: [caixa, criar('span', { texto: caixa.value })] })]
    }));

    const todos = criar('input', { testid: `filtro-todos-${id}`, attrs: { type: 'checkbox' } });
    const visiveis = () => caixas.filter((c) => !c.closest('li').hidden);
    const atualizarTodos = () => {
      const lista = visiveis();
      const qtd = lista.filter((c) => c.checked).length;
      todos.checked = lista.length > 0 && qtd === lista.length;
      todos.indeterminate = qtd > 0 && qtd < lista.length;
    };
    todos.addEventListener('change', () => { visiveis().forEach((c) => { c.checked = todos.checked; }); });
    caixas.forEach((c) => c.addEventListener('change', atualizarTodos));

    const busca = criar('input', {
      classe: 'form__controle filtro-popover__busca',
      testid: `filtro-busca-${id}`,
      attrs: { type: 'search', placeholder: 'Pesquisar', 'aria-label': `Pesquisar valores de ${coluna.rotulo}`, autocomplete: 'off' }
    });
    busca.addEventListener('input', () => {
      const termo = App.utils.format.normalizarTexto(busca.value);
      itens.forEach((li, i) => { li.hidden = Boolean(termo) && !App.utils.format.normalizarTexto(caixas[i].value).includes(termo); });
      // Como no Excel: ao pesquisar, os resultados ficam marcados.
      if (termo) visiveis().forEach((c) => { c.checked = true; });
      atualizarTodos();
    });

    const erro = criar('p', { classe: 'form__erro', testid: `filtro-erro-${id}`, attrs: { role: 'alert' } });

    const confirmar = () => {
      const termo = busca.value.trim();
      const selecionados = (termo ? visiveis() : caixas).filter((c) => c.checked).map((c) => c.value);
      if (!selecionados.length) {
        erro.textContent = 'Selecione pelo menos um valor.';
        return;
      }
      aplicarEFechar(filtro.definirSelecao(estado, id, selecionados, valores));
    };

    const botaoOrdem = (direcao, rotulo) => criar('button', {
      classe: 'filtro-popover__acao',
      testid: `filtro-ordem-${direcao}-${id}`,
      texto: rotulo,
      attrs: { type: 'button' },
      on: { click: () => aplicarEFechar(filtro.definirOrdem(estado, id, direcao)) }
    });

    const elemento = criar('div', {
      classe: 'filtro-popover',
      testid: `filtro-popover-${id}`,
      attrs: { role: 'dialog', 'aria-label': `Filtro da coluna ${coluna.rotulo}` },
      filhos: [
        botaoOrdem('asc', numerica ? '↑ Classificar do menor para o maior' : '↑ Classificar de A a Z'),
        botaoOrdem('desc', numerica ? '↓ Classificar do maior para o menor' : '↓ Classificar de Z a A'),
        criar('button', {
          classe: 'filtro-popover__acao',
          testid: `filtro-limpar-${id}`,
          texto: `✕ Limpar filtro de "${coluna.rotulo}"`,
          attrs: { type: 'button', disabled: !estado.selecoes[id] },
          on: { click: () => aplicarEFechar(filtro.limparColuna(estado, id)) }
        }),
        criar('hr', { classe: 'filtro-popover__separador' }),
        busca,
        criar('label', { classe: 'filtro-popover__rotulo filtro-popover__todos', filhos: [todos, criar('span', { texto: '(Selecionar tudo)' })] }),
        criar('ul', { classe: 'filtro-popover__lista', filhos: itens }),
        erro,
        criar('div', {
          classe: 'filtro-popover__rodape',
          filhos: [
            criar('button', { classe: 'btn btn--primario btn--pequeno', testid: `filtro-ok-${id}`, texto: 'OK', attrs: { type: 'button' }, on: { click: confirmar } }),
            criar('button', { classe: 'btn btn--secundario btn--pequeno', testid: `filtro-cancelar-${id}`, texto: 'Cancelar', attrs: { type: 'button' }, on: { click: fechar } })
          ]
        })
      ]
    });

    document.body.append(elemento);
    atualizarTodos();
    posicionar(elemento, ancora);
    busca.focus();

    aberto = {
      elemento,
      ancora,
      aoClicarFora: (e) => { if (!elemento.contains(e.target) && e.target !== ancora) fechar(); },
      aoTeclar: (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
        if (e.key === 'Enter' && e.target === busca) { e.preventDefault(); confirmar(); }
      }
    };
    document.addEventListener('mousedown', aberto.aoClicarFora, true);
    document.addEventListener('keydown', aberto.aoTeclar, true);
    window.addEventListener('resize', fechar);
  }

  App.ui.filtroColuna = Object.freeze({ abrir, fechar });
})(window.OrcApp);
