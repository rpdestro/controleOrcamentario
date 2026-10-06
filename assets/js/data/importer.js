/**
 * @file importer.js
 * @description Leitura de arquivos XLS / XLSX / CSV e conversão para o modelo.
 *
 * Formatos reconhecidos:
 *  1. "Layout por abas" (planilha original): uma aba por secretaria nomeada
 *     no padrão NN.NN (ex.: 02.01) + aba GERAL (consolidado).
 *     Estrutura de cada aba:
 *        A1 = nome | A2 = "Atualizado em dd/mm/aaaa" | linha de cabeçalho
 *        (Ficha, U.E, FR, N. Despesa, Descrição, Observação, Essencial,
 *        Antes, [Cortes — ignorada], Reserva, Saldo ficha) | linhas de dados | linha de
 *        SUBTOTAL | bloco-resumo (Essencial, Reserva, Saldo ficha, Folha, TOTAL)
 *        | lançamentos abaixo do TOTAL ("fora do quadro", não somados).
 *  2. "Tabela plana" (CSV/XLSX exportado pela aplicação): uma linha por
 *     despesa contendo a coluna U.O. (código da secretaria).
 *
 * As funções `lerAba*`, `lerTabelaPlana` e `parseCsv` são puras (recebem
 * matrizes) e, portanto, testáveis sem arquivos reais.
 */
(function (App) {
  'use strict';

  const { paraNumero, normalizarTexto } = App.utils.format;
  const { criarSecretaria, ordenarSecretarias } = App.data.schema;
  const { conferirSecretaria } = App.data.calculos;
  const config = App.core.config;

  /**
   * Reconhecedores de cabeçalho. A ORDEM importa: "Saldo ficha" deve ser
   * testado antes de "Ficha" e "Cortes despesa" antes de "Despesa".
   */
  const RECONHECEDORES = Object.freeze([
    ['saldoFicha', /^saldo/],
    // "Cortes" é reconhecida apenas para ser IGNORADA (não é campo do modelo).
    ['cortes', /^cortes?\b/],
    ['codigoSecretaria', /^(u\.?\s?o\.?|cod(igo)?\.?\s(da\s)?secretaria)$/],
    ['nomeSecretaria', /^(local|secretaria|nome\s(da\s)?secretaria)$/],
    ['ficha', /ficha/],
    ['ue', /^u\.?\s?e\.?$/],
    ['fonte', /^(fr|fonte(\sde\srecurso)?)$/],
    ['despesa', /despesa/],
    ['descricao', /^descri/],
    ['observacao', /^observa|periodo/],
    ['essencial', /essencial/],
    ['antes', /^antes|anterior/],
    ['reserva', /reserva/],
    ['folha', /^folha/],
    ['tipo', /^tipo/],
    ['anotacao', /^anota/]
  ]);

  const ROTULOS_RESUMO = Object.freeze(['essencial', 'reserva', 'saldo ficha', 'folha', 'total']);
  const CAMPOS_TEXTO = Object.freeze(['ficha', 'ue', 'fonte', 'despesa', 'descricao', 'observacao', 'anotacao']);

  const vazio = (v) => v === null || v === undefined || String(v).trim() === '';

  /** Mapeia { chaveDoCampo: índiceDaColuna } a partir de uma linha de cabeçalho. */
  function mapearCabecalho(linha = []) {
    const mapa = {};
    linha.forEach((celula, indice) => {
      const t = normalizarTexto(celula);
      if (!t) return;
      const encontrado = RECONHECEDORES.find(([chave, regex]) => !(chave in mapa) && regex.test(t));
      if (encontrado) mapa[encontrado[0]] = indice;
    });
    return mapa;
  }

  /** Extrai "dd/mm/aaaa" de textos como "Atualizado em 01/10/2026". */
  function extrairDataAtualizacao(texto) {
    const m = String(texto || '').match(/atualizado em\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    return m ? m[1] : '';
  }

  /** Código da secretaria pode chegar como número (2.01) quando o Excel converte. */
  function normalizarCodigo(valor) {
    if (typeof valor === 'number') return valor.toFixed(2).padStart(5, '0');
    return String(valor || '').trim();
  }

  /** Converte uma célula numérica registrando alerta quando inválida. */
  function lerNumero(valor, contexto, alertas) {
    const n = paraNumero(valor);
    if (Number.isNaN(n)) {
      alertas.push({ nivel: 'aviso', codigo: contexto.codigo, mensagem: `Aba ${contexto.codigo}, linha ${contexto.linha}: valor inválido "${valor}" em ${contexto.campo} — considerado 0.` });
      return 0;
    }
    return n;
  }

  /** Monta o objeto bruto de uma linha a partir do mapa de colunas. */
  function extrairLinha(linha, colunas, contexto, alertas) {
    const dados = {};
    CAMPOS_TEXTO.forEach((campo) => {
      dados[campo] = campo in colunas ? linha[colunas[campo]] : '';
    });
    config.CAMPOS_NUMERICOS.forEach((campo) => {
      dados[campo] = campo in colunas ? lerNumero(linha[colunas[campo]], { ...contexto, campo }, alertas) : 0;
    });
    return dados;
  }

  /** Procura rótulos do bloco-resumo (Essencial, Reserva, Folha, TOTAL...). */
  function localizarRotuloResumo(linha) {
    for (let i = 0; i < linha.length; i += 1) {
      const t = normalizarTexto(linha[i]);
      if (ROTULOS_RESUMO.includes(t)) {
        const valor = linha.slice(i + 1).find((c) => !vazio(c));
        return { rotulo: t, valor: vazio(valor) ? 0 : paraNumero(valor) };
      }
    }
    return null;
  }

  /**
   * Lê uma aba de secretaria no layout original.
   * @param {Array<Array>} aoa matriz de células (linhas x colunas)
   * @param {string} codigo código da secretaria (nome da aba)
   * @param {number} [deslocamento=0] linha inicial da matriz (para mensagens)
   */
  function lerAbaSecretaria(aoa, codigo, deslocamento = 0) {
    const alertas = [];
    const resultado = { codigo, nome: '', atualizadoEm: '', folha: 0, linhas: [], pendentes: [], referencia: {}, alertas };

    // Cabeçalho = linha com "Despesa" e "Ficha" — ou, tolerando erro de digitação
    // no título "Ficha", linha com U.E + Despesa + Essencial.
    const idxCabecalho = aoa.findIndex((linha) => {
      const mapa = mapearCabecalho(linha || []);
      return 'despesa' in mapa && ('ficha' in mapa || ('ue' in mapa && 'essencial' in mapa));
    });
    if (idxCabecalho < 0) {
      alertas.push({ nivel: 'erro', codigo, mensagem: `Aba ${codigo}: cabeçalho (Ficha / Despesa) não encontrado. Aba ignorada.` });
      return resultado;
    }

    // Título e data de atualização ficam acima do cabeçalho.
    aoa.slice(0, idxCabecalho).forEach((linha) => (linha || []).forEach((celula) => {
      if (vazio(celula)) return;
      const data = extrairDataAtualizacao(celula);
      if (data) resultado.atualizadoEm = data;
      else if (!resultado.nome) resultado.nome = String(celula).trim();
    }));

    const colunas = mapearCabecalho(aoa[idxCabecalho]);
    if (!('ficha' in colunas)) {
      colunas.ficha = Math.max(0, colunas.ue - 1); // coluna imediatamente antes da U.E
      const encontrado = aoa[idxCabecalho][colunas.ficha];
      alertas.push({
        nivel: 'aviso',
        codigo,
        mensagem: `Aba ${codigo}, linha ${idxCabecalho + 1 + deslocamento}: título "Ficha" ausente (célula contém "${encontrado ?? ''}"). Coluna assumida como Ficha.`
      });
    }
    let secao = 'dados'; // dados -> resumo -> pendentes

    for (let i = idxCabecalho + 1; i < aoa.length; i += 1) {
      const linha = aoa[i] || [];
      if (linha.every(vazio)) continue;
      const numeroLinha = i + 1 + deslocamento;

      // Rótulos do bloco-resumo só são procurados em linhas sem ficha,
      // evitando confundir descrições como "Reserva" com o resumo.
      const resumo = vazio(linha[colunas.ficha]) ? localizarRotuloResumo(linha) : null;
      if (resumo) {
        const valor = Number.isNaN(resumo.valor) ? 0 : resumo.valor;
        if (resumo.rotulo === 'folha') resultado.folha = Math.abs(valor);
        if (resumo.rotulo === 'total') resultado.referencia.total = valor;
        secao = resumo.rotulo === 'total' ? 'pendentes' : 'resumo';
        continue;
      }

      const semIdentificacao = vazio(linha[colunas.ficha]) && vazio(linha[colunas.despesa]);
      if (semIdentificacao) {
        // Linha de SUBTOTAL (logo após os dados): guarda para conferência.
        if (secao === 'dados' && 'essencial' in colunas && !vazio(linha[colunas.essencial])) {
          ['essencial', 'reserva', 'saldoFicha'].forEach((campo) => {
            if (campo in colunas) resultado.referencia[campo] = Math.abs(paraNumero(linha[colunas[campo]]) || 0);
          });
          secao = 'resumo';
        }
        continue;
      }

      const dados = extrairLinha(linha, colunas, { codigo, linha: numeroLinha }, alertas);
      if (secao === 'pendentes') resultado.pendentes.push(dados);
      else resultado.linhas.push(dados);
    }
    return resultado;
  }

  /** Lê a aba GERAL: nomes completos e Folha considerada no consolidado. */
  function lerAbaGeral(aoa) {
    const resultado = { secretarias: {}, atualizadoEm: '' };
    const idx = aoa.findIndex((linha) => 'codigoSecretaria' in mapearCabecalho(linha || []));

    aoa.forEach((linha) => (linha || []).forEach((celula) => {
      const data = extrairDataAtualizacao(celula);
      if (data) resultado.atualizadoEm = data;
    }));
    if (idx < 0) return resultado;

    const colunas = mapearCabecalho(aoa[idx]);
    aoa.slice(idx + 1).forEach((linha) => {
      const codigo = normalizarCodigo((linha || [])[colunas.codigoSecretaria]);
      if (!config.PADRAO_CODIGO_SECRETARIA.test(codigo)) return;
      const folha = 'folha' in colunas ? paraNumero(linha[colunas.folha]) : NaN;
      resultado.secretarias[codigo] = {
        nome: 'nomeSecretaria' in colunas ? String(linha[colunas.nomeSecretaria] || '').trim() : '',
        folhaGeral: Number.isNaN(folha) ? undefined : Math.abs(folha)
      };
    });
    return resultado;
  }

  /** Lê uma tabela plana (uma linha por despesa, com coluna U.O.). */
  function lerTabelaPlana(aoa) {
    const alertas = [];
    const idx = aoa.findIndex((linha) => {
      const mapa = mapearCabecalho(linha || []);
      return 'codigoSecretaria' in mapa && 'ficha' in mapa && 'despesa' in mapa;
    });
    if (idx < 0) return { secretarias: [], alertas };

    const colunas = mapearCabecalho(aoa[idx]);
    const mapa = new Map();

    for (let i = idx + 1; i < aoa.length; i += 1) {
      const linha = aoa[i] || [];
      if (linha.every(vazio)) continue;
      const codigo = normalizarCodigo(linha[colunas.codigoSecretaria]);
      if (!config.PADRAO_CODIGO_SECRETARIA.test(codigo)) {
        alertas.push({ nivel: 'aviso', codigo: '', mensagem: `Linha ${i + 1}: código de secretaria inválido "${codigo}". Linha ignorada.` });
        continue;
      }
      if (!mapa.has(codigo)) mapa.set(codigo, { codigo, nome: '', folha: 0, linhas: [], pendentes: [], referencia: null });
      const sec = mapa.get(codigo);
      if (!sec.nome && 'nomeSecretaria' in colunas) sec.nome = String(linha[colunas.nomeSecretaria] || '').trim();
      if (!sec.folha && 'folha' in colunas) sec.folha = Math.abs(paraNumero(linha[colunas.folha]) || 0);

      const dados = extrairLinha(linha, colunas, { codigo, linha: i + 1 }, alertas);
      const foraDoQuadro = 'tipo' in colunas && normalizarTexto(linha[colunas.tipo]).includes('fora');
      (foraDoQuadro ? sec.pendentes : sec.linhas).push(dados);
    }
    return { secretarias: [...mapa.values()], alertas };
  }

  /**
   * Parser CSV simples e robusto (aspas, separador ; ou , detectado automaticamente).
   * @returns {Array<Array<string>>}
   */
  function parseCsv(texto) {
    const conteudo = String(texto || '').replace(/^﻿/, '');
    const primeiraLinha = conteudo.split(/\r?\n/, 1)[0] || '';
    const separador = (primeiraLinha.match(/;/g) || []).length >= (primeiraLinha.match(/,/g) || []).length ? ';' : ',';

    const linhas = [];
    let linha = [];
    let campo = '';
    let entreAspas = false;

    for (let i = 0; i < conteudo.length; i += 1) {
      const c = conteudo[i];
      if (entreAspas) {
        if (c === '"' && conteudo[i + 1] === '"') { campo += '"'; i += 1; }
        else if (c === '"') entreAspas = false;
        else campo += c;
      } else if (c === '"' && campo === '') entreAspas = true; // aspas no meio do campo (ex.: USO "MARCIO) são texto
      else if (c === separador) { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && conteudo[i + 1] === '\n') i += 1;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else campo += c;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  /** Converte uma aba do SheetJS em matriz, preservando o deslocamento de linhas. */
  function abaParaMatriz(XLSX, aba) {
    if (!aba || !aba['!ref']) return { aoa: [], deslocamento: 0 };
    const deslocamento = XLSX.utils.decode_range(aba['!ref']).s.r;
    const aoa = XLSX.utils.sheet_to_json(aba, { header: 1, raw: true, defval: null, blankrows: true });
    return { aoa, deslocamento };
  }

  /**
   * Interpreta um workbook do SheetJS (layout por abas ou tabela plana).
   * @returns {{secretarias:Array, atualizadoEm:string, alertas:Array}}
   */
  function importarWorkbook(XLSX, workbook) {
    const alertas = [];
    const nomeGeral = workbook.SheetNames.find((n) => normalizarTexto(n) === 'geral');
    const geral = nomeGeral ? lerAbaGeral(abaParaMatriz(XLSX, workbook.Sheets[nomeGeral]).aoa) : { secretarias: {}, atualizadoEm: '' };

    const abasSecretaria = workbook.SheetNames.filter((n) => config.PADRAO_CODIGO_SECRETARIA.test(n.trim()));
    let secretarias = abasSecretaria.map((nomeAba) => {
      const { aoa, deslocamento } = abaParaMatriz(XLSX, workbook.Sheets[nomeAba]);
      const lida = lerAbaSecretaria(aoa, nomeAba.trim(), deslocamento);
      alertas.push(...lida.alertas);
      const infoGeral = geral.secretarias[lida.codigo] || {};
      return { ...lida, nome: infoGeral.nome || lida.nome, referencia: { ...lida.referencia, folhaGeral: infoGeral.folhaGeral } };
    });

    // Sem abas NN.NN: tenta tabela plana em cada aba.
    if (secretarias.length === 0) {
      workbook.SheetNames.forEach((nomeAba) => {
        const plana = lerTabelaPlana(abaParaMatriz(XLSX, workbook.Sheets[nomeAba]).aoa);
        secretarias = secretarias.concat(plana.secretarias);
        alertas.push(...plana.alertas);
      });
    }
    return { secretarias, atualizadoEm: geral.atualizadoEm, alertas };
  }

  /** Completa nomes faltantes com a lista padrão e gera alertas de conferência. */
  function finalizar(bruto, nomeArquivo) {
    if (bruto.secretarias.length === 0) {
      throw new Error('Nenhuma secretaria reconhecida. Verifique se as abas seguem o padrão "02.01" ou se o arquivo possui a coluna "U.O.".');
    }
    const padrao = new Map(config.SECRETARIAS_PADRAO.map((s) => [s.codigo, s.nome]));
    const atualizadoEm = bruto.atualizadoEm || (bruto.secretarias.find((s) => s.atualizadoEm) || {}).atualizadoEm || '';
    // A data da base define o ano/mês usados para converter "outubro" em "Out/2026".
    const referencia = App.utils.periodo.referenciaDe(atualizadoEm);
    const secretarias = ordenarSecretarias(bruto.secretarias.map((s) => criarSecretaria({
      ...s, nome: s.nome || padrao.get(s.codigo) || `Secretaria ${s.codigo}`
    }, referencia)));
    const conferencia = secretarias.flatMap(conferirSecretaria);

    return {
      secretarias,
      meta: { arquivo: nomeArquivo, atualizadoEm, importadoEm: new Date().toISOString() },
      alertas: [...bruto.alertas, ...conferencia],
      resumo: {
        qtdSecretarias: secretarias.length,
        qtdLinhas: secretarias.reduce((t, s) => t + s.linhas.length, 0),
        qtdPendentes: secretarias.reduce((t, s) => t + s.pendentes.length, 0)
      }
    };
  }

  /** Decodifica CSV como UTF-8; se houver caracteres inválidos, usa Windows-1252 (Excel BR). */
  function decodificarTexto(buffer) {
    const utf8 = new TextDecoder('utf-8').decode(buffer);
    return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8;
  }

  /**
   * Ponto de entrada: importa um File (input type=file).
   * @param {File} arquivo
   * @returns {Promise<{secretarias, meta, alertas, resumo}>}
   */
  async function importarArquivo(arquivo) {
    const validacao = App.utils.validators.validarArquivo(arquivo);
    if (!validacao.valido) throw new Error(validacao.erros.arquivo);

    const buffer = await arquivo.arrayBuffer();
    const extensao = arquivo.name.split('.').pop().toLowerCase();

    if (extensao === 'csv') {
      const plana = lerTabelaPlana(parseCsv(decodificarTexto(buffer)));
      return finalizar({ ...plana, atualizadoEm: '' }, arquivo.name);
    }

    const XLSX = window.XLSX;
    if (!XLSX) throw new Error('Biblioteca de planilhas (SheetJS) não carregada. Verifique a conexão com a internet ou a pasta assets/vendor.');
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    return finalizar(importarWorkbook(XLSX, workbook), arquivo.name);
  }

  App.data.importer = Object.freeze({
    importarArquivo, importarWorkbook, lerAbaSecretaria, lerAbaGeral, lerTabelaPlana,
    parseCsv, decodificarTexto, abaParaMatriz, mapearCabecalho, extrairDataAtualizacao, finalizar
  });
})(window.OrcApp);
