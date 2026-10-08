/**
 * @file configuracoes.js
 * @description Módulo "Configurações":
 *  - cadastro de secretarias (incluir / editar / remover), permitindo
 *    trabalhar com mais ou menos que as 21 secretarias iniciais;
 *  - filtro de reservas (processos e fontes que compõem a Reserva);
 *  - colunas do relatório de reservas do Fiorilli;
 *  - manutenção dos dados locais (limpeza do cache do navegador).
 */
(function (App) {
  'use strict';

  const { criar } = App.utils.dom;
  const { dataHoraBR, moeda } = App.utils.format;
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
        ...fiorilli.CAMPOS_OFICIAIS.map((c) => {
          const opcional = fiorilli.CAMPOS_OPCIONAIS.includes(c);
          return campo({
            id: `fiorilli-col-${c}`, nome: c, rotulo: fiorilli.ROTULOS[c], valor: atuais[c], obrigatorio: !opcional,
            testid: `input-fiorilli-coluna-${c}`,
            dica: `Padrão: ${App.core.config.FIORILLI_COLUNAS_PADRAO[c]}${opcional ? ' · pode ficar em branco' : ''}`,
            attrs: { maxlength: 3, autocomplete: 'off' }
          });
        }),
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
      if (!colunas.processo && store.getFiltroReservas().processos.length) {
        aplicarErros(form, { processo: 'O filtro de reservas usa processos. Esvazie a lista de processos antes de remover esta coluna.' });
        return;
      }
      store.definirColunasFiorilli(colunas);
      toast.sucesso('Colunas do Fiorilli salvas.');
    });

    return criar('section', {
      classe: 'cartao',
      testid: 'config-fiorilli',
      filhos: [
        criar('h2', { classe: 'cartao__titulo', texto: 'Integração Fiorilli — colunas do relatório de reservas' }),
        criar('p', { classe: 'cartao__descricao', texto: 'Letra da coluna (como no Excel) de cada campo no relatório de Notas de Reserva ("download-dd-mm-aaaa.xls"). Altere somente se o layout do Fiorilli mudar. Sem a coluna Saldo Ficha, o saldo da planilha é mantido.' }),
        form
      ]
    });
  }

  /* ------------------------- Filtro de reservas (v1.5) ------------------------- */

  const LIMITE_FICHAS_PREVIA = 500;

  /** Fichas que passariam a ter saldo projetado negativo (por causa das transferências registradas). */
  function novasNegativas(novas) {
    const mov = App.data.movimentacoes;
    const transferencias = store.getTransferencias();
    if (!transferencias.length) return [];
    const antes = new Set(mov.fichasNegativas(store.getSecretarias(), transferencias));
    return mov.fichasNegativas(novas, transferencias).filter((k) => !antes.has(k));
  }

  /**
   * Prévia do recálculo: impacto por secretaria e por ficha. O usuário escolhe
   * entre recalcular agora, só salvar o filtro (vale na próxima atualização) ou cancelar.
   */
  function abrirPreviaRecalculo(filtro, plano) {
    const negativas = novasNegativas(plano.secretarias);
    const diferenca = plano.totalDepois - plano.totalAntes;
    const secretariasAlteradas = plano.porSecretaria
      .filter((s) => Math.abs(s.depois - s.antes) > 0.005)
      .map((s) => ({ ...s, diferenca: App.utils.format.arredondar(s.depois - s.antes) }));
    const fichas = plano.alteracoes.map((a) => ({ ...a, diferenca: App.utils.format.arredondar(a.depois - a.antes) }));

    const conteudo = criar('div', {
      classe: 'recalculo',
      testid: 'previa-recalculo',
      filhos: [
        alerta({
          nivel: 'info',
          mensagem: `Novo filtro: processos ${filtro.processos.join(', ') || '(qualquer)'} · fontes ${filtro.fontes.join(', ') || '(qualquer)'}.`
        }),
        criar('dl', {
          classe: 'resumo-lista',
          filhos: [
            ['Reserva total atual', moeda(plano.totalAntes)],
            ['Reserva total após', moeda(plano.totalDepois)],
            ['Diferença', `${diferenca > 0 ? '+' : ''}${moeda(diferenca)}`],
            ['Fichas com Reserva alterada', String(plano.alteracoes.length)],
            ['Fichas fora do relatório Fiorilli (mantidas)', String(plano.semComposicao)]
          ].flatMap(([t, v]) => [
            criar('dt', { classe: 'resumo-lista__termo', texto: t }),
            criar('dd', { classe: 'resumo-lista__valor', texto: v, testid: `recalculo-${App.utils.format.slug(t)}` })
          ])
        }),
        plano.semComposicao ? alerta({ nivel: 'aviso', mensagem: 'Fichas que não estão no último relatório do Fiorilli (incluídas manualmente ou sem notas de reserva) mantêm a Reserva da planilha.' }) : null,
        negativas.length ? alerta({
          nivel: 'erro',
          testid: 'recalculo-negativas',
          mensagem: `Com as transferências registradas, ${negativas.length} ficha(s) ficarão com Reserva projetada negativa: ${negativas.slice(0, 10).map((k) => k.replace('|', ' · ficha ')).join('; ')}${negativas.length > 10 ? '…' : ''}. Revise as movimentações depois de recalcular.`
        }) : null,
        tabela({
          testid: 'recalculo-secretarias',
          legenda: 'Reserva por secretaria',
          colunas: [
            { rotulo: 'Secretaria', chave: 'codigo' }, { rotulo: 'Nome', chave: 'nome' },
            { rotulo: 'Atual', chave: 'antes', moeda: true }, { rotulo: 'Após', chave: 'depois', moeda: true },
            { rotulo: 'Diferença', chave: 'diferenca', moeda: true }
          ],
          linhas: secretariasAlteradas
        }),
        criar('details', {
          classe: 'fiorilli__detalhe',
          filhos: [
            criar('summary', { classe: 'fiorilli__resumo-detalhe', texto: `Fichas alteradas (${fichas.length})` }),
            tabela({
              testid: 'recalculo-fichas',
              colunas: [
                { rotulo: 'Secretaria', chave: 'codigo' }, { rotulo: 'Ficha', chave: 'ficha' },
                { rotulo: 'Reserva atual', chave: 'antes', moeda: true }, { rotulo: 'Reserva após', chave: 'depois', moeda: true },
                { rotulo: 'Diferença', chave: 'diferenca', moeda: true }
              ],
              linhas: fichas.slice(0, LIMITE_FICHAS_PREVIA)
            }),
            fichas.length > LIMITE_FICHAS_PREVIA ? criar('p', { classe: 'form__dica', texto: `Exibindo as primeiras ${LIMITE_FICHAS_PREVIA} fichas.` }) : null
          ]
        })
      ]
    });

    modal.abrir({
      titulo: 'Recalcular reservas com o novo filtro',
      testid: 'modal-recalculo',
      tamanho: 'largo',
      conteudo,
      acoes: [
        { rotulo: 'Cancelar', testid: 'btn-recalculo-cancelar', aoClicar: ({ fechar }) => fechar() },
        {
          rotulo: 'Só salvar o filtro', testid: 'btn-recalculo-so-filtro',
          aoClicar: ({ fechar }) => { store.definirFiltroReservas(filtro); fechar(); toast.info('Filtro salvo sem recalcular. Ele vale para a próxima atualização Fiorilli.'); }
        },
        {
          rotulo: 'Recalcular reservas', variante: 'primario', testid: 'btn-recalculo-confirmar',
          aoClicar: ({ fechar }) => {
            try {
              store.recalcularReservas(filtro);
              fechar();
              toast.sucesso(`Filtro salvo e Reserva recalculada em ${plano.alteracoes.length} ficha(s).`);
            } catch (erro) {
              toast.erro(erro.message);
            }
          }
        }
      ]
    });
  }

  /** Salva o filtro; com um relatório Fiorilli aplicado, recalcula as Reservas em tempo real (após a prévia). */
  function salvarFiltro(filtro) {
    if (!store.temCamadaFiorilli()) {
      store.definirFiltroReservas(filtro);
      toast.sucesso('Filtro de reservas salvo. Ele vale para a próxima atualização Fiorilli (ainda não há relatório aplicado).');
      return;
    }
    const plano = App.data.fiorilli.planejarRecalculo(store.getSecretariasPlanilha(), store.getCamadaFiorilli(), filtro);
    if (!plano.alteracoes.length) {
      store.recalcularReservas(filtro); // também passa a ser o filtro em vigor
      toast.sucesso('Filtro de reservas salvo. Nenhuma Reserva muda com este filtro.');
      return;
    }
    abrirPreviaRecalculo(filtro, plano);
  }

  /** Regra da Reserva: processos (coluna AS) e fontes cujas notas são somadas. */
  function secaoFiltroReservas() {
    const fiorilli = App.data.fiorilli;
    const padrao = App.core.config.FILTRO_RESERVAS_PADRAO;
    const seletor = App.ui.seletorFiltroReservas.criar({ filtro: store.getFiltroReservas(), testid: 'filtro-reservas' });
    const form = criar('form', {
      classe: 'form form--grade',
      testid: 'form-filtro-reservas',
      attrs: { novalidate: true, 'aria-label': 'Filtro de reservas' },
      filhos: [
        resumoErros('form-filtro-reservas-resumo-erros'),
        seletor.elemento,
        criar('p', {
          classe: 'form__dica form__campo--largo',
          texto: `Processos lidos da coluna ${store.getColunasFiorilli().processo || '—'} do Fiorilli. Padrão: processos ${padrao.processos.join(', ')} · fonte ${padrao.fontes.join(', ')}.`
        }),
        criar('div', {
          classe: 'form__acoes form__campo--largo',
          filhos: [
            botao({ rotulo: 'Salvar filtro', variante: 'primario', tipo: 'submit', testid: 'btn-salvar-filtro-reservas' }),
            botao({ rotulo: 'Restaurar padrão', testid: 'btn-restaurar-filtro-reservas', aoClicar: () => salvarFiltro(fiorilli.normalizarFiltro(padrao)) })
          ]
        })
      ]
    });

    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const bruto = seletor.ler();
      if (!aplicarErros(form, fiorilli.validarFiltro(bruto, store.getColunasFiorilli()).erros)) return;
      salvarFiltro(fiorilli.normalizarFiltro(bruto));
    });

    return criar('section', {
      classe: 'cartao',
      testid: 'config-filtro-reservas',
      filhos: [
        criar('h2', { classe: 'cartao__titulo', texto: 'Filtro de reservas — quanto cada secretaria pode gastar' }),
        criar('p', {
          classe: 'cartao__descricao',
          texto: 'A Reserva de cada ficha é a soma do "Saldo da Reserva" somente das notas com estes processos e fontes. ' +
            'Após uma atualização Fiorilli, salvar o filtro recalcula as Reservas na hora (com prévia do impacto).'
        }),
        form
      ]
    });
  }

  /** Descarta a camada Fiorilli (Reserva e Saldo voltam aos valores da planilha). */
  async function descartarFiorilli() {
    const confirmado = await modal.confirmar({
      titulo: 'Descartar saldos do Fiorilli',
      mensagem: 'Reserva, Saldo Ficha, U.E, Fonte e Despesa voltam aos valores da planilha importada. As fichas incluídas pelo Fiorilli continuam na base. Para voltar aos saldos oficiais, use "Atualizar Fiorilli" novamente. Deseja continuar?',
      rotuloConfirmar: 'Descartar',
      perigo: true,
      testid: 'modal-descartar-fiorilli'
    });
    if (!confirmado) return;
    try {
      store.descartarFiorilli();
      toast.sucesso('Saldos do Fiorilli descartados. A base usa os valores da planilha.');
    } catch (erro) {
      toast.erro(erro.message);
    }
  }

  function secaoDados() {
    const meta = store.getEstado().meta;
    const fiorilli = store.getInfoFiorilli();
    return criar('section', {
      classe: 'cartao',
      testid: 'config-dados',
      filhos: [
        criar('h2', { classe: 'cartao__titulo', texto: 'Dados locais' }),
        criar('dl', {
          classe: 'resumo-lista',
          filhos: [
            ['Planilha importada', meta.arquivo || '—'],
            ['Data da planilha', meta.atualizadoEm || '—'],
            ['Importada em', meta.importadoEm ? dataHoraBR(meta.importadoEm) : '—'],
            ['Relatório Fiorilli', fiorilli ? fiorilli.arquivo : '—'],
            ['Data dos saldos Fiorilli', fiorilli ? fiorilli.dataSaldos || '—' : '—'],
            ['Fiorilli aplicado em', fiorilli && fiorilli.aplicadoEm ? dataHoraBR(fiorilli.aplicadoEm) : '—'],
            ['Última alteração', meta.alteradoEm ? dataHoraBR(meta.alteradoEm) : '—']
          ].flatMap(([t, v]) => [criar('dt', { classe: 'resumo-lista__termo', texto: t }), criar('dd', { classe: 'resumo-lista__valor', texto: v, testid: `config-dados-${App.utils.format.slug(t)}` })])
        }),
        alerta({ nivel: 'info', mensagem: 'A planilha e o relatório do Fiorilli ficam guardados separadamente: podem ser carregados em qualquer ordem. As alterações ficam salvas automaticamente neste navegador. Use "Salvar base Excel" no topo para gravar a planilha no seu computador.' }),
        criar('div', {
          classe: 'form__acoes',
          filhos: [
            fiorilli ? botao({ rotulo: 'Descartar saldos do Fiorilli', variante: 'perigo-texto', testid: 'btn-descartar-fiorilli', aoClicar: descartarFiorilli }) : null,
            botao({ rotulo: 'Limpar dados locais', variante: 'perigo', testid: 'btn-limpar-dados', aoClicar: limparDados })
          ]
        })
      ]
    });
  }

  function render(container) {
    container.append(
      cabecalhoPagina({ titulo: 'Configurações', subtitulo: 'Secretarias e dados da aplicação.', testid: 'configuracoes-cabecalho' }),
      secaoSecretarias(),
      secaoFiltroReservas(),
      secaoFiorilli(),
      secaoDados()
    );
  }

  App.modules.configuracoes = Object.freeze({ render });
})(window.OrcApp);
