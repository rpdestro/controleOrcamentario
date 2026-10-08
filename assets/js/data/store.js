/**
 * @file store.js
 * @description Estado central da aplicação + persistência local.
 *
 * Banco de dados:
 *  - Fonte oficial: planilha Excel (importada e salva via "Salvar base").
 *  - Cache de trabalho: localStorage do navegador (autossalvamento a cada
 *    alteração), para que nada se perca ao fechar a página.
 *
 * v1.6 — duas CAMADAS independentes:
 *  - estado.secretarias → camada da PLANILHA (campos do usuário + valores da planilha);
 *  - estado.fiorilli    → camada do FIORILLI (último relatório aplicado; ver data/fiorilli.js).
 * A base exibida (getSecretarias) é a combinação das duas, recalculada a cada
 * alteração. Importar a planilha não apaga o Fiorilli, e vice-versa.
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
  const integracao = App.data.fiorilli;

  /** Campos de uma linha que vêm do Fiorilli quando a ficha está no relatório. */
  const CAMPOS_OFICIAIS_LINHA = Object.freeze(['ue', 'fonte', 'despesa', 'reserva', 'saldoFicha']);

  let estado = estadoInicial();
  let combinadas = []; // base exibida = planilha + Fiorilli (derivada, não é persistida)

  function estadoInicial() {
    return {
      versao: config.VERSAO_DADOS,
      meta: { arquivo: '', atualizadoEm: '', importadoEm: '', alteradoEm: '' },
      preferencias: {
        colunasFiorilli: { ...config.FIORILLI_COLUNAS_PADRAO },
        filtroReservas: filtroPadrao()
      },
      secretarias: config.SECRETARIAS_PADRAO.map((s) => criarSecretaria(s)), // camada da planilha
      alertas: [],
      transferencias: [], // v1.4: livro de movimentações (ver data/movimentacoes.js)
      fiorilli: null // v1.6: camada do Fiorilli (ver data/fiorilli.js → criarCamada)
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

  /** Recalcula a base exibida a partir das duas camadas. */
  function recombinar() {
    combinadas = integracao.combinar(estado.secretarias, estado.fiorilli);
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

  /**
   * Camada Fiorilli do estado salvo. Dados da v1.5 (versão 1) tinham os valores do
   * Fiorilli gravados nas linhas: a camada é reconstruída a partir das composições.
   */
  function camadaSalva(salvo, secretarias, preferencias) {
    if (salvo.versao >= 2) return integracao.normalizarCamada(salvo.fiorilli);
    const meta = (salvo.meta || {}).fiorilli || null;
    return integracao.camadaDaVersaoAnterior(secretarias, salvo.composicaoReservas, meta, [meta && meta.filtro, preferencias.filtroReservas]);
  }

  /** Carrega o estado salvo (migrando versões anteriores); em caso de dados corrompidos, volta ao inicial. */
  function carregar() {
    try {
      const bruto = localStorage.getItem(config.STORAGE_KEY);
      if (bruto) {
        const salvo = JSON.parse(bruto);
        if (salvo && salvo.versao >= 1 && salvo.versao <= config.VERSAO_DADOS && Array.isArray(salvo.secretarias)) {
          const inicial = estadoInicial();
          definirReferencia(periodo.referenciaDe(salvo.meta && salvo.meta.atualizadoEm));
          const preferencias = {
            colunasFiorilli: colunasSalvas(salvo.preferencias),
            filtroReservas: filtroSalvo(salvo.preferencias)
          };
          // Dados salvos pela v1.0 têm período em texto livre: criarLinha converte para o padrão.
          const secretarias = ordenarSecretarias(salvo.secretarias.map((s) => criarSecretaria(s)));
          const { arquivo, atualizadoEm, importadoEm, alteradoEm } = { ...inicial.meta, ...salvo.meta };
          estado = {
            ...inicial,
            meta: { arquivo, atualizadoEm, importadoEm, alteradoEm },
            preferencias,
            secretarias,
            alertas: Array.isArray(salvo.alertas) ? salvo.alertas : [],
            // Campo novo da v1.4 (aditivo): dados antigos começam sem movimentações.
            transferencias: Array.isArray(salvo.transferencias) ? salvo.transferencias.map(movimentacoes.criar) : [],
            fiorilli: camadaSalva(salvo, secretarias, preferencias)
          };
          if (salvo.versao !== config.VERSAO_DADOS) persistir(); // grava já no formato novo
        }
      }
    } catch (erro) {
      console.warn('[store] Dados locais inválidos; iniciando vazio.', erro);
      estado = estadoInicial();
    }
    sincronizarReferencia();
    recombinar();
    return estado;
  }

  /** Registra a alteração, persiste e notifica a interface. */
  function confirmarAlteracao(motivo, detalhes = {}) {
    estado.meta.alteradoEm = new Date().toISOString();
    recombinar();
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
      recombinar();
      throw new Error('Não foi possível salvar no navegador (armazenamento cheio ou bloqueado). Nada foi alterado.');
    }
    recombinar();
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
  /** Base exibida (planilha + Fiorilli). Os valores oficiais já vêm combinados. */
  const getSecretarias = () => combinadas;
  const getSecretaria = (codigo) => combinadas.find((s) => s.codigo === codigo) || null;
  /** Somente a camada da planilha (sem o Fiorilli). */
  const getSecretariasPlanilha = () => estado.secretarias;
  const temDados = () => combinadas.some((s) => s.linhas.length > 0);

  /* Movimentações (v1.4): os valores oficiais não mudam; as telas exibem a projeção. */
  const getTransferencias = () => [...estado.transferencias];
  const getSecretariasProjetadas = () => movimentacoes.projetar(combinadas, estado.transferencias);
  const getSecretariaProjetada = (codigo) => getSecretariasProjetadas().find((s) => s.codigo === codigo) || null;

  /** Camada da planilha da secretaria (é nela que o usuário edita). */
  function exigirSecretaria(codigo) {
    const secretaria = estado.secretarias.find((s) => s.codigo === codigo);
    if (!secretaria) throw new Error(`Secretaria ${codigo} não encontrada.`);
    return secretaria;
  }

  /* ------------------------------ Camada Fiorilli ------------------------------ */

  const getCamadaFiorilli = () => estado.fiorilli;
  const temCamadaFiorilli = () => Boolean(estado.fiorilli);
  /** A ficha está no último relatório do Fiorilli aplicado? (campos oficiais vêm de lá) */
  const fichaNoFiorilli = (ficha) => Boolean(estado.fiorilli && estado.fiorilli.fichas[String(ficha).trim()]);

  /**
   * Situação da camada Fiorilli para a interface (null se nunca aplicada):
   * dados do arquivo, filtro em vigor e quantas fichas da base usam o Fiorilli ou a planilha.
   */
  function getInfoFiorilli() {
    if (!estado.fiorilli) return null;
    const fichas = { fiorilli: new Set(), planilha: new Set() };
    combinadas.forEach((s) => s.linhas.forEach((l) => fichas[l.origem === 'fiorilli' ? 'fiorilli' : 'planilha'].add(l.ficha)));
    return {
      ...estado.fiorilli.meta,
      filtro: estado.fiorilli.filtro,
      fichasNoRelatorio: Object.keys(estado.fiorilli.fichas).length,
      fichasFiorilli: fichas.fiorilli.size,
      fichasPlanilha: fichas.planilha.size
    };
  }

  /* -------------------------------- Mutações -------------------------------- */

  /**
   * Substitui a camada da PLANILHA pelo resultado de uma importação.
   * A camada Fiorilli é mantida: as fichas que estão no relatório continuam com os
   * valores oficiais, qualquer que seja a ordem dos carregamentos.
   * Secretarias cadastradas que não vieram no arquivo são mantidas (vazias).
   * @param {Object} importacao resultado de App.data.importer
   * @param {Object} [opcoes]
   * @param {boolean} [opcoes.descartarTransferencias] apaga o livro de movimentações
   */
  function substituirDados(importacao, { descartarTransferencias = false } = {}) {
    const importadas = new Map(importacao.secretarias.map((s) => [s.codigo, s]));
    const mantidas = estado.secretarias
      .filter((s) => !importadas.has(s.codigo))
      .map((s) => criarSecretaria({ codigo: s.codigo, nome: s.nome }));

    estado = {
      ...estado,
      meta: { ...importacao.meta, alteradoEm: '' },
      secretarias: ordenarSecretarias([...importadas.values(), ...mantidas]),
      alertas: importacao.alertas || [],
      transferencias: descartarTransferencias ? [] : estado.transferencias
    };
    sincronizarReferencia();
    confirmarAlteracao('importacao');
  }

  /**
   * Fichas incluídas pelo Fiorilli passam a fazer parte da planilha (com Descrição e
   * Essencial em branco), na mesma posição em que aparecem na base combinada.
   * Assim continuam na base mesmo que deixem de constar num relatório futuro.
   */
  function incorporarFichasIncluidas() {
    const naPlanilha = new Map(estado.secretarias.flatMap((s) => s.linhas.map((l) => [l.id, l])));
    estado.secretarias = estado.secretarias.map((s) => {
      const combinada = combinadas.find((c) => c.codigo === s.codigo);
      if (!combinada || !combinada.linhas.some((l) => !naPlanilha.has(l.id))) return s;
      const linhas = combinada.linhas.map((l) => {
        if (naPlanilha.has(l.id)) return naPlanilha.get(l.id);
        const { origem, ...linha } = l;
        return linha;
      });
      return { ...s, linhas };
    });
  }

  /**
   * Aplica a atualização oficial do Fiorilli: troca SOMENTE a camada Fiorilli.
   * Alteração "tudo ou nada" (a camada pode ser grande para o navegador).
   * @param {Object} camada saída de App.data.fiorilli.criarCamada
   * @param {Object} [extras]
   * @param {Object} [extras.filtroPadrao] grava também o filtro usado como padrão
   */
  function aplicarFiorilli(camada, { filtroPadrao } = {}) {
    alterarComSeguranca('fiorilli', {}, () => {
      const anteriores = { fiorilli: estado.fiorilli, secretarias: estado.secretarias, filtro: estado.preferencias.filtroReservas };
      estado.fiorilli = { ...camada, meta: { ...camada.meta, aplicadoEm: new Date().toISOString() } };
      recombinar();
      incorporarFichasIncluidas();
      if (filtroPadrao) estado.preferencias.filtroReservas = { processos: [...filtroPadrao.processos], fontes: [...filtroPadrao.fontes] };
      return () => {
        estado.fiorilli = anteriores.fiorilli;
        estado.secretarias = anteriores.secretarias;
        estado.preferencias.filtroReservas = anteriores.filtro;
      };
    });
  }

  /** Descarta a camada Fiorilli: Reserva e Saldo voltam aos valores da planilha. */
  function descartarFiorilli() {
    alterarComSeguranca('fiorilli:descartado', {}, () => {
      const anterior = estado.fiorilli;
      estado.fiorilli = null;
      return () => { estado.fiorilli = anterior; };
    });
  }

  /**
   * Grava o filtro de reservas como padrão e como filtro EM VIGOR da camada
   * Fiorilli: as Reservas são recalculadas pela combinação (sem reler o arquivo).
   */
  function recalcularReservas({ processos, fontes }) {
    alterarComSeguranca('reservas:recalculadas', {}, () => {
      const anteriores = { fiorilli: estado.fiorilli, filtro: estado.preferencias.filtroReservas };
      const filtro = { processos: [...processos], fontes: [...fontes] };
      if (estado.fiorilli) estado.fiorilli = { ...estado.fiorilli, filtro: integracao.normalizarFiltro(filtro) };
      estado.preferencias.filtroReservas = filtro;
      return () => { estado.fiorilli = anteriores.fiorilli; estado.preferencias.filtroReservas = anteriores.filtro; };
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

  /** Processos e fontes cujas notas compõem a Reserva (listas já normalizadas). Vale na próxima atualização. */
  function definirFiltroReservas({ processos, fontes }) {
    estado.preferencias.filtroReservas = { processos: [...processos], fontes: [...fontes] };
    confirmarAlteracao('preferencias:filtro-reservas');
  }

  /**
   * Inclui (sem id) ou atualiza (com id) uma linha de despesa na camada da planilha.
   * Se a ficha está no Fiorilli, os campos oficiais exibidos vêm de lá: a planilha
   * conserva os seus próprios valores (usados se o Fiorilli for descartado).
   */
  function salvarLinha(codigo, dados) {
    const secretaria = exigirSecretaria(codigo);
    const indice = secretaria.linhas.findIndex((l) => l.id === dados.id);
    // Linha de ficha incluída pelo Fiorilli que ainda só existe na base combinada:
    // passa para a planilha na mesma posição antes de ser editada.
    if (indice < 0 && dados.id && getSecretaria(codigo) && getSecretaria(codigo).linhas.some((l) => l.id === dados.id)) {
      incorporarFichasIncluidas();
      return salvarLinha(codigo, dados);
    }
    const existente = indice >= 0 ? secretaria.linhas[indice] : null;
    const preservar = existente && existente.ficha === String(dados.ficha).trim() && fichaNoFiorilli(existente.ficha)
      ? Object.fromEntries(CAMPOS_OFICIAIS_LINHA.map((c) => [c, existente[c]]))
      : {};
    const linha = criarLinha({ ...dados, ...preservar });
    if (indice >= 0) secretaria.linhas.splice(indice, 1, linha);
    else secretaria.linhas.push(linha);
    confirmarAlteracao(indice >= 0 ? 'linha:editada' : 'linha:incluida');
    return linha;
  }

  /**
   * Remove a linha da planilha. Ficha incluída pelo Fiorilli que fica sem nenhuma
   * linha deixa de ser incluída (senão voltaria na próxima combinação).
   */
  function removerLinha(codigo, id) {
    const secretaria = exigirSecretaria(codigo);
    const removida = [...secretaria.linhas, ...secretaria.pendentes].find((l) => l.id === id)
      || (getSecretaria(codigo) || { linhas: [] }).linhas.find((l) => l.id === id);
    secretaria.linhas = secretaria.linhas.filter((l) => l.id !== id);
    secretaria.pendentes = secretaria.pendentes.filter((l) => l.id !== id);
    const camada = estado.fiorilli;
    if (removida && camada && camada.incluidas.includes(removida.ficha)
      && !estado.secretarias.some((s) => s.linhas.some((l) => l.ficha === removida.ficha))) {
      estado.fiorilli = { ...camada, incluidas: camada.incluidas.filter((f) => f !== removida.ficha) };
    }
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
    const antes = new Set(movimentacoes.fichasNegativas(combinadas, estado.transferencias));
    const novas = movimentacoes.fichasNegativas(combinadas, restantes).filter((k) => !antes.has(k));
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
    carregar, getEstado, getSecretarias, getSecretaria, getSecretariasPlanilha, temDados,
    getTransferencias, getSecretariasProjetadas, getSecretariaProjetada,
    substituirDados, aplicarFiorilli, descartarFiorilli, getCamadaFiorilli, temCamadaFiorilli, fichaNoFiorilli, getInfoFiorilli,
    recalcularReservas, getColunasFiorilli, definirColunasFiorilli, getFiltroReservas, definirFiltroReservas,
    salvarLinha, removerLinha, incorporarPendente, definirFolha,
    adicionarSecretaria, atualizarSecretaria, removerSecretaria, limparTudo,
    transferir, desfazerTransferencia, limparTransferencias
  });
})(window.OrcApp);
