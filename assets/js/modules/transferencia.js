/**
 * @file transferencia.js
 * @description Modal "Transferir recursos" (v1.4).
 *  - a ficha atual já vem como ORIGEM;
 *  - DESTINO pode ser qualquer ficha, da mesma ou de outra secretaria
 *    (agrupadas por secretaria, as mais necessitadas primeiro, com busca);
 *  - move Saldo Ficha e/ou Reserva, sem permitir saldo negativo;
 *  - prévia "antes → depois" com a situação de cada ficha, atualizada ao digitar;
 *  - se a origem passar a ficar em déficit, exige ciência.
 * A gravação é feita por store.transferir (livro de movimentações).
 */
(function (App) {
  'use strict';

  const { criar, limpar } = App.utils.dom;
  const { moeda, numero, normalizarTexto } = App.utils.format;
  const { campo, botao, alerta, aplicarErros, resumoErros, seloSituacao } = App.ui.componentes;
  const mov = App.data.movimentacoes;
  const store = App.data.store;
  const config = App.core.config;
  const modal = App.ui.modal;
  const toast = App.ui.toast;

  const SITUACOES = config.SITUACOES_FICHA;
  const curto = (texto, max = 32) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);
  const nomeFicha = (f) => `Ficha ${f.ficha} (${f.secretaria})`;

  /** "Saldo Ficha R$ 1.000,00 + Reserva R$ 500,00" (somente os campos movidos). */
  function descreverValores(t) {
    return mov.CAMPOS.filter((c) => t[c]).map((c) => `${mov.ROTULOS[c]} ${moeda(t[c])}`).join(' + ');
  }

  /* ------------------------------- Destino ------------------------------- */

  /** Opções do destino: agrupadas por secretaria (a da origem primeiro), mais graves primeiro. */
  function opcoesDestino(secretarias, origem) {
    const porGravidade = (a, b) => SITUACOES[a.situacao].ordem - SITUACOES[b.situacao].ordem
      || a.ficha.localeCompare(b.ficha, 'pt-BR', { numeric: true });
    const grupos = secretarias
      .map((s) => ({ s, fichas: mov.resumirFichas(s).filter((f) => mov.chave(f) !== mov.chave(origem)) }))
      .filter((g) => g.fichas.length)
      .sort((a, b) => Number(b.s.codigo === origem.secretaria) - Number(a.s.codigo === origem.secretaria));

    return [
      { valor: '', rotulo: 'Selecione a ficha de destino…' },
      ...grupos.map(({ s, fichas }) => ({
        rotulo: `${s.codigo} — ${s.nome}`,
        opcoes: fichas.sort(porGravidade).map((f) => ({
          valor: mov.chave(f),
          rotulo: `${SITUACOES[f.situacao].icone} Ficha ${f.ficha} · ${f.despesa}${f.descricao ? ` · ${curto(f.descricao)}` : ''} — disp. ${moeda(f.disponivel)} · ${SITUACOES[f.situacao].rotulo}`,
          attrs: { 'data-busca': normalizarTexto(`${s.codigo} ${s.nome} ${f.ficha} ${f.despesa} ${f.descricao} ${SITUACOES[f.situacao].rotulo}`) }
        }))
      }))
    ];
  }

  /** Busca no destino: oculta as opções (e grupos) que não correspondem. */
  function ligarBusca(input, select) {
    input.addEventListener('input', () => {
      const termos = normalizarTexto(input.value).split(/\s+/).filter(Boolean);
      select.querySelectorAll('optgroup').forEach((grupo) => {
        let algum = false;
        grupo.querySelectorAll('option').forEach((opcao) => {
          const visivel = termos.every((t) => opcao.dataset.busca.includes(t)) || opcao.selected;
          opcao.hidden = !visivel;
          algum = algum || visivel;
        });
        grupo.hidden = !algum;
      });
    });
  }

  /* -------------------------------- Blocos -------------------------------- */

  function blocoOrigem(f) {
    const item = (rotulo, valor) => criar('div', { filhos: [criar('dt', { texto: rotulo }), criar('dd', { texto: valor })] });
    return criar('section', {
      classe: `transferencia__origem transferencia__origem--${f.situacao}`,
      testid: 'transferencia-origem',
      attrs: { 'aria-label': 'Ficha de origem' },
      filhos: [
        criar('p', { classe: 'transferencia__rotulo', texto: 'Origem' }),
        criar('p', {
          classe: 'transferencia__ficha',
          filhos: [`${nomeFicha(f)} · ${f.despesa}${f.descricao ? ` · ${f.descricao}` : ''} `, seloSituacao(f.situacao, { testid: 'transferencia-origem-situacao' })]
        }),
        criar('dl', {
          classe: 'transferencia__valores',
          filhos: [
            item('Saldo Ficha', moeda(f.saldoFicha)),
            item('Reserva', moeda(f.reserva)),
            item('Disponível', moeda(f.disponivel)),
            item('Essencial', moeda(f.necessidade))
          ]
        })
      ]
    });
  }

  /** Célula "antes → depois" (destaca quando muda). */
  function mudanca(antes, depois, formatar) {
    if (antes === depois) return criar('span', { texto: formatar(antes) });
    return criar('span', {
      classe: 'transferencia__mudanca',
      filhos: [
        criar('span', { classe: 'transferencia__antes', texto: formatar(antes) }),
        criar('span', { attrs: { 'aria-hidden': 'true' }, texto: ' → ' }),
        criar('strong', { classe: depois > antes ? 'valor--positivo' : 'valor--negativo', texto: formatar(depois) }),
        criar('span', { classe: 'sr-only', texto: ` (passa de ${formatar(antes)} para ${formatar(depois)})` })
      ]
    });
  }

  function linhaPrevia(rotulo, { antes, depois }) {
    const situacoes = antes.situacao === depois.situacao
      ? seloSituacao(depois.situacao)
      : criar('span', { classe: 'transferencia__mudanca', filhos: [seloSituacao(antes.situacao), ' → ', seloSituacao(depois.situacao)] });
    return criar('tr', {
      filhos: [
        criar('th', { attrs: { scope: 'row' }, texto: `${rotulo}: ${nomeFicha(depois)}` }),
        criar('td', { classe: 'tabela__celula--num', filhos: [mudanca(antes.saldoFicha, depois.saldoFicha, moeda)] }),
        criar('td', { classe: 'tabela__celula--num', filhos: [mudanca(antes.reserva, depois.reserva, moeda)] }),
        criar('td', { filhos: [situacoes] })
      ]
    });
  }

  /**
   * Redesenha a prévia e devolve se a origem piora para uma situação grave
   * (nesse caso, a ciência do usuário é obrigatória).
   */
  function desenharPrevia(area, sim) {
    limpar(area);
    const { origem, destino } = sim;
    if (!destino.antes) {
      area.append(criar('p', { classe: 'form__dica', texto: 'Selecione o destino e informe os valores para ver a prévia.' }));
      return false;
    }
    const avisos = [];
    const origemPiora = mov.piora(origem.antes.situacao, origem.depois.situacao) && mov.ehGrave(origem.depois.situacao);
    if (origemPiora) {
      avisos.push(alerta({ nivel: 'aviso', testid: 'transferencia-aviso-origem', mensagem: `Atenção: a ficha de origem passará para "${SITUACOES[origem.depois.situacao].rotulo}" (disponível ${moeda(origem.depois.disponivel)} para um Essencial de ${moeda(origem.depois.necessidade)}).` }));
    }
    if (mov.ehGrave(destino.antes.situacao) && !mov.ehGrave(destino.depois.situacao)) {
      avisos.push(alerta({ nivel: 'sucesso', testid: 'transferencia-regulariza-destino', mensagem: `A transferência regulariza a ficha de destino (passa para "${SITUACOES[destino.depois.situacao].rotulo}").` }));
    } else if (destino.depois.disponivel < destino.depois.necessidade) {
      avisos.push(alerta({ nivel: 'info', testid: 'transferencia-destino-insuficiente', mensagem: `Mesmo com a transferência, faltarão ${moeda(destino.depois.necessidade - destino.depois.disponivel)} para cobrir o Essencial do destino.` }));
    }

    area.append(
      criar('table', {
        classe: 'tabela transferencia__previa',
        testid: 'transferencia-previa',
        filhos: [
          criar('caption', { classe: 'tabela__legenda', texto: 'Prévia da transferência' }),
          criar('thead', { filhos: [criar('tr', { filhos: ['Ficha', 'Saldo Ficha', 'Reserva', 'Situação'].map((t) => criar('th', { attrs: { scope: 'col' }, texto: t })) })] }),
          criar('tbody', { filhos: [linhaPrevia('Origem', origem), linhaPrevia('Destino', destino)] })
        ]
      }),
      ...avisos
    );
    return origemPiora;
  }

  /* --------------------------------- Modal -------------------------------- */

  /**
   * Abre a modal de transferência.
   * @param {Object} opcoes
   * @param {{secretaria:string, ficha:string}} opcoes.origem
   * @param {Function} [opcoes.aoConcluir] recebe o lançamento gravado (ex.: devolver o foco)
   */
  function abrir({ origem, aoConcluir }) {
    const secretarias = store.getSecretariasProjetadas();
    const fichaOrigem = mov.encontrarFicha(secretarias, origem);
    if (!fichaOrigem) {
      toast.erro('Ficha de origem não encontrada.');
      return;
    }

    const busca = campo({ id: 'transf-busca', nome: 'buscaDestino', rotulo: 'Buscar destino', tipo: 'search', testid: 'input-transferencia-busca', dica: 'Secretaria, ficha, despesa, descrição ou situação.', attrs: { autocomplete: 'off', placeholder: 'Ex.: 02.04, 512, 3.3.90.39, déficit' } });
    const destino = campo({ id: 'transf-destino', nome: 'destino', rotulo: 'Ficha de destino', tipo: 'select', obrigatorio: true, testid: 'select-transferencia-destino', opcoes: opcoesDestino(secretarias, fichaOrigem), dica: 'Ordenadas por necessidade: ▼ Déficit, = Atende, ▲ Positivo.' });
    const campoValor = (chave, rotulo) => {
      const wrapper = campo({
        id: `transf-${chave}`, nome: chave, rotulo: `${rotulo} a transferir`, testid: `input-transferencia-${chave}`,
        dica: `Disponível na origem: ${moeda(fichaOrigem[chave])}`, attrs: { inputmode: 'decimal', placeholder: '0,00', autocomplete: 'off' }
      });
      const input = wrapper.querySelector('input');
      wrapper.append(botao({
        rotulo: 'Usar total', tamanho: 'pequeno', variante: 'fantasma', testid: `btn-transferencia-total-${chave}`,
        attrs: { disabled: fichaOrigem[chave] <= 0 || null },
        aoClicar: () => { input.value = numero(Math.max(0, fichaOrigem[chave])); input.dispatchEvent(new Event('input', { bubbles: true })); }
      }));
      return wrapper;
    };
    const instrumento = campo({ id: 'transf-instrumento', nome: 'instrumento', rotulo: 'Instrumento', tipo: 'select', testid: 'select-transferencia-instrumento', opcoes: config.INSTRUMENTOS_TRANSFERENCIA, dica: 'Informativo por enquanto.' });
    const motivo = campo({ id: 'transf-motivo', nome: 'motivo', rotulo: 'Motivo / justificativa', tipo: 'textarea', testid: 'input-transferencia-motivo', classeExtra: 'form__campo--largo', attrs: { maxlength: 500 } });

    const previa = criar('div', { classe: 'form__campo--largo transferencia__area-previa', attrs: { 'aria-live': 'polite' } });
    const ciente = criar('input', { testid: 'check-transferencia-ciente', attrs: { type: 'checkbox', id: 'transf-ciente', name: 'ciente' } });
    const erroCiente = criar('p', { classe: 'form__erro', testid: 'check-transferencia-ciente-erro', attrs: { id: 'transf-ciente-erro', 'aria-live': 'polite' } });
    const blocoCiente = criar('div', {
      classe: 'form__campo form__campo--largo transferencia__ciente',
      attrs: { hidden: true },
      filhos: [
        criar('label', { classe: 'transferencia__check', attrs: { for: 'transf-ciente' }, filhos: [ciente, ' Estou ciente de que a ficha de origem ficará em déficit.'] }),
        erroCiente
      ]
    });

    const formulario = criar('form', {
      classe: 'form form--grade transferencia',
      testid: 'form-transferencia',
      attrs: { id: 'form-transferencia', novalidate: true },
      filhos: [
        resumoErros('form-transferencia-resumo-erros'),
        criar('div', { classe: 'form__campo--largo', filhos: [blocoOrigem(fichaOrigem)] }),
        busca, destino,
        campoValor('saldoFicha', 'Saldo Ficha'), campoValor('reserva', 'Reserva'),
        instrumento, motivo, previa, blocoCiente
      ]
    });

    const selectDestino = destino.querySelector('select');
    ligarBusca(busca.querySelector('input'), selectDestino);

    const coletar = () => {
      const v = Object.fromEntries(new FormData(formulario).entries());
      const [secretaria = '', ficha = ''] = (v.destino || '').split('|');
      return { origem, destino: { secretaria, ficha }, saldoFicha: v.saldoFicha, reserva: v.reserva, instrumento: v.instrumento, motivo: v.motivo };
    };

    let exigeCiencia = false;
    const atualizarPrevia = () => {
      exigeCiencia = desenharPrevia(previa, mov.simular(store.getSecretariasProjetadas(), coletar()));
      blocoCiente.hidden = !exigeCiencia;
      if (!exigeCiencia) { ciente.checked = false; erroCiente.textContent = ''; }
    };
    formulario.addEventListener('input', (e) => { if (e.target !== busca.querySelector('input')) atualizarPrevia(); });
    formulario.addEventListener('change', atualizarPrevia);

    const { fechar } = modal.abrir({
      titulo: `Transferir recursos — ficha ${fichaOrigem.ficha}`,
      testid: 'modal-transferencia',
      tamanho: 'largo',
      conteudo: formulario,
      acoes: [
        { rotulo: 'Cancelar', testid: 'btn-transferencia-cancelar', aoClicar: ({ fechar: f }) => f() },
        { rotulo: 'Transferir', variante: 'primario', tipo: 'submit', form: 'form-transferencia', testid: 'btn-transferencia-confirmar' }
      ]
    });
    atualizarPrevia();
    busca.querySelector('input').focus();

    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const dados = coletar();
      const { origem: erroOrigem, ...erros } = mov.validar(store.getSecretariasProjetadas(), dados);
      if (erroOrigem) { toast.erro(erroOrigem); return; }
      if (!aplicarErros(formulario, erros)) return;
      if (exigeCiencia && !ciente.checked) {
        erroCiente.textContent = 'Confirme a ciência para continuar.';
        ciente.focus();
        return;
      }
      let lancamento;
      try {
        lancamento = store.transferir(dados);
      } catch (erro) {
        if (erro.erros) aplicarErros(formulario, erro.erros);
        else toast.erro(erro.message);
        return;
      }
      fechar();
      toast.sucesso(`Transferido ${descreverValores(lancamento)} da ficha ${lancamento.origem.ficha} (${lancamento.origem.secretaria}) para a ficha ${lancamento.destino.ficha} (${lancamento.destino.secretaria}).`);
      if (aoConcluir) aoConcluir(lancamento);
    });
  }

  App.modules.transferencia = Object.freeze({ abrir, descreverValores });
})(window.OrcApp);
