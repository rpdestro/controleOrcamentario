/**
 * @file fiorilli.js (módulo)
 * @description Fluxo "Atualizar com Fiorilli":
 *  1) seleção do arquivo oficial (CSV, ou XLS/XLSX com o mesmo layout);
 *  2) pré-visualização: conferência das colunas, resumo, alterações campo a
 *     campo, fichas novas (com regras de inclusão ajustáveis) e fichas ausentes;
 *  3) cópia de segurança opcional + aplicação.
 * Descrição, Essencial, Período, Antes, Cortes e Folha NUNCA são alterados.
 */
(function (App) {
  'use strict';

  const { criar, limpar } = App.utils.dom;
  const { moeda, dataBR, slug } = App.utils.format;
  const { campo, alerta, aplicarErros, resumoErros, tabela } = App.ui.componentes;
  const { validarArquivo } = App.utils.validators;
  const fiorilli = App.data.fiorilli;
  const store = App.data.store;
  const toast = App.ui.toast;

  const LIMITE_LINHAS_TABELA = 1000;

  /** Lê o arquivo e devolve a matriz de células. */
  async function lerMatriz(arquivo) {
    const buffer = await arquivo.arrayBuffer();
    const extensao = arquivo.name.split('.').pop().toLowerCase();
    const importer = App.data.importer;
    if (extensao === 'csv') return importer.parseCsv(importer.decodificarTexto(buffer));
    if (!window.XLSX) throw new Error('Biblioteca de planilhas (SheetJS) não carregada. Use o arquivo CSV.');
    const wb = window.XLSX.read(new Uint8Array(buffer), { type: 'array' });
    return importer.abaParaMatriz(window.XLSX, wb.Sheets[wb.SheetNames[0]]).aoa;
  }

  const valorCampo = (campoNome, valor) => (['reserva', 'saldoFicha'].includes(campoNome) ? moeda(valor) : String(valor ?? ''));

  /** Bloco <details> com tabela (recolhido quando vazio). */
  function secaoDetalhe({ titulo, testid, colunas, linhas, aberto = false }) {
    const exibidas = linhas.slice(0, LIMITE_LINHAS_TABELA);
    return criar('details', {
      classe: 'fiorilli__detalhe',
      testid,
      attrs: { open: aberto && linhas.length > 0 },
      filhos: [
        criar('summary', { classe: 'fiorilli__resumo-detalhe', texto: `${titulo} (${linhas.length})` }),
        linhas.length
          ? tabela({ testid: `${testid}-tabela`, colunas, linhas: exibidas })
          : criar('p', { classe: 'cartao__descricao', texto: 'Nenhum registro.' }),
        linhas.length > LIMITE_LINHAS_TABELA ? criar('p', { classe: 'form__dica', texto: `Exibindo as primeiras ${LIMITE_LINHAS_TABELA} linhas.` }) : null
      ]
    });
  }

  /** Conferência: letra configurada x título encontrado no arquivo. */
  function conferenciaColunas(colunas, cabecalho) {
    const linhas = fiorilli.CAMPOS_OFICIAIS.map((c) => ({ campo: fiorilli.ROTULOS[c], letra: colunas[c], titulo: cabecalho[c] || '—' }));
    return tabela({
      testid: 'fiorilli-colunas',
      legenda: 'Colunas utilizadas (confira com o arquivo)',
      colunas: [{ rotulo: 'Campo', chave: 'campo' }, { rotulo: 'Coluna', chave: 'letra' }, { rotulo: 'Título no arquivo', chave: 'titulo' }],
      linhas
    });
  }

  /** Regras para inclusão de fichas novas (fonte, pessoal, zeradas). */
  function formularioOpcoes(plano, opcoes, aoAlterar) {
    const fontes = Object.keys(plano.fontesNovas).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const caixa = ({ testid, rotulo, marcado, aoMudar }) => {
      const input = criar('input', { testid, attrs: { type: 'checkbox', checked: marcado } });
      input.addEventListener('change', () => aoMudar(input.checked));
      return criar('label', { classe: 'form__radio', filhos: [input, criar('span', { texto: rotulo })] });
    };

    return criar('fieldset', {
      classe: 'form__grupo-radio fiorilli__opcoes',
      testid: 'fiorilli-opcoes',
      filhos: [
        criar('legend', { classe: 'form__rotulo', texto: 'Fichas novas (existem no Fiorilli e não na planilha) — incluir:' }),
        ...fontes.map((f) => caixa({
          testid: `fiorilli-fonte-${f}`,
          rotulo: `Fonte ${f} (${plano.fontesNovas[f]} fichas)`,
          marcado: !opcoes.fontes || opcoes.fontes.includes(f),
          aoMudar: (marcado) => {
            const atuais = new Set(opcoes.fontes || fontes);
            if (marcado) atuais.add(f); else atuais.delete(f);
            aoAlterar({ ...opcoes, fontes: [...atuais] });
          }
        })),
        caixa({ testid: 'fiorilli-incluir-pessoal', rotulo: 'Incluir despesas de pessoal (3.1.x)', marcado: opcoes.incluirPessoal, aoMudar: (v) => aoAlterar({ ...opcoes, incluirPessoal: v }) }),
        caixa({ testid: 'fiorilli-incluir-zeradas', rotulo: 'Incluir fichas com Reserva e Saldo zerados', marcado: opcoes.incluirZeradas, aoMudar: (v) => aoAlterar({ ...opcoes, incluirZeradas: v }) }),
        criar('small', { classe: 'form__dica', texto: 'Por padrão são sugeridas apenas as fontes já usadas na planilha. Fichas já existentes são sempre atualizadas.' })
      ]
    });
  }

  /** Resumo numérico do plano. */
  function resumoPlano(plano, meta) {
    const itens = [
      ['Arquivo', meta.arquivo],
      ['Data dos saldos', meta.dataSaldos || 'não identificada'],
      ['Fichas lidas no arquivo', plano.totalRegistros],
      ['Fichas a atualizar', plano.atualizacoes.length],
      ['Fichas sem alteração', plano.inalteradas],
      ['Fichas novas a incluir', plano.inclusoes.length],
      ['Fichas novas ignoradas', plano.ignoradas.length],
      ['Sem secretaria cadastrada', plano.semSecretaria.length],
      ['Na planilha, mas ausentes no Fiorilli', plano.ausentes.length]
    ];
    return criar('dl', {
      classe: 'resumo-lista',
      filhos: itens.flatMap(([termo, valor]) => [
        criar('dt', { classe: 'resumo-lista__termo', texto: termo }),
        criar('dd', { classe: 'resumo-lista__valor', texto: valor, testid: `fiorilli-resumo-${slug(termo)}` })
      ])
    });
  }

  /** Detalhamento do plano (alterações, inclusões, ignoradas, ausentes). */
  function detalhesPlano(plano) {
    const registroComoLinha = ({ codigo, registro, motivo }) => ({ codigo, ...registro, motivo: motivo || '' });
    const colunasRegistro = [
      { rotulo: 'Secretaria', chave: 'codigo' }, { rotulo: 'Ficha', chave: 'ficha' }, { rotulo: 'U.E', chave: 'ue' },
      { rotulo: 'Fonte', chave: 'fonte' }, { rotulo: 'Despesa', chave: 'despesa' },
      { rotulo: 'Reserva', chave: 'reserva', moeda: true }, { rotulo: 'Saldo Ficha', chave: 'saldoFicha', moeda: true }
    ];

    return [
      secaoDetalhe({
        titulo: 'Alterações nas fichas existentes',
        testid: 'fiorilli-alteracoes',
        aberto: true,
        colunas: [
          { rotulo: 'Secretaria', chave: 'codigo' }, { rotulo: 'Ficha', chave: 'ficha' }, { rotulo: 'Campo', chave: 'campo' },
          { rotulo: 'Antes', chave: 'antes', classe: 'tabela__celula--num' }, { rotulo: 'Depois', chave: 'depois', classe: 'tabela__celula--num' }
        ],
        linhas: plano.atualizacoes.flatMap((a) => a.alteracoes.map((alt) => ({
          codigo: a.codigo, ficha: a.ficha, campo: fiorilli.ROTULOS[alt.campo],
          antes: valorCampo(alt.campo, alt.antes), depois: valorCampo(alt.campo, alt.depois)
        })))
      }),
      secaoDetalhe({ titulo: 'Fichas novas a incluir', testid: 'fiorilli-inclusoes', colunas: colunasRegistro, linhas: plano.inclusoes.map(registroComoLinha) }),
      secaoDetalhe({
        titulo: 'Fichas novas ignoradas',
        testid: 'fiorilli-ignoradas',
        colunas: [...colunasRegistro, { rotulo: 'Motivo', chave: 'motivo' }],
        linhas: plano.ignoradas.map(registroComoLinha)
      }),
      secaoDetalhe({ titulo: 'Sem secretaria cadastrada (U.E)', testid: 'fiorilli-sem-secretaria', colunas: colunasRegistro, linhas: plano.semSecretaria.map(registroComoLinha) }),
      secaoDetalhe({
        titulo: 'Na planilha, mas ausentes no Fiorilli (mantidas)',
        testid: 'fiorilli-ausentes',
        colunas: [{ rotulo: 'Secretaria', chave: 'codigo' }, { rotulo: 'Ficha', chave: 'ficha' }],
        linhas: plano.ausentes
      })
    ];
  }

  /** Abre o fluxo de atualização. */
  function abrir() {
    const colunas = store.getColunasFiorilli();
    const contexto = { registros: [], alertas: [], cabecalho: {}, meta: null, opcoes: null, plano: null };

    const areaPrevia = criar('div', { classe: 'importacao__area-previa', attrs: { 'aria-live': 'polite' } });
    const formulario = criar('form', {
      classe: 'form',
      testid: 'form-fiorilli',
      attrs: { id: 'form-fiorilli', novalidate: true },
      filhos: [
        resumoErros('fiorilli-resumo-erros'),
        campo({
          id: 'fiorilli-arquivo', nome: 'arquivo', rotulo: 'Arquivo do Fiorilli (Saldo de Dotação)', tipo: 'file', obrigatorio: true,
          testid: 'input-fiorilli-arquivo',
          dica: `Ex.: download-SaldoDotacao-02-10-2026.csv · Colunas: Ficha=${colunas.ficha}, U.E=${colunas.ue}, Fonte=${colunas.fonte}, Despesa=${colunas.despesa}, Reserva=${colunas.reserva}, Saldo=${colunas.saldoFicha} (altere em Configurações).`,
          attrs: { accept: '.csv,.xlsx,.xls' }
        }),
        areaPrevia
      ]
    });

    const { fechar } = App.ui.modal.abrir({
      titulo: 'Atualizar com o Fiorilli',
      testid: 'modal-fiorilli',
      tamanho: 'largo',
      conteudo: formulario,
      acoes: [
        { rotulo: 'Cancelar', testid: 'btn-fiorilli-cancelar', aoClicar: ({ fechar: f }) => f() },
        { rotulo: 'Aplicar atualização', variante: 'primario', testid: 'btn-fiorilli-aplicar', aoClicar: () => confirmar() }
      ]
    });
    const botaoAplicar = document.querySelector('[data-testid="btn-fiorilli-aplicar"]');
    botaoAplicar.disabled = true;

    const regiaoResultado = criar('div', { classe: 'fiorilli__resultado' });
    const backup = criar('input', { testid: 'fiorilli-backup', attrs: { type: 'checkbox', checked: store.temDados() } });

    /** Recalcula o plano (as opções podem mudar) e atualiza a pré-visualização. */
    function recalcular() {
      contexto.plano = fiorilli.planejar(store.getSecretarias(), contexto.registros, contexto.opcoes);
      limpar(regiaoResultado).append(
        resumoPlano(contexto.plano, contexto.meta),
        ...detalhesPlano(contexto.plano)
      );
    }

    function montarPrevia() {
      contexto.plano = fiorilli.planejar(store.getSecretarias(), contexto.registros, contexto.opcoes);
      limpar(areaPrevia).append(
        criar('section', {
          classe: 'importacao__previa',
          testid: 'fiorilli-previa',
          filhos: [
            criar('h3', { classe: 'importacao__subtitulo', texto: 'Pré-visualização' }),
            conferenciaColunas(colunas, contexto.cabecalho),
            formularioOpcoes(contexto.plano, contexto.opcoes, (novas) => { contexto.opcoes = novas; recalcular(); }),
            regiaoResultado,
            contexto.alertas.length ? criar('details', {
              classe: 'importacao__alertas',
              testid: 'fiorilli-alertas',
              filhos: [
                criar('summary', { texto: `${contexto.alertas.length} aviso(s) de leitura` }),
                criar('ul', { classe: 'lista-alertas', filhos: contexto.alertas.map((a) => criar('li', { classe: `lista-alertas__item lista-alertas__item--${a.nivel}`, texto: a.mensagem })) })
              ]
            }) : null,
            alerta({ nivel: 'info', mensagem: 'Descrição, Essencial, Período, Antes, Cortes e Folha não são alterados. Fichas novas entram com Descrição e Essencial em branco.' }),
            criar('label', { classe: 'form__radio', filhos: [backup, criar('span', { texto: 'Baixar cópia de segurança (XLSX) da base atual antes de aplicar' })] })
          ]
        })
      );
      recalcular();
    }

    async function lerArquivo() {
      const arquivo = formulario.elements.arquivo.files[0];
      botaoAplicar.disabled = true;
      limpar(areaPrevia);
      if (!aplicarErros(formulario, validarArquivo(arquivo).erros)) return;

      areaPrevia.append(criar('p', { classe: 'carregando', texto: 'Lendo arquivo do Fiorilli…', attrs: { role: 'status' } }));
      try {
        const lido = fiorilli.lerRegistros(await lerMatriz(arquivo), colunas);
        if (!lido.registros.length) {
          throw new Error(`Nenhuma ficha encontrada na coluna ${colunas.ficha}. Verifique o arquivo ou o mapeamento de colunas em Configurações.`);
        }
        Object.assign(contexto, lido, {
          meta: { arquivo: arquivo.name, dataSaldos: fiorilli.extrairDataArquivo(arquivo.name) || dataBR(arquivo.lastModified) },
          opcoes: { fontes: fiorilli.fontesDaBase(store.getSecretarias()), incluirPessoal: false, incluirZeradas: false }
        });
        montarPrevia();
        botaoAplicar.disabled = false;
      } catch (erro) {
        limpar(areaPrevia);
        aplicarErros(formulario, { arquivo: erro.message || 'Não foi possível ler o arquivo.' });
      }
    }

    function confirmar() {
      if (!contexto.plano) return;
      try {
        if (backup.checked) {
          const { blob } = App.data.exporter.gerarArquivo({
            formato: 'xlsx', escopo: 'base', secretarias: store.getSecretarias(), atualizadoEm: store.getEstado().meta.atualizadoEm
          });
          App.data.fileService.baixar(blob, `backup-antes-fiorilli-${slug(dataBR(new Date()))}.xlsx`);
        }
        const novas = fiorilli.aplicar(store.getSecretarias(), contexto.registros, contexto.plano);
        store.aplicarFiorilli(novas, {
          ...contexto.meta,
          fichasLidas: contexto.plano.totalRegistros,
          atualizadas: contexto.plano.atualizacoes.length,
          incluidas: contexto.plano.inclusoes.length
        });
        toast.sucesso(`Fiorilli aplicado: ${contexto.plano.atualizacoes.length} fichas atualizadas e ${contexto.plano.inclusoes.length} incluídas.`);
        if (contexto.plano.inclusoes.length) toast.info('Preencha Descrição, Essencial e Período das fichas novas (filtre a coluna Descrição por "(Vazias)").');
        fechar();
      } catch (erro) {
        toast.erro(`Falha ao aplicar a atualização: ${erro.message}`);
      }
    }

    formulario.elements.arquivo.addEventListener('change', lerArquivo);
    formulario.addEventListener('submit', (e) => { e.preventDefault(); lerArquivo(); });
  }

  App.modules.fiorilli = Object.freeze({ abrir });
})(window.OrcApp);
