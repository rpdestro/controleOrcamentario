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
      alertas: []
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
            secretarias: ordenarSecretarias(salvo.secretarias.map((s) => criarSecretaria(s)))
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
  function confirmarAlteracao(motivo) {
    estado.meta.alteradoEm = new Date().toISOString();
    const salvo = persistir();
    eventos.emit('estado:alterado', { motivo, salvo });
  }

  /* -------------------------------- Consultas -------------------------------- */

  const getEstado = () => estado;
  const getSecretarias = () => estado.secretarias;
  const getSecretaria = (codigo) => estado.secretarias.find((s) => s.codigo === codigo) || null;
  const temDados = () => estado.secretarias.some((s) => s.linhas.length > 0);

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
      alertas: importacao.alertas || []
    };
    sincronizarReferencia();
    confirmarAlteracao('importacao');
  }

  /**
   * Aplica a atualização oficial do Fiorilli (secretarias já calculadas por
   * App.data.fiorilli.aplicar) e registra os dados do arquivo utilizado.
   */
  function aplicarFiorilli(secretarias, metaFiorilli) {
    estado.secretarias = ordenarSecretarias(secretarias.map((s) => criarSecretaria(s)));
    estado.meta.fiorilli = { ...metaFiorilli, aplicadoEm: new Date().toISOString() };
    confirmarAlteracao('fiorilli');
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
    estado.secretarias = ordenarSecretarias(estado.secretarias);
    confirmarAlteracao('secretaria:editada');
  }

  function removerSecretaria(codigo) {
    estado.secretarias = estado.secretarias.filter((s) => s.codigo !== codigo);
    confirmarAlteracao('secretaria:removida');
  }

  /** Apaga todos os dados locais e volta à lista padrão de secretarias. */
  function limparTudo() {
    estado = estadoInicial();
    confirmarAlteracao('limpeza');
  }

  App.data.store = Object.freeze({
    carregar, getEstado, getSecretarias, getSecretaria, temDados,
    substituirDados, aplicarFiorilli, getColunasFiorilli, definirColunasFiorilli, getFiltroReservas, definirFiltroReservas, salvarLinha, removerLinha, incorporarPendente, definirFolha,
    adicionarSecretaria, atualizarSecretaria, removerSecretaria, limparTudo
  });
})(window.OrcApp);
