/**
 * @file exportar.js
 * @description Módulo "Exportar": gera arquivos XLSX, XLS ou CSV.
 * Escopos:
 *  - base: todas as secretarias no layout da planilha original (reimportável);
 *  - consolidado: uma linha por secretaria (equivalente à aba GERAL);
 *  - secretaria: somente a secretaria selecionada.
 */
(function (App) {
  'use strict';

  const { criar } = App.utils.dom;
  const { cabecalhoPagina, botao, campo, aplicarErros, resumoErros, estadoVazio, alerta } = App.ui.componentes;
  const calculos = App.data.calculos;
  const store = App.data.store;
  const toast = App.ui.toast;

  const ESCOPOS = Object.freeze([
    { valor: 'base', rotulo: 'Base completa (todas as secretarias)' },
    { valor: 'consolidado', rotulo: 'Consolidado (uma linha por secretaria)' },
    { valor: 'secretaria', rotulo: 'Somente uma secretaria' }
  ]);
  const FORMATOS = Object.freeze([
    { valor: 'xlsx', rotulo: 'Excel (.xlsx)' },
    { valor: 'xls', rotulo: 'Excel 97-2003 (.xls)' },
    { valor: 'csv', rotulo: 'CSV (;) para Excel' }
  ]);

  const selecao = { formato: 'xlsx', escopo: 'base', codigo: '', periodo: '' };

  /** Grupo de botões de rádio acessível (fieldset + legend). */
  function grupoRadio({ nome, legenda, opcoes, valor, testid }) {
    return criar('fieldset', {
      classe: 'form__campo form__grupo-radio',
      testid,
      filhos: [
        criar('legend', { classe: 'form__rotulo', texto: legenda }),
        ...opcoes.map((o) => criar('label', {
          classe: 'form__radio',
          filhos: [
            criar('input', { testid: `${testid}-${o.valor}`, attrs: { type: 'radio', name: nome, value: o.valor, checked: o.valor === valor } }),
            criar('span', { texto: o.rotulo })
          ]
        }))
      ]
    });
  }

  /** Valida a seleção de exportação. */
  function validar(valores) {
    const erros = {};
    if (!FORMATOS.some((f) => f.valor === valores.formato)) erros.formato = 'Selecione o formato.';
    if (!ESCOPOS.some((e) => e.valor === valores.escopo)) erros.escopo = 'Selecione o escopo.';
    if (valores.escopo === 'secretaria' && !valores.codigo) erros.codigo = 'Selecione a secretaria a exportar.';
    return erros;
  }

  function formulario() {
    const secretarias = store.getSecretarias();
    const periodos = calculos.listarPeriodos(secretarias);

    const form = criar('form', {
      classe: 'form form--grade cartao',
      testid: 'form-exportar',
      attrs: { novalidate: true, 'aria-label': 'Opções de exportação' },
      filhos: [
        resumoErros('form-exportar-resumo-erros'),
        grupoRadio({ nome: 'formato', legenda: 'Formato do arquivo', opcoes: FORMATOS, valor: selecao.formato, testid: 'radio-exportar-formato' }),
        campo({ id: 'exp-escopo', nome: 'escopo', rotulo: 'O que exportar', tipo: 'select', valor: selecao.escopo, obrigatorio: true, testid: 'select-exportar-escopo', opcoes: ESCOPOS }),
        campo({
          id: 'exp-secretaria', nome: 'codigo', rotulo: 'Secretaria', tipo: 'select', valor: selecao.codigo, testid: 'select-exportar-secretaria',
          opcoes: [{ valor: '', rotulo: 'Selecione…' }, ...secretarias.map((s) => ({ valor: s.codigo, rotulo: `${s.codigo} — ${s.nome}` }))]
        }),
        campo({
          id: 'exp-periodo', nome: 'periodo', rotulo: 'Filtrar por competência (mês)', tipo: 'select', valor: selecao.periodo, testid: 'select-exportar-periodo',
          dica: 'Com filtro, a Folha e os lançamentos fora do quadro não são exportados.',
          opcoes: [{ valor: '', rotulo: 'Todas as competências' }, ...periodos]
        }),
        criar('div', { classe: 'form__acoes form__campo--largo', filhos: [botao({ rotulo: 'Exportar arquivo', variante: 'primario', tipo: 'submit', testid: 'btn-exportar' })] })
      ]
    });

    // Habilita a seleção de secretaria somente no escopo correspondente.
    const sincronizar = () => {
      const seletor = form.elements.codigo;
      seletor.disabled = form.elements.escopo.value !== 'secretaria';
      seletor.closest('.form__campo').classList.toggle('form__campo--desabilitado', seletor.disabled);
    };
    form.elements.escopo.addEventListener('change', sincronizar);
    sincronizar();

    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const valores = {
        formato: form.elements.formato.value,
        escopo: form.elements.escopo.value,
        codigo: form.elements.codigo.value,
        periodo: form.elements.periodo.value
      };
      if (!aplicarErros(form, validar(valores))) return;
      Object.assign(selecao, valores);

      try {
        const { blob, nomeArquivo } = App.data.exporter.gerarArquivo({
          formato: valores.formato,
          escopo: valores.escopo,
          codigo: valores.codigo,
          filtro: { periodo: valores.periodo },
          secretarias: store.getSecretarias(),
          atualizadoEm: store.getEstado().meta.atualizadoEm
        });
        App.data.fileService.baixar(blob, nomeArquivo);
        toast.sucesso(`Arquivo "${nomeArquivo}" gerado.`);
      } catch (erro) {
        aplicarErros(form, {});
        toast.erro(`Falha na exportação: ${erro.message}`);
      }
    });
    return form;
  }

  function render(container) {
    container.append(cabecalhoPagina({ titulo: 'Exportar', subtitulo: 'Gere arquivos XLSX, XLS ou CSV a partir dos dados atuais.', testid: 'exportar-cabecalho' }));
    if (!store.temDados()) {
      container.append(estadoVazio({ titulo: 'Sem dados', mensagem: 'Importe uma planilha para exportar.', acao: botao({ rotulo: 'Importar planilha', variante: 'primario', testid: 'btn-exportar-importar', aoClicar: App.modules.importar.abrir }) }));
      return;
    }
    container.append(
      alerta({ nivel: 'info', testid: 'exportar-dica', mensagem: 'Dica: a "Base completa" em XLSX mantém o layout da planilha original (aba GERAL + uma aba por secretaria, com fórmulas) e pode ser reimportada.' }),
      formulario()
    );
  }

  App.modules.exportar = Object.freeze({ render });
})(window.OrcApp);
