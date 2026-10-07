/**
 * @file store.js
 * @description Estado central da aplicação + persistência local.
 *
 * Banco de dados:
 *  - Fonte oficial: planilha Excel (importada e salva via "Salvar base").
 *  - Cache de trabalho: localStorage do navegador (autossalvamento a cada
 *    alteração), para que nada se perca ao fechar a página.
 *
 * Toda mutação passa por este módulo e dispara 'estado:alterado'.
 */
(function (App) {
  'use strict';

  const config = App.core.config;
  const eventos = App.core.events;
  const { criarSecretaria, criarLinha, ordenarSecretarias, definirReferencia } = App.data.schema;
  const periodo = App.utils.periodo;
  const movimentacoes = App.data.movimentacoes;

  let estado = estadoInicial();

  function estadoInicial() {
    return {
      versao: config.VERSAO_DADOS,
      meta: { arquivo: '', atualizadoEm: '', importadoEm: '', alteradoEm: '', fiorilli: null },
      preferencias: {
        colunasFiorilli: { ...config.FIORILLI_COLUNAS_PADRAO },
        filtroReservas: filtroPadrao()
      },
      secretarias: config.SECRETARIAS_PADRAO.map((s) => criarSecretaria(s)),
      alertas: [],
      transferencias: [], // v1.4: livro de movimentações (ver data/movimentacoes.js)
      // v1.5: ficha -> composição da Reserva por processo × fonte (última atualização Fiorilli)
      composicaoReservas: {}
    };
  }

  function filtroPadrao() {
    const { processos, fontes } = config.FILTRO_RESERVAS_PADRAO;
    return { processos: [...processos], fontes: [...fontes] };
  }

  /**
   * Colunas salvas pela v1.1 (layout "SaldoDotacao", sem a coluna Processo)
   * não servem para o relatório de reservas: voltam ao padrão atual.
   */
  function colunasSalvas(preferencias) {
    const salvas = (preferencias || {}).colunasFiorilli;
    if (!salvas || !('processo' in salvas)) return { ...config.FIORILLI_COLUNAS_PADRAO };
    return { ...config.FIORILLI_COLUNAS_PADRAO, ...salvas };
  }

  function filtroSalvo(preferencias) {
    const salvo = (preferencias || {}).filtroReservas;
    if (!salvo) return filtroPadrao();
    return { processos: [...(salvo.processos || [])], fontes: [...(salvo.fontes || [])] };
  }

  /** O mês de referência dos períodos acompanha a data da base importada. */
  function sincronizarReferencia() {
    definirReferencia(periodo.referenciaDe(estado.meta.atualizadoEm));
  }

  /* ------------------------------ Persistência ------------------------------ */

  function persistir() {
    try {
      localStorage.setItem(config.STORAGE_KEY, JSON.stringify(estado));
      return true;
    } catch (erro) {
      console.warn('[store] Não foi possível salvar no navegador:', erro);
      return false;
    }
  }

  /** Carrega o estado salvo; em caso de dados corrompidos, volta ao inicial. */
  function carregar() {
    try {
      const bruto = localStorage.getItem(config.STORAGE_KEY);
      if (bruto) {
        const salvo = JSON.parse(bruto);
        if (salvo && salvo.versao === config.VERSAO_DADOS && Array.isArray(salvo.secretarias)) {
          const inicial = estadoInicial();
          definirReferencia(periodo.referenciaDe(salvo.meta && salvo.meta.atualizadoEm));
          estado = {
            ...inicial,
            ...salvo,
            meta: { ...inicial.meta, ...salvo.meta },
            preferencias: {
              colunasFiorilli: colunasSalvas(salvo.preferencias),
              filtroReservas: filtroSalvo(salvo.preferencias)
            },
            // Dados salvos pela v1.0 têm período em texto livre: criarLinha converte para o padrão.
            secretarias: ordenarSecretarias(salvo.secretarias.map((s) => criarSecretaria(s))),
            // Campo novo da v1.4 (aditivo): dados antigos começam sem movimentações.
            transferencias: Array.isArray(salvo.transferencias) ? salvo.transferencias.map(movimentacoes.criar) : [],
            // Campo novo da v1.5 (aditivo): sem composição, o filtro vale só na próxima atualização Fiorilli.
            composicaoReservas: salvo.composicaoReservas && typeof salvo.composicaoReservas === 'object' ? salvo.composicaoReservas : {}
          };
        }
      }
    } catch (erro) {
      console.warn('[store] Dados locais inválidos; iniciando vazio.', erro);
      estado = estadoInicial();
    }
    sincronizarReferencia();
    return estado;
  }

  /** Registra a alteração, persiste e notifica a interface. */
  function confirmarAlteracao(motivo, detalhes = {}) {
    estado.meta.alteradoEm = new Date().toISOString();
    const salvo = persistir();
    eventos.emit('estado:alterado', { ...detalhes, motivo, salvo });
  }

  /**
   * Alteração "tudo ou nada": aplica, persiste e só então notifica.
   * Se o navegador não conseguir salvar, desfaz a alteração em memória e lança erro.
   * @param {Function} aplicar   executa a mutação e devolve a função que a desfaz
   */
  function alterarComSeguranca(motivo, detalhes, aplicar) {
    const alteradoAntes = estado.meta.alteradoEm;
    const desfazer = aplicar();
    estado.meta.alteradoEm = new Date().toISOString();
    if (!persistir()) {
      desfazer();
      estado.meta.alteradoEm = alteradoAntes;
      throw new Error('Não foi possível salvar no navegador (armazenamento cheio ou bloqueado). Nada foi alterado.');
    }
    eventos.emit('estado:alterado', { ...detalhes, motivo, salvo: true });
  }

  /** Erro de validação com mensagens por campo ({ campo: mensagem }). */
  function erroValidacao(erros) {
    const erro = new Error(Object.values(erros)[0]);
    erro.erros = erros;
    return erro;
  }

  /* -------------------------------- Consultas -------------------------------- */

  const getEstado = () => estado;
  const getSecretarias = () => estado.secretarias;
  const getSecretaria = (codigo) => estado.secretarias.find((s) => s.codigo === codigo) || null;
  const temDados = () => estado.secretarias.some((s) => s.linhas.length > 0);

  /* Movimentações (v1.4): os valores oficiais não mudam; as telas exibem a projeção. */
  const getTransferencias = () => [...estado.transferencias];
  const getSecretariasProjetadas = () => movimentacoes.projetar(estado.secretarias, estado.transferencias);
  const getSecretariaProjetada = (codigo) => getSecretariasProjetadas().find((s) => s.codigo === codigo) || null;

  function exigirSecretaria(codigo) {
    const secretaria = getSecretaria(codigo);
    if (!secretaria) throw new Error(`Secretaria ${codigo} não encontrada.`);
    return secretaria;
  }

  /* -------------------------------- Mutações -------------------------------- */

  /**
   * Substitui os dados pelo resultado de uma importação.
   * Secretarias cadastradas que não vieram no arquivo são mantidas (vazias).
   */
  function substituirDados(importacao) {
    const importadas = new Map(importacao.secretarias.map((s) => [s.codigo, s]));
    const mantidas = estado.secretarias
      .filter((s) => !importadas.has(s.codigo))
      .map((s) => criarSecretaria({ codigo: s.codigo, nome: s.nome }));

    estado = {
      ...estado,
      meta: { ...importacao.meta, alteradoEm: '', fiorilli: null },
      secretarias: ordenarSecretarias([...importadas.values(), ...mantidas]),
      alertas: importacao.alertas || [],
      // A Reserva volta a ser a da planilha: a composição do Fiorilli deixa de valer.
      composicaoReservas: {}
    };
    sincronizarReferencia();
    confirmarAlteracao('importacao');
  }

  /**
   * Aplica a atualização oficial do Fiorilli (secretarias já calculadas por
   * App.data.fiorilli.aplicar) e registra os dados do arquivo utilizado.
   * @param {Object} [extras]
   * @param {Object} [extras.composicoes] ficha -> composição da Reserva (v1.5)
   * @param {Object} [extras.filtroPadrao] grava também o filtro usado como padrão
   */
  function aplicarFiorilli(secretarias, metaFiorilli, { composicoes, filtroPadrao } = {}) {
    estado.secretarias = ordenarSecretarias(secretarias.map((s) => criarSecretaria(s)));
    estado.meta.fiorilli = { ...metaFiorilli, aplicadoEm: new Date().toISOString() };
    if (composicoes) estado.composicaoReservas = composicoes;
    if (filtroPadrao) estado.preferencias.filtroReservas = { processos: [...filtroPadrao.processos], fontes: [...filtroPadrao.fontes] };
    confirmarAlteracao('fiorilli');
  }

  const getComposicaoReservas = () => estado.composicaoReservas;
  const temComposicaoReservas = () => Object.keys(estado.composicaoReservas).length > 0;

  /**
   * Grava o filtro de reservas e as secretarias com a Reserva recalculada
   * (App.data.fiorilli.aplicarRecalculo) numa única alteração "tudo ou nada".
   */
  function recalcularReservas({ processos, fontes }, secretarias) {
    alterarComSeguranca('reservas:recalculadas', {}, () => {
      const anteriores = { secretarias: estado.secretarias, filtro: estado.preferencias.filtroReservas };
      estado.secretarias = ordenarSecretarias(secretarias.map((s) => criarSecretaria(s)));
      estado.preferencias.filtroReservas = { processos: [...processos], fontes: [...fontes] };
      return () => { estado.secretarias = anteriores.secretarias; estado.preferencias.filtroReservas = anteriores.filtro; };
    });
  }

  const getColunasFiorilli = () => ({ ...estado.preferencias.colunasFiorilli });

  function definirColunasFiorilli(colunas) {
    estado.preferencias.colunasFiorilli = Object.fromEntries(
      Object.entries(colunas).map(([campo, letra]) => [campo, String(letra).trim().toUpperCase()])
    );
    confirmarAlteracao('preferencias:fiorilli');
  }

  const getFiltroReservas = () => filtroSalvo(estado.preferencias);

  /** Processos e fontes cujas notas compõem a Reserva (listas já normalizadas). */
  function definirFiltroReservas({ processos, fontes }) {
    estado.preferencias.filtroReservas = { processos: [...processos], fontes: [...fontes] };
    confirmarAlteracao('preferencias:filtro-reservas');
  }

  /** Inclui (sem id) ou atualiza (com id) uma linha de despesa. */
  function salvarLinha(codigo, dados) {
    const secretaria = exigirSecretaria(codigo);
    const linha = criarLinha(dados);
    const indice = secretaria.linhas.findIndex((l) => l.id === linha.id);
    if (indice >= 0) secretaria.linhas.splice(indice, 1, linha);
    else secretaria.linhas.push(linha);
    confirmarAlteracao(indice >= 0 ? 'linha:editada' : 'linha:incluida');
    return linha;
  }

  function removerLinha(codigo, id) {
    const secretaria = exigirSecretaria(codigo);
    secretaria.linhas = secretaria.linhas.filter((l) => l.id !== id);
    secretaria.pendentes = secretaria.pendentes.filter((l) => l.id !== id);
    confirmarAlteracao('linha:removida');
  }

  /** Move um lançamento "fora do quadro" para o quadro de despesas (passa a somar). */
  function incorporarPendente(codigo, id) {
    const secretaria = exigirSecretaria(codigo);
    const pendente = secretaria.pendentes.find((l) => l.id === id);
    if (!pendente) return;
    secretaria.pendentes = secretaria.pendentes.filter((l) => l.id !== id);
    secretaria.linhas.push(pendente);
    confirmarAlteracao('pendente:incorporado');
  }

  function definirFolha(codigo, valor) {
    exigirSecretaria(codigo).folha = Math.abs(Number(valor) || 0);
    confirmarAlteracao('folha:alterada');
  }

  function adicionarSecretaria({ codigo, nome }) {
    estado.secretarias = ordenarSecretarias([...estado.secretarias, criarSecretaria({ codigo, nome })]);
    confirmarAlteracao('secretaria:incluida');
  }

  function atualizarSecretaria(codigoOriginal, { codigo, nome }) {
    const secretaria = exigirSecretaria(codigoOriginal);
    secretaria.codigo = codigo.trim();
    secretaria.nome = nome.trim();
    // As movimentações acompanham a troca de código da secretaria.
    const renomear = (p) => (p.secretaria === codigoOriginal ? { ...p, secretaria: secretaria.codigo } : p);
    estado.transferencias = estado.transferencias.map((t) => ({ ...t, origem: renomear(t.origem), destino: renomear(t.destino) }));
    estado.secretarias = ordenarSecretarias(estado.secretarias);
    confirmarAlteracao('secretaria:editada');
  }

  function removerSecretaria(codigo) {
    estado.secretarias = estado.secretarias.filter((s) => s.codigo !== codigo);
    confirmarAlteracao('secretaria:removida');
  }

  /* ------------------------------ Transferências ------------------------------ */

  /**
   * Registra uma transferência entre fichas (mesma ou outra secretaria).
   * Valida novamente contra os saldos projetados (a interface também valida),
   * impedindo saldo negativo. Lança erro com `.erros` por campo se inválida.
   * @param {{origem, destino, saldoFicha, reserva, instrumento?, motivo?}} dados
   * @returns {Object} o lançamento gravado
   */
  function transferir(dados) {
    const erros = movimentacoes.validar(getSecretariasProjetadas(), dados);
    if (Object.keys(erros).length) throw erroValidacao(erros);
    const lancamento = movimentacoes.criar(dados);
    alterarComSeguranca('transferencia', { transferencia: lancamento }, () => {
      const anteriores = estado.transferencias;
      estado.transferencias = [...anteriores, lancamento];
      return () => { estado.transferencias = anteriores; };
    });
    return lancamento;
  }

  /**
   * Desfaz (remove) uma transferência. É recusado quando outra movimentação
   * posterior depende do valor (alguma ficha ficaria com saldo negativo).
   */
  function desfazerTransferencia(id) {
    const lancamento = estado.transferencias.find((t) => t.id === id);
    if (!lancamento) return;
    const restantes = estado.transferencias.filter((t) => t.id !== id);
    const antes = new Set(movimentacoes.fichasNegativas(estado.secretarias, estado.transferencias));
    const novas = movimentacoes.fichasNegativas(estado.secretarias, restantes).filter((k) => !antes.has(k));
    if (novas.length) {
      const [secretaria, ficha] = novas[0].split('|');
      throw new Error(`Não é possível desfazer: a ficha ${ficha} (${secretaria}) ficaria com saldo negativo. Desfaça antes as movimentações posteriores que usaram esse valor.`);
    }
    alterarComSeguranca('transferencia:desfeita', { transferencia: lancamento }, () => {
      const anteriores = estado.transferencias;
      estado.transferencias = restantes;
      return () => { estado.transferencias = anteriores; };
    });
  }

  /** Remove todas as movimentações (volta aos saldos oficiais). */
  function limparTransferencias() {
    alterarComSeguranca('transferencia:limpeza', {}, () => {
      const anteriores = estado.transferencias;
      estado.transferencias = [];
      return () => { estado.transferencias = anteriores; };
    });
  }

  /** Apaga todos os dados locais e volta à lista padrão de secretarias. */
  function limparTudo() {
    estado = estadoInicial();
    confirmarAlteracao('limpeza');
  }

  App.data.store = Object.freeze({
    carregar, getEstado, getSecretarias, getSecretaria, temDados,
    getTransferencias, getSecretariasProjetadas, getSecretariaProjetada,
    substituirDados, aplicarFiorilli, getComposicaoReservas, temComposicaoReservas, recalcularReservas, getColunasFiorilli, definirColunasFiorilli, getFiltroReservas, definirFiltroReservas, salvarLinha, removerLinha, incorporarPendente, definirFolha,
    adicionarSecretaria, atualizarSecretaria, removerSecretaria, limparTudo,
    transferir, desfazerTransferencia, limparTransferencias
  });
})(window.OrcApp);
