/**
 * @file importar.js
 * @description Fluxo de importação de planilha (XLS/XLSX/CSV) em 2 etapas:
 *  1) seleção e leitura do arquivo (com validação visível);
 *  2) pré-visualização (resumo + alertas) e confirmação da substituição.
 */
(function (App) {
  'use strict';

  const { criar, limpar } = App.utils.dom;
  const { campo, alerta, aplicarErros, resumoErros } = App.ui.componentes;
  const { validarArquivo } = App.utils.validators;
  const store = App.data.store;
  const toast = App.ui.toast;

  let resultadoLido = null;

  /** Lista de alertas (limitada) exibida na pré-visualização. */
  function listaAlertas(alertas) {
    if (!alertas.length) return alerta({ nivel: 'sucesso', mensagem: 'Nenhuma inconsistência encontrada na conferência.', testid: 'importar-sem-alertas' });
    return criar('details', {
      classe: 'importacao__alertas',
      testid: 'importar-alertas',
      attrs: { open: true },
      filhos: [
        criar('summary', { texto: `${alertas.length} alerta(s) de conferência` }),
        criar('ul', {
          classe: 'lista-alertas',
          filhos: alertas.map((a) => criar('li', { classe: `lista-alertas__item lista-alertas__item--${a.nivel}`, texto: a.mensagem }))
        })
      ]
    });
  }

  function previa(resultado) {
    const { resumo, meta } = resultado;
    return criar('section', {
      classe: 'importacao__previa',
      testid: 'importar-previa',
      attrs: { 'aria-live': 'polite' },
      filhos: [
        criar('h3', { classe: 'importacao__subtitulo', texto: 'Pré-visualização' }),
        criar('dl', {
          classe: 'resumo-lista',
          filhos: [
            ['Arquivo', meta.arquivo],
            ['Atualizado em', meta.atualizadoEm || 'não informado'],
            ['Secretarias', resumo.qtdSecretarias],
            ['Linhas de despesa', resumo.qtdLinhas],
            ['Lançamentos fora do quadro', resumo.qtdPendentes]
          ].flatMap(([termo, valor]) => [
            criar('dt', { classe: 'resumo-lista__termo', texto: termo }),
            criar('dd', { classe: 'resumo-lista__valor', texto: valor, testid: `importar-resumo-${App.utils.format.slug(termo)}` })
          ])
        }),
        listaAlertas(resultado.alertas),
        store.temDados()
          ? alerta({ nivel: 'aviso', mensagem: 'Atenção: ao confirmar, os dados atuais serão substituídos pelos do arquivo.', testid: 'importar-aviso-substituicao' })
          : null
      ]
    });
  }

  /** Lê o arquivo selecionado e mostra a prévia. */
  async function lerArquivo(formulario, areaPrevia, botaoConfirmar) {
    const arquivo = formulario.elements.arquivo.files[0];
    const validacao = validarArquivo(arquivo);
    resultadoLido = null;
    botaoConfirmar.disabled = true;
    limpar(areaPrevia);
    if (!aplicarErros(formulario, validacao.erros)) return;

    areaPrevia.append(criar('p', { classe: 'carregando', texto: 'Lendo planilha…', attrs: { role: 'status' } }));
    try {
      resultadoLido = await App.data.importer.importarArquivo(arquivo);
      limpar(areaPrevia).append(previa(resultadoLido));
      botaoConfirmar.disabled = false;
      botaoConfirmar.focus();
    } catch (erro) {
      limpar(areaPrevia);
      aplicarErros(formulario, { arquivo: erro.message || 'Não foi possível ler o arquivo.' });
    }
  }

  /** Abre a janela de importação. */
  function abrir() {
    resultadoLido = null;
    const areaPrevia = criar('div', { classe: 'importacao__area-previa' });
    const formulario = criar('form', {
      classe: 'form',
      testid: 'form-importar',
      attrs: { id: 'form-importar', novalidate: true },
      filhos: [
        resumoErros('importar-resumo-erros'),
        campo({
          id: 'importar-arquivo', nome: 'arquivo', rotulo: 'Planilha de origem', tipo: 'file', obrigatorio: true,
          dica: 'Formatos aceitos: XLSX, XLS ou CSV. Ex.: "Planilha Léo Outubro.xlsx".',
          testid: 'input-importar-arquivo',
          attrs: { accept: '.xlsx,.xls,.csv' }
        }),
        areaPrevia
      ]
    });

    const { fechar } = App.ui.modal.abrir({
      titulo: 'Importar planilha',
      testid: 'modal-importar',
      tamanho: 'largo',
      conteudo: formulario,
      acoes: [
        { rotulo: 'Cancelar', testid: 'btn-importar-cancelar', aoClicar: ({ fechar: f }) => f() },
        { rotulo: 'Confirmar importação', variante: 'primario', testid: 'btn-importar-confirmar', aoClicar: confirmar }
      ]
    });

    const botaoConfirmar = document.querySelector('[data-testid="btn-importar-confirmar"]');
    botaoConfirmar.disabled = true;

    formulario.elements.arquivo.addEventListener('change', () => lerArquivo(formulario, areaPrevia, botaoConfirmar));
    formulario.addEventListener('submit', (e) => { e.preventDefault(); lerArquivo(formulario, areaPrevia, botaoConfirmar); });

    function confirmar() {
      if (!resultadoLido) return;
      store.substituirDados(resultadoLido);
      const { qtdSecretarias, qtdLinhas } = resultadoLido.resumo;
      toast.sucesso(`Importação concluída: ${qtdSecretarias} secretarias e ${qtdLinhas} linhas.`);
      if (resultadoLido.alertas.length) toast.aviso(`${resultadoLido.alertas.length} alerta(s) de conferência. Veja o Painel.`);
      fechar();
      App.ui.router.navegar('/painel');
    }
  }

  App.modules.importar = Object.freeze({ abrir });
})(window.OrcApp);
