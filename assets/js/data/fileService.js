/**
 * @file fileService.js
 * @description Gravação de arquivos no computador do usuário.
 *
 * Usa a File System Access API (Chrome/Edge) para salvar a base Excel
 * sempre no MESMO arquivo escolhido pelo usuário durante a sessão.
 * Em navegadores sem suporte, faz o download tradicional.
 * O arquivo de origem importado nunca é sobrescrito automaticamente.
 */
(function (App) {
  'use strict';

  let handleBase = null; // arquivo-base escolhido em "Salvar base como..."

  const suportaSalvarDireto = () => typeof window.showSaveFilePicker === 'function';

  /** Download tradicional via link temporário. */
  function baixar(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function gravar(handle, blob) {
    const escrita = await handle.createWritable();
    await escrita.write(blob);
    await escrita.close();
  }

  /**
   * Salva a base Excel. Na primeira vez pergunta onde salvar; nas
   * seguintes grava no mesmo arquivo (se `novoArquivo` for falso).
   * @returns {Promise<{modo:'arquivo'|'download', nome:string}|null>} null = cancelado
   */
  async function salvarBase(blob, nomeSugerido, novoArquivo = false) {
    if (!suportaSalvarDireto()) {
      baixar(blob, nomeSugerido);
      return { modo: 'download', nome: nomeSugerido };
    }
    try {
      if (!handleBase || novoArquivo) {
        handleBase = await window.showSaveFilePicker({
          suggestedName: nomeSugerido,
          types: [{ description: 'Planilha Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
        });
      }
      await gravar(handleBase, blob);
      return { modo: 'arquivo', nome: handleBase.name };
    } catch (erro) {
      if (erro && erro.name === 'AbortError') return null; // usuário cancelou
      handleBase = null;
      throw erro;
    }
  }

  const nomeBaseAtual = () => (handleBase ? handleBase.name : '');

  App.data.fileService = Object.freeze({ baixar, salvarBase, nomeBaseAtual, suportaSalvarDireto });
})(window.OrcApp);
