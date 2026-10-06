/**
 * @file secretaria.js
 * @description Módulo "Secretaria" (um por Unidade Orçamentária, via rota
 * #/secretaria/NN.NN). Permite:
 *  - visualizar indicadores e linhas de despesa (busca, filtro por competência
 *    e filtros de coluna no padrão Excel — os indicadores seguem os filtros,
 *    como o SUBTOTAL do Excel);
 *  - incluir, editar e excluir despesas (formulário validado, período padronizado);
 *  - informar o valor da Folha;
 *  - consultar se uma demanda consta na planilha (gera texto de despacho);
 *  - incorporar lançamentos "fora do quadro".
 */
(function (App) {
  'use strict';

  const { criar, limpar } = App.utils.dom;
  const { moeda, numero, paraNumero } = App.utils.format;
  const { kpi, varianteSinal, tabela, cabecalhoPagina, botao, campo, aplicarErros, resumoErros, alerta, estadoVazio } = App.ui.componentes;
  const { validarLinha, validarValor } = App.utils.validators;
  const filtroTabela = App.utils.filtroTabela;
  const periodo = App.utils.periodo;
  const calculos = App.data.calculos;
  const store = App.data.store;
  const config = App.core.config;
  const toast = App.ui.toast;
  const modal = App.ui.modal;

  /** Filtros preservados por secretaria durante a sessão. */
  const filtros = new Map();
  const obterFiltro = (codigo) => {
    if (!filtros.has(codigo)) filtros.set(codigo, { busca: '', periodo: '', colunas: filtroTabela.criarEstado() });
    return filtros.get(codigo);
  };

  /* ------------------------------- Indicadores ------------------------------- */

  /**
   * KPIs calculados sobre as linhas VISÍVEIS (após todos os filtros).
   * Com qualquer filtro ativo a Folha não é somada (é um valor global da secretaria).
   */
  function blocoKpis(secretaria, visiveis, algumFiltro) {
    const t = calculos.totaisSecretaria({ ...secretaria, linhas: visiveis }, { colunasAtivas: algumFiltro });
    return criar('section', {
      classe: 'kpis',
      testid: 'secretaria-kpis',
      attrs: { 'aria-label': 'Indicadores da secretaria' },
      filhos: [
        kpi({ rotulo: 'Essencial', valor: moeda(t.essencial), variante: 'negativo', testid: 'kpi-sec-essencial' }),
        kpi({ rotulo: 'Reserva', valor: moeda(t.reserva), variante: 'positivo', testid: 'kpi-sec-reserva' }),
        kpi({ rotulo: 'Saldo Ficha', valor: moeda(t.saldoFicha), variante: 'positivo', testid: 'kpi-sec-saldo' }),
        kpi({ rotulo: 'Folha', valor: moeda(t.folha), variante: 'negativo', testid: 'kpi-sec-folha' }),
        kpi({ rotulo: 'Resultado', valor: moeda(t.resultado), variante: varianteSinal(t.resultado), testid: 'kpi-sec-resultado', dica: `${t.qtdLinhas} linhas · ${t.qtdFichas} fichas` })
      ]
    });
  }

  /* ---------------------------------- Folha ---------------------------------- */

  function formularioFolha(secretaria) {
    const formulario = criar('form', {
      classe: 'form form--inline',
      testid: 'form-folha',
      attrs: { novalidate: true, 'aria-label': 'Valor da folha de pagamento' },
      filhos: [
        campo({
          id: 'folha-valor', nome: 'valor', rotulo: 'Folha de pagamento (valor a deduzir)', valor: numero(secretaria.folha),
          testid: 'input-folha', attrs: { inputmode: 'decimal', autocomplete: 'off' }
        }),
        botao({ rotulo: 'Salvar folha', variante: 'secundario', tipo: 'submit', testid: 'btn-salvar-folha' })
      ]
    });
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const valor = formulario.elements.valor.value;
      if (!aplicarErros(formulario, validarValor(valor).erros)) return;
      store.definirFolha(secretaria.codigo, paraNumero(valor));
      toast.sucesso('Valor da folha atualizado.');
    });
    return formulario;
  }

  /* --------------------------- Formulário de despesa -------------------------- */

  /**
   * Campos de período padronizado: mês inicial + mês final (competências).
   * Atalhos preenchem os casos mais comuns da planilha.
   */
  function camposPeriodo(dados) {
    const meses = periodo.listarMeses(App.data.schema.obterReferencia());
    const opcoes = [{ valor: '', rotulo: 'Selecione…' }, ...meses];
    const inicio = campo({
      id: 'linha-periodoInicio', nome: 'periodoInicio', rotulo: 'Período — mês inicial', tipo: 'select',
      valor: dados.periodoInicio || '', testid: 'input-linha-periodoInicio', opcoes,
      dica: 'Obrigatório quando houver valor Essencial.'
    });
    const fim = campo({
      id: 'linha-periodoFim', nome: 'periodoFim', rotulo: 'Período — mês final', tipo: 'select',
      valor: dados.periodoFim || '', testid: 'input-linha-periodoFim', opcoes,
      dica: 'Em branco = somente o mês inicial.'
    });
    const selInicio = inicio.querySelector('select');
    const selFim = fim.querySelector('select');

    const atalho = (rotulo, testid, aoClicar) => botao({ rotulo, tamanho: 'pequeno', variante: 'fantasma', testid, aoClicar });
    const atalhos = criar('div', {
      classe: 'form__campo form__campo--largo',
      filhos: [
        criar('span', { classe: 'form__dica', texto: 'Atalhos:' }),
        criar('div', {
          classe: 'form__acoes',
          filhos: [
            atalho('Somente o mês inicial', 'btn-periodo-mes-unico', () => { selFim.value = selInicio.value; }),
            atalho('Até o fim do exercício (Dez)', 'btn-periodo-ate-dezembro', () => {
              if (selInicio.value) selFim.value = `${selInicio.value.slice(0, 4)}-12`;
            })
          ]
        })
      ]
    });

    const avisoLegado = dados.observacao && !periodo.valido(dados.periodoInicio)
      ? alerta({ nivel: 'aviso', testid: 'aviso-periodo-legado', mensagem: `Período original (texto livre): "${dados.observacao}". Selecione o período padronizado.` })
      : null;
    return [avisoLegado ? criar('div', { classe: 'form__campo--largo', filhos: [avisoLegado] }) : null, inicio, fim, atalhos].filter(Boolean);
  }

  /** Abre a modal de inclusão/edição de uma linha de despesa. */
  function abrirFormularioLinha(secretaria, linha = null) {
    const dados = linha || { ficha: '', ue: '', fonte: '1', despesa: '', descricao: '', observacao: '', periodoInicio: '', periodoFim: '' };
    const valorCampo = (c) => (c.tipo === 'moeda' ? (linha ? numero(dados[c.chave]) : '') : dados[c.chave]);

    const campos = config.CAMPOS_LINHA.flatMap((c) => {
      if (c.chave === 'observacao') return camposPeriodo(dados);
      return [campo({
        id: `linha-${c.chave}`,
        nome: c.chave,
        rotulo: c.rotulo,
        tipo: ['descricao', 'anotacao'].includes(c.chave) ? 'textarea' : 'text',
        valor: valorCampo(c),
        obrigatorio: c.obrigatorio,
        testid: `input-linha-${c.chave}`,
        classeExtra: ['descricao', 'anotacao'].includes(c.chave) ? 'form__campo--largo' : '',
        dica: {
          ue: 'Ex.: 020101 · oficial (Fiorilli)', despesa: 'Ex.: 3.3.90.30 · oficial (Fiorilli)',
          ficha: 'Oficial (Fiorilli)', fonte: 'Oficial (Fiorilli)', reserva: 'Oficial (Fiorilli)', saldoFicha: 'Oficial (Fiorilli)',
          essencial: 'Preenchido pelo usuário', descricao: 'Preenchido pelo usuário',
          anotacao: 'Notas livres (ex.: "PL 16 – transferir para ficha 730", "aguardando ata")'
        }[c.chave],
        attrs: c.tipo === 'moeda' ? { inputmode: 'decimal', placeholder: '0,00', autocomplete: 'off' } : { autocomplete: 'off' }
      })];
    });

    const formulario = criar('form', {
      classe: 'form form--grade',
      testid: 'form-linha',
      attrs: { id: 'form-linha', novalidate: true },
      filhos: [resumoErros('form-linha-resumo-erros'), ...campos]
    });

    const { fechar } = modal.abrir({
      titulo: linha ? `Editar despesa — ficha ${linha.ficha}` : 'Nova despesa',
      testid: 'modal-linha',
      tamanho: 'largo',
      conteudo: formulario,
      acoes: [
        { rotulo: 'Cancelar', testid: 'btn-linha-cancelar', aoClicar: ({ fechar: f }) => f() },
        { rotulo: 'Salvar', variante: 'primario', tipo: 'submit', form: 'form-linha', testid: 'btn-linha-salvar' }
      ]
    });

    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const valores = Object.fromEntries(new FormData(formulario).entries());
      if (valores.periodoInicio && !valores.periodoFim) valores.periodoFim = valores.periodoInicio;
      if (!aplicarErros(formulario, validarLinha(valores).erros)) return;
      // Período em texto livre (legado): ao padronizar, o texto antigo vai para "Anotações";
      // sem período selecionado, o texto é mantido para revisão posterior.
      const legado = dados.observacao && !periodo.valido(dados.periodoInicio) ? dados.observacao : '';
      const observacao = valores.periodoInicio ? '' : legado;
      const anotacao = valores.periodoInicio && legado
        ? App.data.schema.anexarAnotacao(valores.anotacao.trim(), legado)
        : valores.anotacao;
      store.salvarLinha(secretaria.codigo, { ...valores, observacao, anotacao, id: linha ? linha.id : undefined });
      toast.sucesso(linha ? 'Despesa atualizada.' : 'Despesa incluída.');
      fechar();
    });
  }

  async function excluirLinha(secretaria, linha) {
    const confirmado = await modal.confirmar({
      titulo: 'Excluir despesa',
      mensagem: `Excluir a linha da ficha ${linha.ficha} (${linha.despesa}) — "${linha.descricao || 'sem descrição'}"?`,
      rotuloConfirmar: 'Excluir',
      perigo: true,
      testid: 'modal-excluir-linha'
    });
    if (!confirmado) return;
    store.removerLinha(secretaria.codigo, linha.id);
    toast.sucesso('Despesa excluída.');
  }

  /* --------------------------- Consulta de demanda --------------------------- */

  /** Copia texto para a área de transferência (com fallback). */
  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.sucesso('Texto copiado.');
    } catch {
      toast.aviso('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.');
    }
  }

  function resultadoConsulta(consulta, valor) {
    const mensagem = config.MENSAGENS_PARECER[consulta.situacao];
    const nivel = { consta: 'sucesso', valorMenor: 'aviso', naoConsta: 'erro' }[consulta.situacao];
    return criar('section', {
      classe: 'consulta__resultado',
      testid: 'consulta-resultado',
      attrs: { 'data-situacao': consulta.situacao },
      filhos: [
        alerta({ nivel, testid: 'consulta-situacao', mensagem: consulta.situacao === 'naoConsta'
          ? 'Nenhuma linha encontrada para os dados informados.'
          : `Essencial previsto na planilha: ${moeda(consulta.essencialPlanilha)} · Solicitado: ${moeda(valor)}` }),
        criar('blockquote', { classe: 'consulta__texto', texto: mensagem, testid: 'consulta-texto' }),
        botao({ rotulo: 'Copiar texto do despacho', testid: 'btn-consulta-copiar', aoClicar: () => copiar(mensagem) }),
        consulta.linhas.length ? tabela({
          testid: 'tabela-consulta',
          legenda: 'Linhas encontradas',
          colunas: [
            { rotulo: 'Ficha', chave: 'ficha' }, { rotulo: 'Despesa', chave: 'despesa' },
            { rotulo: 'Descrição', chave: 'descricao' }, { rotulo: 'Período', chave: 'observacao' },
            { rotulo: 'Essencial', chave: 'essencial', moeda: true }
          ],
          linhas: consulta.linhas
        }) : null
      ]
    });
  }

  function abrirConsulta(secretaria) {
    const area = criar('div', { classe: 'consulta__area', attrs: { 'aria-live': 'polite' } });
    const formulario = criar('form', {
      classe: 'form form--grade',
      testid: 'form-consulta',
      attrs: { id: 'form-consulta', novalidate: true },
      filhos: [
        resumoErros('form-consulta-resumo-erros'),
        campo({ id: 'consulta-ficha', nome: 'ficha', rotulo: 'Nº Ficha', testid: 'input-consulta-ficha', attrs: { inputmode: 'numeric', autocomplete: 'off' } }),
        campo({ id: 'consulta-despesa', nome: 'despesa', rotulo: 'Cód. Despesa', testid: 'input-consulta-despesa', dica: 'Ex.: 3.3.90.39', attrs: { autocomplete: 'off' } }),
        campo({ id: 'consulta-valor', nome: 'valor', rotulo: 'Valor solicitado', obrigatorio: true, testid: 'input-consulta-valor', attrs: { inputmode: 'decimal', placeholder: '0,00', autocomplete: 'off' } }),
        criar('div', { classe: 'form__campo form__campo--largo', filhos: [area] })
      ]
    });

    modal.abrir({
      titulo: `Consultar demanda — ${secretaria.codigo}`,
      testid: 'modal-consulta',
      tamanho: 'largo',
      conteudo: formulario,
      acoes: [
        { rotulo: 'Fechar', testid: 'btn-consulta-fechar', aoClicar: ({ fechar }) => fechar() },
        { rotulo: 'Consultar', variante: 'primario', tipo: 'submit', form: 'form-consulta', testid: 'btn-consulta-executar' }
      ]
    });

    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const { ficha, despesa, valor } = Object.fromEntries(new FormData(formulario).entries());
      const erros = {};
      if (!ficha.trim() && !despesa.trim()) erros.ficha = 'Informe a ficha e/ou o código da despesa.';
      const n = paraNumero(valor);
      if (!valor.trim()) erros.valor = 'Informe o valor solicitado.';
      else if (Number.isNaN(n) || n <= 0) erros.valor = 'Informe um valor maior que zero. Ex.: 1.500,00';
      limpar(area);
      if (!aplicarErros(formulario, erros)) return;
      area.append(resultadoConsulta(calculos.consultarDemanda(secretaria, { ficha, despesa, valor: n }), n));
    });
  }

  /* --------------------------------- Tabelas --------------------------------- */

  function acoesLinha(secretaria, linha) {
    return criar('div', {
      classe: 'tabela__acoes',
      filhos: [
        botao({ rotulo: 'Editar', tamanho: 'pequeno', variante: 'fantasma', testid: `btn-editar-linha-${linha.id}`, attrs: { 'aria-label': `Editar ficha ${linha.ficha} ${linha.descricao}` }, aoClicar: () => abrirFormularioLinha(secretaria, linha) }),
        botao({ rotulo: 'Excluir', tamanho: 'pequeno', variante: 'perigo-texto', testid: `btn-excluir-linha-${linha.id}`, attrs: { 'aria-label': `Excluir ficha ${linha.ficha} ${linha.descricao}` }, aoClicar: () => excluirLinha(secretaria, linha) })
      ]
    });
  }

  /** Célula de período: destaca textos ainda não padronizados. */
  function celulaPeriodo(linha) {
    if (!linha.observacao) return '';
    if (periodo.valido(linha.periodoInicio)) return linha.observacao;
    return criar('span', {
      classe: 'selo selo--aviso',
      texto: `⚠ ${linha.observacao}`,
      attrs: { title: 'Período não padronizado: edite a linha e selecione o mês inicial/final.' }
    });
  }

  /** Descrição + anotações (em linha menor, abaixo). */
  function celulaDescricao(linha) {
    if (!linha.anotacao) return linha.descricao;
    return criar('span', {
      filhos: [
        linha.descricao,
        criar('small', { classe: 'tabela__anotacao', texto: `📝 ${linha.anotacao}` })
      ]
    });
  }

  /** Colunas da tabela. `filtravel` habilita o filtro estilo Excel. */
  const COLUNAS_BASE = Object.freeze([
    { rotulo: 'Ficha', chave: 'ficha', filtravel: true, valorOrdem: (l) => Number(l.ficha) || 0 },
    { rotulo: 'U.E', chave: 'ue', filtravel: true },
    { rotulo: 'FR', chave: 'fonte', filtravel: true },
    { rotulo: 'Cód. Despesa', chave: 'despesa', classe: 'tabela__celula--nowrap', filtravel: true },
    { rotulo: 'Descrição', chave: 'descricao', classe: 'tabela__celula--descricao', filtravel: true, render: celulaDescricao },
    {
      rotulo: 'Observação (Período)', chave: 'observacao', filtravel: true, render: celulaPeriodo,
      valorOrdem: (l) => (periodo.valido(l.periodoInicio) ? `${l.periodoInicio}|${l.periodoFim}` : `~${l.observacao}`)
    },
    { rotulo: 'Essencial', chave: 'essencial', moeda: true, filtravel: true },
    { rotulo: 'Reserva', chave: 'reserva', moeda: true, filtravel: true },
    { rotulo: 'Saldo Ficha', chave: 'saldoFicha', moeda: true, filtravel: true }
  ]);

  /** Alterna a cor de fundo a cada nova ficha (agrupamento visual). */
  function classificadorFichas(linhas) {
    let faixa = false;
    let anterior = null;
    const mapa = new Map();
    linhas.forEach((l) => {
      if (l.ficha !== anterior) { faixa = !faixa; anterior = l.ficha; }
      mapa.set(l.id, faixa ? 'tabela__linha--faixa' : '');
    });
    return (linha) => mapa.get(linha.id);
  }

  /**
   * Tabela de linhas com filtros de coluna (estilo Excel).
   * @param {Array} base     linhas após busca/período (antes dos filtros de coluna)
   * @param {Array} visiveis linhas após todos os filtros
   */
  function tabelaLinhas(secretaria, filtro, base, visiveis, aoAlterarColunas) {
    if (!secretaria.linhas.length) {
      return alerta({ nivel: 'info', testid: 'secretaria-sem-linhas', mensagem: 'Nenhuma despesa cadastrada para esta secretaria.' });
    }
    const soma = calculos.somarLinhas(visiveis);
    const colunas = [...COLUNAS_BASE, { rotulo: 'Ações', id: 'acoes', render: (l) => acoesLinha(secretaria, l) }];
    return tabela({
      testid: 'tabela-linhas',
      legenda: `Despesas da secretaria ${secretaria.codigo} — exibindo ${visiveis.length} de ${secretaria.linhas.length} linhas`,
      colunas,
      linhas: visiveis,
      classeLinha: classificadorFichas(visiveis),
      filtro: { estado: filtro.colunas, linhasBase: base, aoAlterar: aoAlterarColunas },
      rodape: ['', '', '', '', visiveis.length ? 'Totais' : 'Nenhuma linha corresponde aos filtros', '', moeda(soma.essencial), moeda(soma.reserva), moeda(soma.saldoFicha), '']
    });
  }

  function secaoPendentes(secretaria) {
    if (!secretaria.pendentes.length) return null;
    return criar('section', {
      classe: 'cartao',
      testid: 'secretaria-pendentes',
      filhos: [
        criar('h2', { classe: 'cartao__titulo', texto: `Lançamentos fora do quadro (${secretaria.pendentes.length})` }),
        criar('p', { classe: 'cartao__descricao', texto: 'Registros abaixo do TOTAL na planilha de origem. Não são somados até serem incorporados ao quadro.' }),
        tabela({
          testid: 'tabela-pendentes',
          legenda: 'Lançamentos fora do quadro',
          colunas: [
            ...COLUNAS_BASE.slice(0, 7),
            {
              rotulo: 'Ações',
              render: (l) => criar('div', {
                classe: 'tabela__acoes',
                filhos: [
                  botao({ rotulo: 'Incorporar', tamanho: 'pequeno', variante: 'fantasma', testid: `btn-incorporar-${l.id}`, aoClicar: () => { store.incorporarPendente(secretaria.codigo, l.id); toast.sucesso('Lançamento incorporado ao quadro.'); } }),
                  botao({ rotulo: 'Excluir', tamanho: 'pequeno', variante: 'perigo-texto', testid: `btn-excluir-pendente-${l.id}`, aoClicar: () => excluirLinha(secretaria, l) })
                ]
              })
            }
          ],
          linhas: secretaria.pendentes
        })
      ]
    });
  }

  /* -------------------------------- Ferramentas ------------------------------- */

  function barraFiltros(secretaria, filtro, aoAlterar) {
    const periodos = calculos.listarPeriodos([secretaria]);
    const busca = campo({ id: 'sec-busca', nome: 'busca', rotulo: 'Buscar', tipo: 'search', valor: filtro.busca, testid: 'input-secretaria-busca', attrs: { placeholder: 'Ficha, despesa, descrição…', autocomplete: 'off' } });
    const seletorPeriodo = campo({
      id: 'sec-periodo', nome: 'periodo', rotulo: 'Competência (mês)', tipo: 'select', valor: filtro.periodo, testid: 'select-secretaria-periodo',
      opcoes: [{ valor: '', rotulo: 'Todas' }, ...periodos]
    });
    const limparFiltros = botao({
      rotulo: 'Limpar filtros', variante: 'fantasma', testid: 'btn-limpar-filtros',
      aoClicar: () => {
        filtro.busca = '';
        filtro.periodo = '';
        filtro.colunas = filtroTabela.criarEstado();
        busca.querySelector('input').value = '';
        seletorPeriodo.querySelector('select').value = '';
        aoAlterar();
      }
    });

    let temporizador = null;
    busca.querySelector('input').addEventListener('input', (e) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => { filtro.busca = e.target.value; aoAlterar(); }, 200);
    });
    seletorPeriodo.querySelector('select').addEventListener('change', (e) => { filtro.periodo = e.target.value; aoAlterar(); });

    return criar('div', { classe: 'barra-ferramentas', attrs: { role: 'search' }, filhos: [busca, seletorPeriodo, limparFiltros] });
  }

  /** Aviso de linhas com período em texto livre, com atalho para filtrá-las. */
  function avisoNaoPadronizados(secretaria, filtro, aoAlterar) {
    const qtd = calculos.contarNaoPadronizados([secretaria]);
    if (!qtd || filtro.periodo === periodo.FILTRO_NAO_PADRONIZADO) return null;
    return alerta({
      nivel: 'aviso',
      testid: 'secretaria-periodos-nao-padronizados',
      filhos: [
        `${qtd} linha(s) com período em texto livre (não padronizado). `,
        botao({
          rotulo: 'Mostrar essas linhas', tamanho: 'pequeno', variante: 'fantasma', testid: 'btn-filtrar-nao-padronizados',
          aoClicar: () => {
            filtro.periodo = periodo.FILTRO_NAO_PADRONIZADO;
            const seletor = document.querySelector('[data-testid="select-secretaria-periodo"]');
            if (seletor) seletor.value = filtro.periodo;
            aoAlterar();
          }
        })
      ]
    });
  }

  /* --------------------------------- Render ---------------------------------- */

  function render(container, { codigo }) {
    const secretaria = store.getSecretaria(codigo);
    if (!secretaria) {
      container.append(estadoVazio({ titulo: 'Secretaria não encontrada', mensagem: `O código ${codigo} não está cadastrado. Verifique em Configurações.`, testid: 'secretaria-inexistente' }));
      return;
    }
    const filtro = obterFiltro(codigo);
    if (filtro.periodo && !calculos.listarPeriodos([secretaria]).some((p) => p.valor === filtro.periodo)) filtro.periodo = '';

    container.append(cabecalhoPagina({
      titulo: `${secretaria.codigo} — ${secretaria.nome}`,
      subtitulo: secretaria.atualizadoEm ? `Atualizado em ${secretaria.atualizadoEm}` : 'Unidade Orçamentária',
      testid: 'secretaria-cabecalho',
      acoes: [
        botao({ rotulo: 'Consultar demanda', testid: 'btn-consultar-demanda', aoClicar: () => abrirConsulta(secretaria) }),
        botao({ rotulo: '+ Nova despesa', variante: 'primario', testid: 'btn-nova-linha', aoClicar: () => abrirFormularioLinha(secretaria) })
      ]
    }));

    // Região que muda com os filtros (evita perder o foco do campo de busca).
    const regiaoDinamica = criar('div', { classe: 'secretaria__dinamica' });
    const atualizar = () => {
      // 1) busca + competência  2) filtros de coluna (Excel) + classificação
      const base = calculos.filtrarLinhas(secretaria.linhas, filtro);
      const colunas = [...COLUNAS_BASE];
      const visiveis = filtroTabela.aplicar(base, colunas, filtro.colunas);
      const algumFiltro = calculos.filtroAtivo(filtro) || filtroTabela.temFiltro(filtro.colunas);
      const aoAlterarColunas = (novoEstado) => { filtro.colunas = novoEstado; atualizar(); };

      limpar(regiaoDinamica);
      regiaoDinamica.append(...[
        avisoNaoPadronizados(secretaria, filtro, atualizar),
        algumFiltro ? alerta({ nivel: 'info', testid: 'secretaria-filtro-ativo', mensagem: `Filtro ativo: exibindo ${visiveis.length} de ${secretaria.linhas.length} linhas. Os indicadores consideram apenas as linhas exibidas (Folha desconsiderada).` }) : null,
        blocoKpis(secretaria, visiveis, algumFiltro),
        criar('section', { classe: 'cartao', filhos: [tabelaLinhas(secretaria, filtro, base, visiveis, aoAlterarColunas)] })
      ].filter(Boolean));
    };

    container.append(
      criar('div', { classe: 'secretaria__ferramentas', filhos: [barraFiltros(secretaria, filtro, atualizar), formularioFolha(secretaria)] }),
      regiaoDinamica
    );
    atualizar();
    const pendentes = secaoPendentes(secretaria);
    if (pendentes) container.append(pendentes);
  }

  App.modules.secretaria = Object.freeze({ render });
})(window.OrcApp);
