/**
 * @file app.js
 * @description Inicialização da aplicação (bootstrap):
 * carrega dados locais, liga os botões do cabeçalho, inicia menu e rotas.
 */
(function (App) {
  'use strict';

  const { qs } = App.utils.dom;
  const { dataHoraBR, slug, dataBR } = App.utils.format;
  const store = App.data.store;
  const toast = App.ui.toast;

  /** Atualiza o indicador de status no cabeçalho. */
  function atualizarStatus() {
    const status = qs('[data-testid="status-base"]');
    const meta = store.getEstado().meta;
    if (!status) return;
    const partes = [];
    if (meta.arquivo) partes.push(`Base: ${meta.arquivo}`);
    if (meta.alteradoEm) partes.push(`alterado em ${dataHoraBR(meta.alteradoEm)}`);
    const nomeBase = App.data.fileService.nomeBaseAtual();
    if (nomeBase) partes.push(`salvando em ${nomeBase}`);
    status.textContent = partes.join(' · ') || 'Nenhuma planilha importada';
  }

  /** Grava a base completa em Excel (layout original). */
  async function salvarBase() {
    if (!store.temDados()) {
      toast.aviso('Não há dados para salvar. Importe uma planilha primeiro.');
      return;
    }
    try {
      const { blob } = App.data.exporter.gerarArquivo({
        formato: 'xlsx',
        escopo: 'base',
        secretarias: store.getSecretarias(),
        atualizadoEm: dataBR(new Date())
      });
      const resultado = await App.data.fileService.salvarBase(blob, `base-orcamento-${slug(dataBR(new Date()))}.xlsx`);
      if (!resultado) return; // cancelado pelo usuário
      toast.sucesso(resultado.modo === 'arquivo' ? `Base salva em "${resultado.nome}".` : `Download de "${resultado.nome}" iniciado.`);
      atualizarStatus();
    } catch (erro) {
      toast.erro(`Não foi possível salvar a base: ${erro.message}`);
    }
  }

  /** Menu lateral recolhível em telas pequenas. */
  function ligarMenuMovel() {
    const botao = qs('[data-testid="btn-menu"]');
    const nav = qs('#navegacao');
    const alternar = (aberto) => {
      nav.classList.toggle('app-nav--aberta', aberto);
      botao.setAttribute('aria-expanded', String(aberto));
    };
    botao.addEventListener('click', () => alternar(!nav.classList.contains('app-nav--aberta')));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) alternar(false); });
  }

  function verificarBiblioteca() {
    if (window.XLSX) return;
    const aviso = App.ui.componentes.alerta({
      nivel: 'erro',
      testid: 'alerta-sheetjs',
      mensagem: 'A biblioteca de leitura de planilhas não foi carregada (sem internet?). Importação/exportação Excel indisponíveis; CSV continua funcionando. Veja o README para uso offline.'
    });
    qs('#conteudo').before(aviso);
  }

  /** Exibe a versão (fonte única: config.APP_VERSAO) — "v1.1". */
  function exibirVersao() {
    const [maior, menor] = App.core.config.APP_VERSAO.split('.');
    document.querySelectorAll('[data-versao]').forEach((el) => {
      el.textContent = `v${maior}.${menor}`;
      el.title = `Versão ${App.core.config.APP_VERSAO}`;
    });
  }

  function iniciar() {
    store.carregar();
    verificarBiblioteca();
    exibirVersao();

    qs('[data-testid="btn-importar"]').addEventListener('click', App.modules.importar.abrir);
    qs('[data-testid="btn-fiorilli"]').addEventListener('click', App.modules.fiorilli.abrir);
    qs('[data-testid="btn-salvar-base"]').addEventListener('click', salvarBase);
    App.ui.tema.ligarBotao(qs('[data-testid="btn-tema"]'));
    ligarMenuMovel();

    App.core.events.on('estado:alterado', ({ salvo }) => {
      atualizarStatus();
      if (salvo === false) toast.erro('Não foi possível salvar no navegador (armazenamento cheio ou bloqueado). Salve a base em Excel.');
    });

    App.ui.nav.iniciar(qs('#navegacao'));
    App.ui.router.iniciar(qs('#conteudo'));
    atualizarStatus();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})(window.OrcApp);
