/**
 * @file configuracoes.js
 * @description Módulo "Configurações":
 *  - cadastro de secretarias (incluir / editar / remover), permitindo
 *    trabalhar com mais ou menos que as 21 secretarias iniciais;
 *  - manutenção dos dados locais (limpeza do cache do navegador).
 */
(function (App) {
  'use strict';

  const { criar } = App.utils.dom;
  const { dataHoraBR } = App.utils.format;
  const { cabecalhoPagina, botao, campo, aplicarErros, resumoErros, tabela, alerta } = App.ui.componentes;
  const { validarSecretaria } = App.utils.validators;
  const store = App.data.store;
  const toast = App.ui.toast;
  const modal = App.ui.modal;

  const codigosExistentes = () => store.getSecretarias().map((s) => s.codigo);

  /** Formulário de secretaria (inclusão quando `secretaria` for nulo). */
  function abrirFormulario(secretaria = null) {
    const form = criar('form', {
      classe: 'form',
      testid: 'form-secretaria',
      attrs: { id: 'form-secretaria', novalidate: true },
      filhos: [
        resumoErros('form-secretaria-resumo-erros'),
        campo({ id: 'sec-codigo', nome: 'codigo', rotulo: 'Código (U.O.)', valor: secretaria ? secretaria.codigo : '', obrigatorio: true, dica: 'Formato 02.01', testid: 'input-secretaria-codigo', attrs: { autocomplete: 'off', maxlength: 5 } }),
        campo({ id: 'sec-nome', nome: 'nome', rotulo: 'Nome', valor: secretaria ? secretaria.nome : '', obrigatorio: true, testid: 'input-secretaria-nome', attrs: { autocomplete: 'off', maxlength: 120 } })
      ]
    });

    const { fechar } = modal.abrir({
      titulo: secretaria ? `Editar secretaria ${secretaria.codigo}` : 'Nova secretaria',
      testid: 'modal-secretaria',
      conteudo: form,
      acoes: [
        { rotulo: 'Cancelar', testid: 'btn-secretaria-cancelar', aoClicar: ({ fechar: f }) => f() },
        { rotulo: 'Salvar', variante: 'primario', tipo: 'submit', form: 'form-secretaria', testid: 'btn-secretaria-salvar' }
      ]
    });

    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const dados = { codigo: form.elements.codigo.value.trim(), nome: form.elements.nome.value.trim() };
      const { erros } = validarSecretaria(dados, codigosExistentes(), secretaria ? secretaria.codigo : undefined);
      if (!aplicarErros(form, erros)) return;
      if (secretaria) store.atualizarSecretaria(secretaria.codigo, dados);
      else store.adicionarSecretaria(dados);
      toast.sucesso(secretaria ? 'Secretaria atualizada.' : 'Secretaria incluída.');
      fechar();
    });
  }

  async function remover(secretaria) {
    const confirmado = await modal.confirmar({
      titulo: 'Remover secretaria',
      mensagem: `Remover "${secretaria.codigo} — ${secretaria.nome}" e suas ${secretaria.linhas.length} linha(s) de despesa? Esta ação não pode ser desfeita (exporte a base antes, se necessário).`,
      rotuloConfirmar: 'Remover',
      perigo: true,
      testid: 'modal-remover-secretaria'
    });
    if (!confirmado) return;
    store.removerSecretaria(secretaria.codigo);
    toast.sucesso('Secretaria removida.');
  }

  async function limparDados() {
    const confirmado = await modal.confirmar({
      titulo: 'Limpar dados locais',
      mensagem: 'Todos os dados importados e alterações salvas neste navegador serão apagados. A lista de secretarias volta ao padrão. Deseja continuar?',
      rotuloConfirmar: 'Limpar dados',
      perigo: true,
      testid: 'modal-limpar-dados'
    });
    if (!confirmado) return;
    store.limparTudo();
    toast.sucesso('Dados locais apagados.');
  }

  function secaoSecretarias() {
    const secretarias = store.getSecretarias();
    return criar('section', {
      classe: 'cartao',
      testid: 'config-secretarias',
      filhos: [
        criar('div', {
          classe: 'cartao__cabecalho',
          filhos: [
            criar('h2', { classe: 'cartao__titulo', texto: `Secretarias cadastradas (${secretarias.length})` }),
            botao({ rotulo: '+ Nova secretaria', variante: 'primario', testid: 'btn-nova-secretaria', aoClicar: () => abrirFormulario() })
          ]
        }),
        tabela({
          testid: 'tabela-secretarias',
          legenda: 'Unidades Orçamentárias',
          colunas: [
            { rotulo: 'Código', chave: 'codigo' },
            { rotulo: 'Nome', chave: 'nome' },
            { rotulo: 'Linhas', numerico: true, render: (s) => String(s.linhas.length) },
            {
              rotulo: 'Ações',
              render: (s) => criar('div', {
                classe: 'tabela__acoes',
                filhos: [
                  botao({ rotulo: 'Editar', tamanho: 'pequeno', variante: 'fantasma', testid: `btn-editar-secretaria-${s.codigo}`, aoClicar: () => abrirFormulario(s) }),
                  botao({ rotulo: 'Remover', tamanho: 'pequeno', variante: 'perigo-texto', testid: `btn-remover-secretaria-${s.codigo}`, aoClicar: () => remover(s) })
                ]
              })
            }
          ],
          linhas: secretarias
        })
      ]
    });
  }

  /** Mapeamento das colunas do arquivo Fiorilli (letras no padrão Excel). */
  function secaoFiorilli() {
    const fiorilli = App.data.fiorilli;
    const atuais = store.getColunasFiorilli();
    const form = criar('form', {
      classe: 'form form--grade',
      testid: 'form-colunas-fiorilli',
      attrs: { novalidate: true, 'aria-label': 'Colunas do arquivo Fiorilli' },
      filhos: [
        resumoErros('form-fiorilli-resumo-erros'),
        ...fiorilli.CAMPOS_OFICIAIS.map((c) => campo({
          id: `fiorilli-col-${c}`, nome: c, rotulo: fiorilli.ROTULOS[c], valor: atuais[c], obrigatorio: true,
          testid: `input-fiorilli-coluna-${c}`,
          dica: `Padrão: ${App.core.config.FIORILLI_COLUNAS_PADRAO[c]}`,
          attrs: { maxlength: 3, autocomplete: 'off' }
        })),
        criar('div', {
          classe: 'form__acoes form__campo--largo',
          filhos: [
            botao({ rotulo: 'Salvar colunas', variante: 'primario', tipo: 'submit', testid: 'btn-salvar-colunas-fiorilli' }),
            botao({
              rotulo: 'Restaurar padrão', testid: 'btn-restaurar-colunas-fiorilli',
              aoClicar: () => { store.definirColunasFiorilli({ ...App.core.config.FIORILLI_COLUNAS_PADRAO }); toast.sucesso('Colunas do Fiorilli restauradas.'); }
            })
          ]
        })
      ]
    });

    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const colunas = Object.fromEntries(fiorilli.CAMPOS_OFICIAIS.map((c) => [c, form.elements[c].value.trim().toUpperCase()]));
      if (!aplicarErros(form, fiorilli.validarColunas(colunas).erros)) return;
      store.definirColunasFiorilli(colunas);
      toast.sucesso('Colunas do Fiorilli salvas.');
    });

    return criar('section', {
      classe: 'cartao',
      testid: 'config-fiorilli',
      filhos: [
        criar('h2', { classe: 'cartao__titulo', texto: 'Integração Fiorilli — colunas do arquivo' }),
        criar('p', { classe: 'cartao__descricao', texto: 'Letra da coluna (como no Excel) de cada campo oficial no arquivo "download-SaldoDotacao-*.csv". Altere somente se o layout do Fiorilli mudar.' }),
        form
      ]
    });
  }

  function secaoDados() {
    const meta = store.getEstado().meta;
    return criar('section', {
      classe: 'cartao',
      testid: 'config-dados',
      filhos: [
        criar('h2', { classe: 'cartao__titulo', texto: 'Dados locais' }),
        criar('dl', {
          classe: 'resumo-lista',
          filhos: [
            ['Arquivo importado', meta.arquivo || '—'],
            ['Importado em', meta.importadoEm ? dataHoraBR(meta.importadoEm) : '—'],
            ['Última alteração', meta.alteradoEm ? dataHoraBR(meta.alteradoEm) : '—']
          ].flatMap(([t, v]) => [criar('dt', { classe: 'resumo-lista__termo', texto: t }), criar('dd', { classe: 'resumo-lista__valor', texto: v })])
        }),
        alerta({ nivel: 'info', mensagem: 'As alterações ficam salvas automaticamente neste navegador. Use "Salvar base Excel" no topo para gravar a planilha no seu computador.' }),
        botao({ rotulo: 'Limpar dados locais', variante: 'perigo', testid: 'btn-limpar-dados', aoClicar: limparDados })
      ]
    });
  }

  function render(container) {
    container.append(
      cabecalhoPagina({ titulo: 'Configurações', subtitulo: 'Secretarias e dados da aplicação.', testid: 'configuracoes-cabecalho' }),
      secaoSecretarias(),
      secaoFiorilli(),
      secaoDados()
    );
  }

  App.modules.configuracoes = Object.freeze({ render });
})(window.OrcApp);
