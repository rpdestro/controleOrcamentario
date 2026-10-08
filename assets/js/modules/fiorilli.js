/**
 * @file fiorilli.js (módulo)
 * @description Fluxo "Atualizar com Fiorilli":
 *  1) seleção do relatório de Notas de Reserva (XLS/XLSX, ou CSV com o mesmo layout);
 *  2) pré-visualização: conferência das colunas, seleção dos processos/fontes que
 *     compõem a Reserva (v1.5: caixas de seleção, recalcula a prévia na hora),
 *     Reserva por secretaria (antes x depois), alterações campo a campo,
 *     fichas novas (com regras de inclusão ajustáveis) e fichas ausentes;
 *  3) cópia de segurança opcional + aplicação.
 * Descrição, Essencial, Período, Antes e Folha NUNCA são alterados.
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

  /** Conferência: letra configurada x título (se houver) e valor da 1ª nota do arquivo. */
  function conferenciaColunas(colunas, cabecalho, exemplo) {
    const linhas = fiorilli.CAMPOS_OFICIAIS.map((c) => ({
      campo: fiorilli.ROTULOS[c],
      letra: colunas[c] || '(não usada)',
      titulo: cabecalho[c] || '—',
      exemplo: exemplo[c] || '—'
    }));
    return tabela({
      testid: 'fiorilli-colunas',
      legenda: 'Colunas utilizadas (confira com o arquivo)',
      colunas: [
        { rotulo: 'Campo', chave: 'campo' }, { rotulo: 'Coluna', chave: 'letra' },
        { rotulo: 'Título no arquivo', chave: 'titulo' }, { rotulo: 'Valor na 1ª nota', chave: 'exemplo' }
      ],
      linhas
    });
  }

  /** Resultado do filtro em uso (processos/fontes selecionados acima). */
  function blocoFiltro(filtro, resumo) {
    const lista = (itens, todos) => (itens.length ? itens.join(', ') : todos);
    const processos = Object.entries(resumo.porProcesso)
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
      .map(([processo, p]) => ({ processo: processo || '(vazio)', notas: p.notas, fichas: p.fichas, saldo: p.saldo }));
    return criar('section', {
      classe: 'fiorilli__filtro',
      testid: 'fiorilli-filtro',
      filhos: [
        alerta({
          nivel: 'info',
          mensagem: `Reserva = soma do Saldo da Reserva das notas com processo ${lista(filtro.processos, '(qualquer)')} e fonte ${lista(filtro.fontes, '(qualquer)')}. ` +
            `${resumo.notasFiltradas} de ${resumo.notas} notas atendem ao filtro. Altere a seleção acima para recalcular a prévia.`
        }),
        processos.length ? tabela({
          testid: 'fiorilli-processos',
          legenda: 'Saldo da reserva por processo (notas dentro do filtro)',
          colunas: [
            { rotulo: 'Processo', chave: 'processo' }, { rotulo: 'Notas', chave: 'notas', numerico: true },
            { rotulo: 'Fichas', chave: 'fichas', numerico: true }, { rotulo: 'Saldo da Reserva', chave: 'saldo', moeda: true }
          ],
          linhas: processos
        }) : null
      ]
    });
  }

  /** Regras para inclusão de fichas novas (pessoal, zeradas). */
  function formularioOpcoes(opcoes, aoAlterar) {
    const caixa = ({ testid, rotulo, marcado, aoMudar }) => {
      const input = criar('input', { testid, attrs: { type: 'checkbox', checked: marcado } });
      input.addEventListener('change', () => aoMudar(input.checked));
      return criar('label', { classe: 'form__radio', filhos: [input, criar('span', { texto: rotulo })] });
    };

    return criar('fieldset', {
      classe: 'form__grupo-radio fiorilli__opcoes',
      testid: 'fiorilli-opcoes',
      filhos: [
        criar('legend', { classe: 'form__rotulo', texto: 'Fichas novas (com reservas no filtro e que não estão na planilha) — incluir:' }),
        caixa({ testid: 'fiorilli-incluir-pessoal', rotulo: 'Incluir despesas de pessoal (3.1.x)', marcado: opcoes.incluirPessoal, aoMudar: (v) => aoAlterar({ ...opcoes, incluirPessoal: v }) }),
        caixa({ testid: 'fiorilli-incluir-zeradas', rotulo: 'Incluir fichas com Saldo da Reserva zerado', marcado: opcoes.incluirZeradas, aoMudar: (v) => aoAlterar({ ...opcoes, incluirZeradas: v }) }),
        criar('small', { classe: 'form__dica', texto: 'Fichas já existentes na planilha são sempre atualizadas (a Reserva vira a soma das notas do filtro, podendo ficar 0).' })
      ]
    });
  }

  /** Resumo numérico do plano. */
  function resumoPlano(plano, meta, resumo) {
    const itens = [
      ['Arquivo', meta.arquivo],
      ['Data dos saldos', meta.dataSaldos || 'não identificada'],
      ['Notas lidas no arquivo', resumo.notas],
      ['Notas dentro do filtro', resumo.notasFiltradas],
      ['Fichas lidas no arquivo', plano.totalRegistros],
      ['Fichas a atualizar', plano.atualizacoes.length],
      ['Fichas sem alteração', plano.inalteradas],
      ['Fichas novas a incluir', plano.inclusoes.length],
      ['Fichas novas ignoradas', plano.ignoradas.length],
      ['Fichas novas fora do filtro', plano.foraDoFiltro],
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

    const secretariasAlteradas = plano.porSecretaria
      .filter((s) => Math.abs(s.depois - s.antes) > 0.005)
      .map((s) => ({ ...s, diferenca: s.depois - s.antes }));

    return [
      secaoDetalhe({
        titulo: 'Reserva por secretaria (quanto pode gastar)',
        testid: 'fiorilli-secretarias',
        aberto: true,
        colunas: [
          { rotulo: 'Secretaria', chave: 'codigo' }, { rotulo: 'Nome', chave: 'nome' },
          { rotulo: 'Reserva atual', chave: 'antes', moeda: true }, { rotulo: 'Reserva após', chave: 'depois', moeda: true },
          { rotulo: 'Diferença', chave: 'diferenca', moeda: true }
        ],
        linhas: secretariasAlteradas
      }),
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

  /** Aviso quando o relatório do Fiorilli é mais antigo que a planilha ou que o relatório já aplicado. */
  function avisoDatas(dataSaldos) {
    const { compararDatasBR } = App.utils.format;
    const planilha = store.getEstado().meta.atualizadoEm;
    const aplicado = store.getInfoFiorilli();
    const avisos = [];
    if (compararDatasBR(dataSaldos, planilha) < 0) avisos.push(`a planilha está atualizada em ${planilha}`);
    if (aplicado && compararDatasBR(dataSaldos, aplicado.dataSaldos) < 0) avisos.push(`os saldos em uso são de ${aplicado.dataSaldos}`);
    if (!avisos.length) return null;
    return alerta({
      nivel: 'aviso',
      testid: 'fiorilli-aviso-data',
      mensagem: `Este relatório é de ${dataSaldos}, mas ${avisos.join(' e ')}. Confira se é o arquivo mais recente do Fiorilli.`
    });
  }

  /** Abre o fluxo de atualização. */
  function abrir() {
    const colunas = store.getColunasFiorilli();
    const filtro = store.getFiltroReservas();
    const contexto = { matriz: null, colunas, colunasDetectadas: false, registros: [], alertas: [], cabecalho: {}, exemplo: {}, resumo: null, meta: null, opcoes: null, plano: null };
    const descreverColunas = fiorilli.CAMPOS_OFICIAIS.filter((c) => colunas[c]).map((c) => `${fiorilli.ROTULOS[c]}=${colunas[c]}`).join(', ');

    const areaPrevia = criar('div', { classe: 'importacao__area-previa', attrs: { 'aria-live': 'polite' } });
    const formulario = criar('form', {
      classe: 'form',
      testid: 'form-fiorilli',
      attrs: { id: 'form-fiorilli', novalidate: true },
      filhos: [
        resumoErros('fiorilli-resumo-erros'),
        campo({
          id: 'fiorilli-arquivo', nome: 'arquivo', rotulo: 'Relatório de reservas do Fiorilli (Notas de Reserva)', tipo: 'file', obrigatorio: true,
          testid: 'input-fiorilli-arquivo',
          dica: `Ex.: download-17-10-2026.xls · Colunas: ${descreverColunas}.`,
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
    const regiaoFiltro = criar('div', { classe: 'fiorilli__regiao-filtro', attrs: { 'aria-live': 'polite' } });
    const backup = criar('input', { testid: 'fiorilli-backup', attrs: { type: 'checkbox', checked: store.temDados() } });
    const salvarPadrao = criar('input', { testid: 'fiorilli-salvar-filtro-padrao', attrs: { type: 'checkbox' } });

    /**
     * Relê as notas (já em memória) com a seleção atual de processos/fontes e
     * atualiza a prévia. Seleção inválida bloqueia a aplicação até ser corrigida.
     */
    function refiltrar(bruto) {
      if (!aplicarErros(formulario, fiorilli.validarFiltro(bruto, contexto.colunas).erros)) {
        botaoAplicar.disabled = true;
        return;
      }
      const lido = fiorilli.lerRegistros(contexto.matriz, contexto.colunas, bruto);
      Object.assign(contexto, { registros: lido.registros, alertas: lido.alertas, resumo: lido.resumo, filtro: lido.filtro });
      contexto.meta.filtro = lido.filtro;
      limpar(regiaoFiltro).append(blocoFiltro(contexto.filtro, contexto.resumo));
      recalcular();
      botaoAplicar.disabled = false;
    }

    /** Recalcula o plano (as opções podem mudar) e atualiza a pré-visualização. */
    function recalcular() {
      contexto.plano = fiorilli.planejar(store.getSecretarias(), contexto.registros, contexto.opcoes);
      limpar(regiaoResultado).append(
        resumoPlano(contexto.plano, contexto.meta, contexto.resumo),
        ...detalhesPlano(contexto.plano)
      );
    }

    function montarPrevia() {
      let temporizador = null;
      const seletor = App.ui.seletorFiltroReservas.criar({
        filtro: contexto.filtro,
        testid: 'fiorilli-seletor',
        aoMudar: () => {
          clearTimeout(temporizador);
          temporizador = setTimeout(() => refiltrar(seletor.ler()), 250);
        }
      });
      limpar(regiaoFiltro).append(blocoFiltro(contexto.filtro, contexto.resumo));

      limpar(areaPrevia).append(
        criar('section', {
          classe: 'importacao__previa',
          testid: 'fiorilli-previa',
          filhos: [
            criar('h3', { classe: 'importacao__subtitulo', texto: 'Pré-visualização' }),
            avisoDatas(contexto.meta.dataSaldos),
            contexto.colunasDetectadas ? alerta({
              nivel: 'info',
              mensagem: 'Layout CSV do Fiorilli reconhecido pelos títulos das colunas (FICHA, CODLO, FONGRUPO, CATEC, PROCESSO, SALDO_RESERVA, SALDO). O mapeamento de Configurações não foi alterado.'
            }) : null,
            conferenciaColunas(contexto.colunas, contexto.cabecalho, contexto.exemplo),
            criar('section', {
              classe: 'fiorilli__selecao',
              testid: 'fiorilli-selecao-filtro',
              filhos: [
                criar('h4', { classe: 'importacao__subtitulo', texto: 'Notas que compõem a Reserva' }),
                criar('div', { classe: 'form form--grade', filhos: [seletor.elemento] }),
                criar('label', {
                  classe: 'form__radio',
                  filhos: [salvarPadrao, criar('span', { texto: 'Salvar esta seleção como filtro padrão (Configurações)' })]
                })
              ]
            }),
            regiaoFiltro,
            formularioOpcoes(contexto.opcoes, (novas) => { contexto.opcoes = novas; recalcular(); }),
            regiaoResultado,
            contexto.alertas.length ? criar('details', {
              classe: 'importacao__alertas',
              testid: 'fiorilli-alertas',
              filhos: [
                criar('summary', { texto: `${contexto.alertas.length} aviso(s) de leitura` }),
                criar('ul', { classe: 'lista-alertas', filhos: contexto.alertas.map((a) => criar('li', { classe: `lista-alertas__item lista-alertas__item--${a.nivel}`, texto: a.mensagem })) })
              ]
            }) : null,
            alerta({ nivel: 'info', mensagem: `Descrição, Essencial, Período, Antes e Folha não são alterados.${contexto.colunas.saldoFicha ? '' : ' Saldo Ficha também é mantido (coluna não configurada).'} Fichas novas entram com Descrição e Essencial em branco.` }),
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
        const matriz = await lerMatriz(arquivo);
        let colunasUsadas = colunas;
        let lido = fiorilli.lerRegistros(matriz, colunas, filtro);
        // O CSV do Fiorilli tem outro layout: sem fichas nas letras configuradas, tenta pelos títulos.
        const detectadas = lido.registros.length ? null : fiorilli.detectarColunas(matriz);
        if (detectadas) {
          colunasUsadas = detectadas;
          lido = fiorilli.lerRegistros(matriz, detectadas, filtro);
        }
        if (!lido.registros.length) {
          throw new Error(`Nenhuma ficha encontrada na coluna ${colunas.ficha}. Verifique o arquivo ou o mapeamento de colunas em Configurações.`);
        }
        Object.assign(contexto, lido, {
          matriz,
          colunas: colunasUsadas,
          colunasDetectadas: Boolean(detectadas),
          meta: {
            arquivo: arquivo.name,
            dataSaldos: fiorilli.extrairDataArquivo(arquivo.name) || dataBR(arquivo.lastModified),
            filtro: lido.filtro
          },
          opcoes: { incluirPessoal: false, incluirZeradas: false }
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
        // v1.6: grava só a camada Fiorilli; a planilha não é alterada (ver data/fiorilli.js → combinar).
        // Fichas incluídas em atualizações anteriores continuam incluídas.
        const anterior = store.getCamadaFiorilli();
        const camada = fiorilli.criarCamada({
          registros: contexto.registros,
          filtro: contexto.filtro,
          incluidas: [...(anterior ? anterior.incluidas : []), ...contexto.plano.inclusoes.map((i) => i.registro.ficha)],
          meta: {
            ...contexto.meta,
            fichasLidas: contexto.plano.totalRegistros,
            atualizadas: contexto.plano.atualizacoes.length,
            incluidas: contexto.plano.inclusoes.length
          }
        });
        store.aplicarFiorilli(camada, { filtroPadrao: salvarPadrao.checked ? contexto.filtro : null });
        toast.sucesso(`Fiorilli aplicado: ${contexto.plano.atualizacoes.length} fichas atualizadas e ${contexto.plano.inclusoes.length} incluídas.`);
        if (contexto.plano.inclusoes.length) toast.info('Preencha Descrição, Essencial e Período das fichas novas (filtre a coluna Descrição por "(Vazias)").');
        fechar();
      } catch (erro) {
        toast.erro(`Falha ao aplicar a atualização: ${erro.message}`);
      }
    }

    formulario.elements.arquivo.addEventListener('change', lerArquivo);
    // Enter no campo "Outros" do filtro não deve reler o arquivo (a prévia já acompanha a seleção).
    formulario.addEventListener('submit', (e) => { e.preventDefault(); if (!contexto.matriz) lerArquivo(); });
  }

  App.modules.fiorilli = Object.freeze({ abrir });
})(window.OrcApp);
