/**
 * @file componentes.js
 * @description Componentes de interface reutilizáveis (fábricas de DOM).
 * Cada componente recebe um `testid` para automação de testes.
 */
(function (App) {
  'use strict';

  const { criar } = App.utils.dom;
  const { moeda } = App.utils.format;

  /** Botão padrão. variantes: primario | secundario | perigo | fantasma */
  function botao({ rotulo, variante = 'secundario', testid, aoClicar, tipo = 'button', tamanho, attrs = {} }) {
    const classes = ['btn', `btn--${variante}`, tamanho ? `btn--${tamanho}` : ''].filter(Boolean).join(' ');
    return criar('button', { classe: classes, texto: rotulo, testid, attrs: { type: tipo, ...attrs }, on: aoClicar ? { click: aoClicar } : {} });
  }

  /** Cartão indicador (KPI). variantes: positivo | negativo | neutro */
  function kpi({ rotulo, valor, variante = 'neutro', testid, dica }) {
    return criar('article', {
      classe: `kpi kpi--${variante}`,
      testid,
      filhos: [
        criar('h3', { classe: 'kpi__rotulo', texto: rotulo }),
        criar('p', { classe: 'kpi__valor', texto: valor, attrs: { 'data-testid': testid ? `${testid}-valor` : null } }),
        dica ? criar('p', { classe: 'kpi__dica', texto: dica }) : null
      ]
    });
  }

  /** Variante de cor conforme o sinal do valor. */
  const varianteSinal = (valor) => (valor < 0 ? 'negativo' : valor > 0 ? 'positivo' : 'neutro');

  /**
   * Gráfico "Resultado por secretaria" (barras divergentes em CSS):
   * negativo à esquerda, positivo à direita. Usado no Painel e no relatório.
   * @param {Array} porSecretaria totais por secretaria ({codigo, nome, resultado})
   * @param {boolean} [nomeCompleto] exibe o nome inteiro (relatório impresso)
   */
  function graficoResultado(porSecretaria, { testid = 'grafico-resultado', nomeCompleto = false } = {}) {
    const { nomeCurto } = App.utils.format;
    const maximo = Math.max(1, ...porSecretaria.map((t) => Math.abs(t.resultado)));
    const ordenado = [...porSecretaria].sort((a, b) => a.resultado - b.resultado);
    return criar('ul', {
      classe: `grafico${nomeCompleto ? ' grafico--completo' : ''}`,
      testid,
      attrs: { 'aria-label': 'Resultado por secretaria' },
      filhos: ordenado.map((t) => {
        const variante = varianteSinal(t.resultado);
        const barra = criar('span', { classe: `grafico__barra grafico__barra--${variante}` });
        barra.style.setProperty('--largura', `${(Math.abs(t.resultado) / maximo) * 100}%`);
        return criar('li', {
          classe: 'grafico__item',
          testid: `grafico-item-${t.codigo}`,
          filhos: [
            criar('a', { classe: 'grafico__rotulo', texto: `${t.codigo} ${nomeCompleto ? t.nome : nomeCurto(t.nome)}`, attrs: { href: `#/secretaria/${t.codigo}`, title: t.nome } }),
            criar('span', {
              classe: 'grafico__trilho',
              filhos: [
                criar('span', { classe: 'grafico__metade grafico__metade--neg', filhos: [t.resultado < 0 ? barra : null] }),
                criar('span', { classe: 'grafico__metade grafico__metade--pos', filhos: [t.resultado >= 0 ? barra : null] })
              ]
            }),
            criar('span', { classe: `grafico__valor grafico__valor--${variante}`, texto: moeda(t.resultado) })
          ]
        });
      })
    });
  }

  /**
   * Campo de formulário com rótulo, dica e mensagem de erro acessível.
   * @returns {HTMLElement} wrapper .form__campo (input acessível via querySelector)
   */
  function campo({ id, nome, rotulo, tipo = 'text', valor = '', obrigatorio = false, dica, testid, attrs = {}, opcoes, classeExtra = '' }) {
    const idErro = `${id}-erro`;
    const idDica = `${id}-dica`;
    const descritores = [dica ? idDica : '', idErro].filter(Boolean).join(' ');
    const atributosComuns = { id, name: nome, 'aria-describedby': descritores, required: obrigatorio || null, ...attrs };

    let controle;
    if (tipo === 'select') {
      // Opção com `opcoes` vira um <optgroup> (rótulo = o.rotulo).
      const opcao = (o) => (Array.isArray(o.opcoes)
        ? criar('optgroup', { attrs: { label: o.rotulo }, filhos: o.opcoes.map(opcao) })
        : criar('option', { texto: o.rotulo, attrs: { value: o.valor, selected: String(o.valor) === String(valor) || null, ...(o.attrs || {}) } }));
      controle = criar('select', {
        classe: 'form__controle',
        testid,
        attrs: atributosComuns,
        filhos: (opcoes || []).map(opcao)
      });
    } else if (tipo === 'textarea') {
      controle = criar('textarea', { classe: 'form__controle', testid, texto: valor, attrs: { rows: 3, ...atributosComuns } });
    } else {
      controle = criar('input', { classe: 'form__controle', testid, attrs: { type: tipo, value: String(valor ?? ''), ...atributosComuns } });
    }

    return criar('div', {
      classe: `form__campo ${classeExtra}`.trim(),
      filhos: [
        criar('label', {
          classe: 'form__rotulo',
          attrs: { for: id },
          filhos: [rotulo, obrigatorio ? criar('span', { classe: 'form__obrigatorio', texto: ' *', attrs: { 'aria-hidden': 'true' } }) : null]
        }),
        controle,
        dica ? criar('small', { classe: 'form__dica', texto: dica, attrs: { id: idDica } }) : null,
        criar('p', { classe: 'form__erro', testid: `${testid}-erro`, attrs: { id: idErro, 'aria-live': 'polite' } })
      ]
    });
  }

  /**
   * Exibe os erros de validação em um formulário.
   * @param {HTMLFormElement} formulario
   * @param {Object} erros { nomeDoCampo: mensagem }
   * @returns {boolean} true se não houver erros
   */
  function aplicarErros(formulario, erros) {
    formulario.querySelectorAll('.form__controle').forEach((controle) => {
      const mensagem = erros[controle.name];
      const elErro = formulario.querySelector(`#${CSS.escape(controle.id)}-erro`);
      controle.classList.toggle('form__controle--invalido', Boolean(mensagem));
      controle.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
      if (elErro) elErro.textContent = mensagem || '';
    });

    const resumo = formulario.querySelector('.form__resumo-erros');
    const total = Object.keys(erros).length;
    if (resumo) {
      resumo.textContent = total ? `Corrija ${total} campo(s) destacado(s) antes de continuar.` : '';
      resumo.hidden = !total;
    }
    if (total) {
      const primeiro = formulario.querySelector('.form__controle--invalido');
      if (primeiro) primeiro.focus();
    }
    return total === 0;
  }

  /** Bloco de resumo de erros (role=alert) para o topo de formulários. */
  function resumoErros(testid) {
    return criar('p', { classe: 'alerta alerta--erro form__resumo-erros', testid, attrs: { role: 'alert', hidden: true } });
  }

  /** Mensagem de alerta. níveis: erro | aviso | info | sucesso */
  function alerta({ nivel = 'info', mensagem, testid, filhos }) {
    return criar('div', {
      classe: `alerta alerta--${nivel}`,
      testid,
      attrs: { role: nivel === 'erro' ? 'alert' : 'status' },
      filhos: filhos || [mensagem]
    });
  }

  /**
   * Tabela de dados.
   * @param {Object} opcoes
   * @param {Array<{rotulo:string, chave?:string, numerico?:boolean, moeda?:boolean, render?:Function, classe?:string}>} opcoes.colunas
   * @param {Array<Object>} opcoes.linhas
   * @param {Array} [opcoes.rodape]  células do <tfoot>
   * @param {string} opcoes.testid
   * @param {string} [opcoes.legenda] caption acessível
   * @param {Function} [opcoes.classeLinha] (linha, índice) => classe extra do <tr>
   * @param {Function} [opcoes.atributosLinha] (linha) => atributos do <tr> (ex.: { 'data-id': ... })
   * @param {Object} [opcoes.filtro] filtros de coluna estilo Excel (colunas com `filtravel: true`)
   * @param {Object} opcoes.filtro.estado      estado (utils/filtroTabela.js)
   * @param {Array}  opcoes.filtro.linhasBase  linhas antes dos filtros de coluna
   * @param {Function} opcoes.filtro.aoAlterar recebe o novo estado
   */
  function tabela({ colunas, linhas, rodape, testid, legenda, classeLinha, atributosLinha, filtro }) {
    const celula = (tag, coluna, conteudo) => criar(tag, {
      classe: ['tabela__celula', coluna.numerico || coluna.moeda ? 'tabela__celula--num' : '', coluna.classe || ''].filter(Boolean).join(' '),
      attrs: tag === 'th' ? { scope: 'col', 'aria-sort': ordenacaoAria(coluna) } : {},
      filhos: [conteudo]
    });

    function ordenacaoAria(coluna) {
      if (!filtro || !filtro.estado.ordem) return null;
      if (filtro.estado.ordem.coluna !== App.utils.filtroTabela.idColuna(coluna)) return null;
      return filtro.estado.ordem.direcao === 'asc' ? 'ascending' : 'descending';
    }

    /** Cabeçalho com botão de filtro (▾), indicador de filtro ativo e de classificação. */
    function cabecalho(coluna) {
      if (!filtro || !coluna.filtravel) return coluna.rotulo;
      const id = App.utils.filtroTabela.idColuna(coluna);
      const ativo = Array.isArray(filtro.estado.selecoes[id]);
      const ordem = filtro.estado.ordem && filtro.estado.ordem.coluna === id ? filtro.estado.ordem.direcao : '';
      const botaoFiltro = criar('button', {
        classe: `tabela__filtro${ativo ? ' tabela__filtro--ativo' : ''}`,
        testid: `filtro-coluna-${id}`,
        texto: ativo ? '▼' : '▾',
        attrs: {
          type: 'button',
          'aria-haspopup': 'dialog',
          'aria-label': `Filtrar coluna ${coluna.rotulo}${ativo ? ' (filtro ativo)' : ''}`,
          title: ativo ? 'Filtro ativo' : 'Filtrar / classificar'
        },
        on: {
          click: (e) => App.ui.filtroColuna.abrir({
            ancora: e.currentTarget, coluna, colunas, linhas: filtro.linhasBase, estado: filtro.estado, aoAplicar: filtro.aoAlterar
          })
        }
      });
      return criar('span', {
        classe: 'tabela__cabecalho',
        filhos: [
          criar('span', { texto: coluna.rotulo }),
          ordem ? criar('span', { classe: 'tabela__ordem', texto: ordem === 'asc' ? '↑' : '↓', attrs: { 'aria-hidden': 'true' } }) : null,
          botaoFiltro
        ]
      });
    }

    const valorCelula = (coluna, linha, indice) => {
      if (coluna.render) return coluna.render(linha, indice);
      const valor = linha[coluna.chave];
      return coluna.moeda ? moeda(valor) : String(valor ?? '');
    };

    return criar('div', {
      classe: 'tabela-wrapper',
      attrs: { tabindex: '0', role: 'region', 'aria-label': legenda || 'Tabela' },
      filhos: [criar('table', {
        classe: 'tabela',
        testid,
        filhos: [
          legenda ? criar('caption', { classe: 'tabela__legenda', texto: legenda }) : null,
          criar('thead', { filhos: [criar('tr', { filhos: colunas.map((c) => celula('th', c, cabecalho(c))) })] }),
          criar('tbody', {
            filhos: linhas.map((linha, i) => criar('tr', {
              classe: ['tabela__linha', classeLinha ? classeLinha(linha, i) : ''].filter(Boolean).join(' '),
              testid: `${testid}-linha`,
              attrs: atributosLinha ? atributosLinha(linha, i) : {},
              filhos: colunas.map((c) => celula('td', c, valorCelula(c, linha, i)))
            }))
          }),
          rodape ? criar('tfoot', {
            filhos: [criar('tr', { classe: 'tabela__total', filhos: rodape.map((conteudo, i) => celula('td', colunas[i] || {}, conteudo)) })]
          }) : null
        ]
      })]
    });
  }

  /**
   * Selo da situação orçamentária de uma ficha (ícone + texto: não depende só da cor).
   * @param {string} situacao deficit | atende | positivo
   * @param {string} [complemento] texto extra (ex.: valor do déficit)
   */
  function seloSituacao(situacao, { complemento = '', testid } = {}) {
    const info = App.core.config.SITUACOES_FICHA[situacao];
    return criar('span', {
      classe: `selo selo--${situacao}`,
      testid,
      texto: `${info.icone} ${info.rotulo}${complemento ? ` ${complemento}` : ''}`,
      attrs: { title: info.descricao, 'data-situacao': situacao }
    });
  }

  /** Estado vazio com chamada para ação. */
  function estadoVazio({ titulo, mensagem, acao, testid = 'estado-vazio' }) {
    return criar('section', {
      classe: 'estado-vazio',
      testid,
      filhos: [
        criar('h2', { classe: 'estado-vazio__titulo', texto: titulo }),
        criar('p', { classe: 'estado-vazio__mensagem', texto: mensagem }),
        acao || null
      ]
    });
  }

  /** Cabeçalho padrão de página/módulo. */
  function cabecalhoPagina({ titulo, subtitulo, acoes = [], testid }) {
    return criar('header', {
      classe: 'pagina__cabecalho',
      testid,
      filhos: [
        criar('div', {
          classe: 'pagina__titulos',
          filhos: [
            criar('h1', { classe: 'pagina__titulo', texto: titulo, attrs: { tabindex: '-1' } }),
            subtitulo ? criar('p', { classe: 'pagina__subtitulo', texto: subtitulo }) : null
          ]
        }),
        acoes.length ? criar('div', { classe: 'pagina__acoes', filhos: acoes }) : null
      ]
    });
  }

  App.ui.componentes = Object.freeze({
    botao, kpi, varianteSinal, graficoResultado, campo, aplicarErros, resumoErros, alerta, tabela, estadoVazio, cabecalhoPagina, seloSituacao
  });
})(window.OrcApp);
