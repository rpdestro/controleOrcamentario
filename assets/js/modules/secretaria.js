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
 *  - incorporar lançamentos "fora do quadro";
 *  - (v1.4) transferir recursos entre fichas, ver a situação de cada ficha
 *    e o histórico de movimentações;
 *  - (v1.5) situação em três níveis (Positivo / Déficit / Atende), com
 *    botões de filtro e ordenação por situação acima da tabela.
 *
 * Os valores exibidos são PROJETADOS (oficial + movimentações); edição e
 * exclusão de linhas sempre trabalham sobre os dados oficiais.
 */
(function (App) {
  'use strict';

  const { criar, limpar } = App.utils.dom;
  const { moeda, numero, paraNumero, dataHoraBR, arredondar } = App.utils.format;
  const { kpi, varianteSinal, tabela, cabecalhoPagina, botao, campo, aplicarErros, resumoErros, alerta, estadoVazio, seloSituacao } = App.ui.componentes;
  const mov = App.data.movimentacoes;
  const animacao = App.ui.animacao;
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
    if (!filtros.has(codigo)) filtros.set(codigo, { busca: '', periodo: '', ordemSituacao: '', colunas: filtroTabela.criarEstado() });
    return filtros.get(codigo);
  };

  /* ------------------------------- Indicadores ------------------------------- */

  /**
   * KPIs calculados sobre as linhas VISÍVEIS (após todos os filtros).
   * Com qualquer filtro ativo a Folha não é somada (é um valor global da secretaria).
   */
  function totaisVisiveis(secretaria, visiveis, algumFiltro) {
    return calculos.totaisSecretaria({ ...secretaria, linhas: visiveis }, { colunasAtivas: algumFiltro });
  }

  /** Fichas (resumos) presentes num conjunto de linhas, sem repetição. */
  const fichasDasLinhas = (linhas, fichas) => [...new Set(linhas.map((l) => l.ficha))].map((f) => fichas.get(f)).filter(Boolean);

  /** KPI "Fichas em déficit" entre as fichas exibidas (com a contagem das que apenas atendem). */
  function kpiAlerta(visiveis, fichas) {
    const exibidas = fichasDasLinhas(visiveis, fichas);
    const deficit = exibidas.filter((f) => mov.ehGrave(f.situacao)).length;
    const atende = exibidas.filter((f) => f.situacao === 'atende').length;
    return kpi({
      rotulo: 'Fichas em déficit', valor: String(deficit), variante: deficit ? 'negativo' : 'positivo', testid: 'kpi-sec-alerta',
      dica: `${atende} atende(m) sem sobra · ${exibidas.length - deficit - atende} positiva(s)`
    });
  }

  function blocoKpis(secretaria, visiveis, algumFiltro, fichas) {
    const t = totaisVisiveis(secretaria, visiveis, algumFiltro);
    return criar('section', {
      classe: 'kpis',
      testid: 'secretaria-kpis',
      attrs: { 'aria-label': 'Indicadores da secretaria' },
      filhos: [
        kpi({ rotulo: 'Essencial', valor: moeda(t.essencial), variante: 'negativo', testid: 'kpi-sec-essencial' }),
        kpi({ rotulo: 'Reserva', valor: moeda(t.reserva), variante: 'positivo', testid: 'kpi-sec-reserva' }),
        kpi({ rotulo: 'Saldo Ficha', valor: moeda(t.saldoFicha), variante: 'positivo', testid: 'kpi-sec-saldo' }),
        kpi({ rotulo: 'Folha', valor: moeda(t.folha), variante: 'negativo', testid: 'kpi-sec-folha' }),
        kpi({ rotulo: 'Resultado', valor: moeda(t.resultado), variante: varianteSinal(t.resultado), testid: 'kpi-sec-resultado', dica: `${t.qtdLinhas} linhas · ${t.qtdFichas} fichas` }),
        kpiAlerta(visiveis, fichas)
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

  /** Abre a transferência com a ficha como origem; ao concluir, devolve o foco ao botão. */
  function abrirTransferencia(codigo, fichaResumo) {
    App.modules.transferencia.abrir({
      origem: { secretaria: codigo, ficha: fichaResumo.ficha },
      aoConcluir: () => {
        const alvo = document.querySelector(`[data-testid="btn-transferir-${CSS.escape(fichaResumo.idAncora)}"]`);
        if (alvo) alvo.focus({ preventScroll: true });
      }
    });
  }

  /**
   * Ações da linha. `linha` é a projetada (exibida); editar/excluir usam a linha OFICIAL.
   * "Transferir" aparece só na linha-âncora da ficha (onde ficam Reserva e Saldo).
   */
  function acoesLinha(secretaria, linha, fichaResumo) {
    const oficial = secretaria.linhas.find((l) => l.id === linha.id) || linha;
    const ancora = fichaResumo && fichaResumo.idAncora === linha.id;
    const semSaldo = ancora && fichaResumo.saldoFicha <= 0 && fichaResumo.reserva <= 0;
    return criar('div', {
      classe: 'tabela__acoes',
      filhos: [
        botao({ rotulo: 'Editar', tamanho: 'pequeno', variante: 'fantasma', testid: `btn-editar-linha-${linha.id}`, attrs: { 'aria-label': `Editar ficha ${linha.ficha} ${linha.descricao}` }, aoClicar: () => abrirFormularioLinha(secretaria, oficial) }),
        botao({ rotulo: 'Excluir', tamanho: 'pequeno', variante: 'perigo-texto', testid: `btn-excluir-linha-${linha.id}`, attrs: { 'aria-label': `Excluir ficha ${linha.ficha} ${linha.descricao}` }, aoClicar: () => excluirLinha(secretaria, oficial) }),
        ancora ? botao({
          rotulo: 'Transferir', tamanho: 'pequeno', variante: 'secundario', testid: `btn-transferir-${linha.id}`,
          attrs: {
            'aria-label': `Transferir recursos da ficha ${linha.ficha}`,
            title: semSaldo ? 'Ficha sem saldo para transferir' : 'Mover Saldo Ficha e/ou Reserva para outra ficha',
            disabled: semSaldo || null
          },
          aoClicar: () => abrirTransferencia(secretaria.codigo, fichaResumo)
        }) : null
      ]
    });
  }

  /**
   * Célula de Reserva/Saldo: valor projetado (animável) e, se houve
   * movimentação, o valor oficial e a variação logo abaixo.
   */
  function celulaValor(campoValor) {
    return (linha) => {
      const valor = criar('span', { classe: 'valor-animavel', texto: moeda(linha[campoValor]), attrs: { 'data-campo': campoValor } });
      const variacao = linha.movimentado && linha.movimentado[campoValor];
      if (!variacao) return valor;
      return criar('span', {
        filhos: [
          valor,
          criar('small', {
            classe: `tabela__anotacao tabela__variacao valor--${variacao > 0 ? 'positivo' : 'negativo'}`,
            texto: `${variacao > 0 ? '+' : '−'}${moeda(Math.abs(variacao))} · oficial ${moeda(linha.oficial[campoValor])}`
          })
        ]
      });
    };
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
    { rotulo: 'Reserva', chave: 'reserva', moeda: true, filtravel: true, render: celulaValor('reserva') },
    { rotulo: 'Saldo Ficha', chave: 'saldoFicha', moeda: true, filtravel: true, render: celulaValor('saldoFicha') }
  ]);

  /* --------------------------- Filtro por situação ---------------------------- */

  /** Ordem de exibição dos botões de situação (definida pelo usuário: Positivo, Déficit, Atende). */
  const ORDEM_BOTOES_SITUACAO = Object.freeze(['positivo', 'deficit', 'atende']);
  const ID_COLUNA_SITUACAO = 'situacao';
  const rotuloSituacao = (chave) => config.SITUACOES_FICHA[chave].rotulo;

  /**
   * Opções de ordenação por situação: a escolhida vem primeiro e as demais
   * seguem a ordem dos botões. '' = ordem original da tabela (por ficha).
   */
  const ORDENACOES_SITUACAO = Object.freeze([
    { valor: '', rotulo: 'Ordem da tabela' },
    ...ORDEM_BOTOES_SITUACAO.map((s) => ({ valor: s, rotulo: `${rotuloSituacao(s)} primeiro` }))
  ]);

  /** Sequência de situações para a ordenação escolhida. */
  const sequenciaSituacao = (primeira) => (primeira
    ? [primeira, ...ORDEM_BOTOES_SITUACAO.filter((s) => s !== primeira)]
    : ORDEM_BOTOES_SITUACAO);

  /**
   * Barra "Situação das fichas": botões alternáveis (com a quantidade de fichas)
   * e seletor de ordenação. Usa o MESMO estado do filtro de coluna "Situação",
   * então os dois ficam sempre sincronizados.
   * @param {Array} base linhas após busca/competência (antes dos filtros de coluna)
   */
  function barraSituacao({ filtro, base, fichas, aoAlterar }) {
    const todos = ORDEM_BOTOES_SITUACAO.map(rotuloSituacao);
    const marcados = filtro.colunas.selecoes[ID_COLUNA_SITUACAO] || null;
    const contagem = {};
    fichasDasLinhas(base, fichas).forEach((f) => { contagem[f.situacao] = (contagem[f.situacao] || 0) + 1; });

    const selecionar = (rotulos) => {
      const novos = rotulos.length ? rotulos : null;
      filtro.colunas = filtroTabela.definirSelecao(filtro.colunas, ID_COLUNA_SITUACAO, novos, todos);
      aoAlterar();
    };
    const alternar = (rotulo) => {
      const atuais = marcados || [];
      selecionar(atuais.includes(rotulo) ? atuais.filter((r) => r !== rotulo) : todos.filter((r) => r === rotulo || atuais.includes(r)));
    };

    const botaoFiltro = ({ rotulo, quantidade, ativo, classe, testid, aoClicar }) => {
      // A barra é redesenhada a cada clique: devolve o foco ao botão equivalente (teclado).
      const clicar = () => {
        aoClicar();
        const novo = document.querySelector(`[data-testid="${testid}"]`);
        if (novo) novo.focus({ preventScroll: true });
      };
      const el = botao({ rotulo: `${rotulo} (${quantidade})`, tamanho: 'pequeno', variante: 'fantasma', testid, attrs: { 'aria-pressed': String(ativo) }, aoClicar: clicar });
      el.classList.add('filtro-situacao__botao', ...[classe, ativo ? 'filtro-situacao__botao--ativo' : ''].filter(Boolean));
      return el;
    };

    // A classificação pode ter sido trocada pelo menu de outra coluna: aí o seletor volta a "Ordem da tabela".
    const ordemAtiva = filtro.colunas.ordem && filtro.colunas.ordem.coluna === ID_COLUNA_SITUACAO ? filtro.ordemSituacao : '';
    const ordenar = campo({
      id: 'sec-ordem-situacao', nome: 'ordemSituacao', rotulo: 'Ordenar por situação', tipo: 'select',
      valor: ordemAtiva, testid: 'select-secretaria-ordem-situacao', opcoes: ORDENACOES_SITUACAO
    });
    ordenar.querySelector('select').addEventListener('change', (e) => {
      filtro.ordemSituacao = e.target.value;
      filtro.colunas = filtro.ordemSituacao
        ? filtroTabela.definirOrdem(filtro.colunas, ID_COLUNA_SITUACAO, 'asc')
        : { ...filtro.colunas, ordem: null };
      aoAlterar();
    });

    const totalFichas = Object.values(contagem).reduce((t, n) => t + n, 0);
    return criar('div', {
      classe: 'filtro-situacao',
      testid: 'secretaria-filtro-situacao',
      filhos: [
        criar('div', {
          classe: 'filtro-situacao__grupo',
          attrs: { role: 'group', 'aria-label': 'Filtrar fichas por situação' },
          filhos: [
            criar('span', { classe: 'form__rotulo', texto: 'Situação das fichas:' }),
            botaoFiltro({ rotulo: 'Todas', quantidade: totalFichas, ativo: !marcados, classe: '', testid: 'btn-situacao-todas', aoClicar: () => selecionar([]) }),
            ...ORDEM_BOTOES_SITUACAO.map((s) => botaoFiltro({
              rotulo: `${config.SITUACOES_FICHA[s].icone} ${rotuloSituacao(s)}`, quantidade: contagem[s] || 0,
              ativo: Boolean(marcados && marcados.includes(rotuloSituacao(s))), classe: `filtro-situacao__botao--${s}`,
              testid: `btn-situacao-${s}`, aoClicar: () => alternar(rotuloSituacao(s))
            }))
          ]
        }),
        ordenar
      ]
    });
  }

  /**
   * Colunas da tabela principal: base + "Situação" da ficha (filtrável:
   * permite exibir só as fichas em déficit, por exemplo). O selo aparece na
   * linha-âncora; todas as linhas da ficha filtram pela mesma situação.
   * @param {Map} fichas ficha -> resumo (movimentacoes.resumirFichas)
   * @param {string} [ordemSituacao] situação que vem primeiro na classificação
   */
  function colunasLinhas(fichas, ordemSituacao = '') {
    const situacao = (l) => (fichas.get(l.ficha) || { situacao: 'positivo' }).situacao;
    const sequencia = sequenciaSituacao(ordemSituacao);
    return [
      ...COLUNAS_BASE,
      {
        // Informativo: (Saldo Ficha + Reserva) − Essencial da ficha, na linha-âncora.
        // Não entra nos totais, indicadores nem na Folha.
        rotulo: 'Saldo Total', id: 'saldoTotal', moeda: true,
        render: (l) => {
          const f = fichas.get(l.ficha);
          if (!f || f.idAncora !== l.id) return '';
          const total = arredondar(f.disponivel - f.necessidade);
          return criar('span', { classe: `valor valor--${varianteSinal(total)}`, texto: moeda(total), testid: `saldo-total-ficha-${f.ficha}` });
        }
      },
      {
        rotulo: 'Situação', id: ID_COLUNA_SITUACAO, filtravel: true, classe: 'tabela__celula--nowrap',
        valorFiltro: (l) => rotuloSituacao(situacao(l)),
        valorOrdem: (l) => sequencia.indexOf(situacao(l)),
        render: (l) => {
          const f = fichas.get(l.ficha);
          if (!f || f.idAncora !== l.id) return '';
          const falta = f.necessidade - f.disponivel;
          return seloSituacao(f.situacao, { complemento: f.situacao === 'deficit' ? `−${moeda(falta)}` : '', testid: `situacao-ficha-${f.ficha}` });
        }
      }
    ];
  }

  /**
   * Classes das linhas: faixa alternada a cada nova ficha (agrupamento visual)
   * e, na linha-âncora, a borda colorida da situação da ficha.
   */
  function classificadorFichas(linhas, fichas) {
    let faixa = false;
    let anterior = null;
    const mapa = new Map();
    linhas.forEach((l) => {
      if (l.ficha !== anterior) { faixa = !faixa; anterior = l.ficha; }
      const f = fichas.get(l.ficha);
      const situacao = f && f.idAncora === l.id ? `tabela__linha--sit-${f.situacao}` : '';
      mapa.set(l.id, [faixa ? 'tabela__linha--faixa' : '', situacao].filter(Boolean).join(' '));
    });
    return (linha) => mapa.get(linha.id);
  }

  /**
   * Tabela de linhas com filtros de coluna (estilo Excel).
   * @param {Object} oficial  secretaria oficial (para editar/excluir)
   * @param {Object} projetada secretaria com as movimentações aplicadas (exibida)
   * @param {Array} base     linhas após busca/período (antes dos filtros de coluna)
   * @param {Array} visiveis linhas após todos os filtros
   */
  function tabelaLinhas({ oficial, projetada, fichas, colunas: colunasDados, filtro, base, visiveis, aoAlterarColunas }) {
    if (!projetada.linhas.length) {
      return alerta({ nivel: 'info', testid: 'secretaria-sem-linhas', mensagem: 'Nenhuma despesa cadastrada para esta secretaria.' });
    }
    const soma = calculos.somarLinhas(visiveis);
    const colunas = [...colunasDados, { rotulo: 'Ações', id: 'acoes', render: (l) => acoesLinha(oficial, l, fichas.get(l.ficha)) }];
    return tabela({
      testid: 'tabela-linhas',
      legenda: `Despesas da secretaria ${projetada.codigo} — exibindo ${visiveis.length} de ${projetada.linhas.length} linhas`,
      colunas,
      linhas: visiveis,
      classeLinha: classificadorFichas(visiveis, fichas),
      atributosLinha: (l) => ({ 'data-id': l.id, 'data-ficha': l.ficha }),
      filtro: { estado: filtro.colunas, linhasBase: base, aoAlterar: aoAlterarColunas },
      rodape: ['', '', '', '', visiveis.length ? 'Totais' : 'Nenhuma linha corresponde aos filtros', '', moeda(soma.essencial), moeda(soma.reserva), moeda(soma.saldoFicha), '', '', '']
    });
  }

  /* ------------------------------ Movimentações ------------------------------ */

  async function desfazer(t) {
    const confirmado = await modal.confirmar({
      titulo: 'Desfazer transferência',
      mensagem: `Desfazer a transferência de ${App.modules.transferencia.descreverValores(t)} da ficha ${t.origem.ficha} (${t.origem.secretaria}) para a ficha ${t.destino.ficha} (${t.destino.secretaria})?`,
      rotuloConfirmar: 'Desfazer',
      perigo: true,
      testid: 'modal-desfazer-transferencia'
    });
    if (!confirmado) return;
    try {
      store.desfazerTransferencia(t.id);
      toast.sucesso('Transferência desfeita.');
    } catch (erro) {
      toast.erro(erro.message);
    }
  }

  /**
   * Histórico das movimentações que envolvem a secretaria (como origem ou destino).
   * Sinaliza lançamentos anteriores à última atualização Fiorilli (podem já estar
   * refletidos nos saldos oficiais) e lançamentos órfãos (ficha não existe mais).
   */
  function secaoMovimentacoes(codigo) {
    const todas = store.getTransferencias();
    const lista = todas.filter((t) => t.origem.secretaria === codigo || t.destino.secretaria === codigo).reverse();
    if (!lista.length) return null;
    const fiorilli = store.getEstado().meta.fiorilli;
    const orfas = new Set(mov.listarOrfas(store.getSecretarias(), todas).map((t) => t.id));
    const instrumento = (valor) => (App.core.config.INSTRUMENTOS_TRANSFERENCIA.find((i) => i.valor === valor) || { rotulo: valor }).rotulo.replace(/ \(.*\)$/, '');
    const ponto = (p) => `${p.secretaria === codigo ? '' : `${p.secretaria} · `}Ficha ${p.ficha}`;
    const sinal = (t, c) => (t.origem.secretaria === codigo && t.destino.secretaria !== codigo ? -t[c] : t[c]);

    return criar('section', {
      classe: 'cartao',
      testid: 'secretaria-movimentacoes',
      filhos: [
        criar('h2', { classe: 'cartao__titulo', texto: `Movimentações registradas (${lista.length})` }),
        criar('p', { classe: 'cartao__descricao', texto: 'Transferências simuladas sobre os saldos oficiais (Fiorilli/planilha), que não são alterados. "Desfazer" devolve os valores.' }),
        tabela({
          testid: 'tabela-movimentacoes',
          legenda: 'Movimentações da secretaria (mais recentes primeiro)',
          colunas: [
            {
              rotulo: 'Data', render: (t) => criar('span', {
                filhos: [
                  dataHoraBR(t.data),
                  fiorilli && t.data < fiorilli.aplicadoEm ? criar('small', { classe: 'tabela__anotacao', texto: '⚠ anterior à última atualização Fiorilli — verifique se já foi efetivada' }) : null,
                  orfas.has(t.id) ? criar('small', { classe: 'tabela__anotacao', texto: '⚠ ficha não encontrada na base atual' }) : null
                ]
              })
            },
            { rotulo: 'Origem', render: (t) => ponto(t.origem) },
            { rotulo: 'Destino', render: (t) => ponto(t.destino) },
            { rotulo: 'Saldo Ficha', moeda: true, render: (t) => (t.saldoFicha ? moeda(sinal(t, 'saldoFicha')) : '—') },
            { rotulo: 'Reserva', moeda: true, render: (t) => (t.reserva ? moeda(sinal(t, 'reserva')) : '—') },
            { rotulo: 'Instrumento', render: (t) => instrumento(t.instrumento) },
            { rotulo: 'Motivo', classe: 'tabela__celula--descricao', render: (t) => t.motivo || '—' },
            {
              rotulo: 'Ações', render: (t) => botao({
                rotulo: 'Desfazer', tamanho: 'pequeno', variante: 'perigo-texto', testid: `btn-desfazer-transferencia-${t.id}`,
                attrs: { 'aria-label': `Desfazer transferência da ficha ${t.origem.ficha} para a ficha ${t.destino.ficha}` },
                aoClicar: () => desfazer(t)
              })
            }
          ],
          linhas: lista
        })
      ]
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
        filtro.ordemSituacao = '';
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

    // Região que muda com os filtros e as transferências (evita perder o foco do campo de busca).
    const regiaoDinamica = criar('div', { classe: 'secretaria__dinamica' });
    let anteriores = null; // { valores: Map(id -> {reserva, saldoFicha}), totais } da última exibição

    /** @param {{animar?:boolean}} [opcoes] animar = destacar fichas cujo saldo mudou */
    const atualizar = ({ animar = false } = {}) => {
      const projetada = store.getSecretariaProjetada(codigo) || secretaria;
      const fichas = new Map(mov.resumirFichas(projetada).map((f) => [f.ficha, f]));
      const colunas = colunasLinhas(fichas, filtro.ordemSituacao);
      // 1) busca + competência  2) filtros de coluna (Excel) + classificação
      const base = calculos.filtrarLinhas(projetada.linhas, filtro);
      const visiveis = filtroTabela.aplicar(base, colunas, filtro.colunas);
      const algumFiltro = calculos.filtroAtivo(filtro) || filtroTabela.temFiltro(filtro.colunas);
      const aoAlterarColunas = (novoEstado) => { filtro.colunas = novoEstado; atualizar(); };

      limpar(regiaoDinamica);
      regiaoDinamica.append(...[
        avisoNaoPadronizados(projetada, filtro, atualizar),
        algumFiltro ? alerta({ nivel: 'info', testid: 'secretaria-filtro-ativo', mensagem: `Filtro ativo: exibindo ${visiveis.length} de ${projetada.linhas.length} linhas. Os indicadores consideram apenas as linhas exibidas (Folha desconsiderada).` }) : null,
        blocoKpis(projetada, visiveis, algumFiltro, fichas),
        criar('section', {
          classe: 'cartao',
          filhos: [
            projetada.linhas.length ? barraSituacao({ filtro, base, fichas, aoAlterar: atualizar }) : null,
            tabelaLinhas({ oficial: secretaria, projetada, fichas, colunas, filtro, base, visiveis, aoAlterarColunas })
          ]
        }),
        secaoMovimentacoes(codigo)
      ].filter(Boolean));

      const atuais = {
        valores: new Map(projetada.linhas.map((l) => [l.id, { reserva: l.reserva, saldoFicha: l.saldoFicha }])),
        totais: totaisVisiveis(projetada, visiveis, algumFiltro)
      };
      if (animar && anteriores) animarMudancas(regiaoDinamica, anteriores, atuais);
      anteriores = atuais;
    };

    container.append(
      criar('div', { classe: 'secretaria__ferramentas', filhos: [barraFiltros(secretaria, filtro, atualizar), formularioFolha(secretaria)] }),
      regiaoDinamica
    );
    atualizar();
    const pendentes = secaoPendentes(secretaria);
    if (pendentes) container.append(pendentes);

    contexto = { codigo, regiao: regiaoDinamica, atualizar };
  }

  /* --------------------------- Atualização reativa ---------------------------- */

  /** Tela de secretaria ativa (para atualizações parciais). */
  let contexto = null;

  /**
   * Após uma transferência: conta os valores alterados até o novo saldo e
   * destaca a linha (verde = entrada, vermelho = saída). Indicadores também contam.
   */
  function animarMudancas(regiao, antes, depois) {
    depois.valores.forEach((novo, id) => {
      const velho = antes.valores.get(id);
      if (!velho) return;
      const variacao = (novo.reserva - velho.reserva) + (novo.saldoFicha - velho.saldoFicha);
      if (!variacao) return;
      const linha = regiao.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
      if (!linha) return; // oculta pelos filtros
      mov.CAMPOS.forEach((c) => animacao.contar(linha.querySelector(`[data-campo="${c}"]`), velho[c], novo[c], moeda));
      animacao.destacar(linha, variacao > 0 ? 'tabela__linha--entrada' : 'tabela__linha--saida');
    });
    [['reserva', 'kpi-sec-reserva'], ['saldoFicha', 'kpi-sec-saldo'], ['resultado', 'kpi-sec-resultado']].forEach(([campoTotal, testid]) => {
      const el = regiao.querySelector(`[data-testid="${testid}-valor"]`);
      if (antes.totais[campoTotal] !== depois.totais[campoTotal]) {
        animacao.contar(el, antes.totais[campoTotal], depois.totais[campoTotal], moeda);
        animacao.destacar(el, 'kpi__valor--alterado');
      }
    });
  }

  /**
   * Chamado pelo roteador a cada 'estado:alterado'. Transferências (e desfazer)
   * atualizam só a região dinâmica, com animação, sem redesenhar a página.
   * @returns {boolean} true se a alteração foi tratada aqui
   */
  function aoAlterarEstado(evento, params) {
    if (!String(evento.motivo || '').startsWith('transferencia')) return false;
    if (!contexto || contexto.codigo !== params.codigo || !contexto.regiao.isConnected) return false;
    contexto.atualizar({ animar: true });
    return true;
  }

  App.modules.secretaria = Object.freeze({ render, aoAlterarEstado });
})(window.OrcApp);
