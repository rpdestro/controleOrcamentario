/**
 * @file validators.js
 * @description Regras de validação PURAS. Retornam sempre
 * { valido: boolean, erros: { [campo]: mensagem } } para que a UI
 * exiba mensagens acessíveis junto a cada campo.
 */
(function (App) {
  'use strict';

  const { paraNumero } = App.utils.format;
  const config = App.core.config;

  const PADROES = Object.freeze({
    ficha: /^\d{1,6}$/,
    ue: /^\d{6}$/,
    fonte: /^[0-9A-Za-z.\-]{1,10}$/,
    despesa: /^\d{1,2}(\.\d{1,2}){2,4}$/ // 3.3.90.30 | 33.91.97 | 4.4.90.52
  });

  function resultado(erros) {
    return { valido: Object.keys(erros).length === 0, erros };
  }

  /**
   * Valida uma linha de despesa (valores podem vir como texto do formulário).
   * @param {Object} linha
   */
  function validarLinha(linha) {
    const erros = {};
    const texto = (v) => String(v === null || v === undefined ? '' : v).trim();

    if (!texto(linha.ficha)) erros.ficha = 'Informe o número da ficha.';
    else if (!PADROES.ficha.test(texto(linha.ficha))) erros.ficha = 'A ficha deve conter apenas números (até 6 dígitos).';

    if (!texto(linha.ue)) erros.ue = 'Informe a Unidade Executora.';
    else if (!PADROES.ue.test(texto(linha.ue))) erros.ue = 'A U.E deve conter 6 dígitos (ex.: 020101).';

    if (!texto(linha.fonte)) erros.fonte = 'Informe a fonte de recurso.';
    else if (!PADROES.fonte.test(texto(linha.fonte))) erros.fonte = 'Fonte de recurso inválida.';

    if (!texto(linha.despesa)) erros.despesa = 'Informe o código da despesa.';
    else if (!PADROES.despesa.test(texto(linha.despesa))) erros.despesa = 'Código inválido. Use o formato 3.3.90.30.';

    if (texto(linha.descricao).length > 500) erros.descricao = 'A descrição deve ter no máximo 500 caracteres.';
    if (texto(linha.observacao).length > 300) erros.observacao = 'A observação deve ter no máximo 300 caracteres.';
    if (texto(linha.anotacao).length > 1000) erros.anotacao = 'As anotações devem ter no máximo 1000 caracteres.';

    config.CAMPOS_NUMERICOS.forEach((campo) => {
      const valor = paraNumero(linha[campo]);
      if (Number.isNaN(valor)) erros[campo] = 'Valor numérico inválido. Ex.: 1.234,56';
      else if (valor < 0) erros[campo] = 'O valor não pode ser negativo.';
    });

    // Período padronizado (competências 'AAAA-MM'). Só é validado quando o
    // formulário envia os campos estruturados.
    if ('periodoInicio' in linha) {
      const periodo = App.utils.periodo;
      const inicio = texto(linha.periodoInicio);
      const fim = texto(linha.periodoFim);
      if (inicio && !periodo.valido(inicio)) erros.periodoInicio = 'Mês inicial inválido.';
      else if (fim && !periodo.valido(fim)) erros.periodoFim = 'Mês final inválido.';
      else if (inicio && fim && fim < inicio) erros.periodoFim = 'O mês final deve ser igual ou posterior ao inicial.';
      else if (!inicio && fim) erros.periodoInicio = 'Selecione o mês inicial.';
      else if (!inicio && paraNumero(linha.essencial) > 0) erros.periodoInicio = 'Selecione o período: obrigatório quando há valor Essencial.';
    }

    return resultado(erros);
  }

  /**
   * Valida o cadastro de uma secretaria.
   * @param {{codigo:string,nome:string}} dados
   * @param {string[]} codigosExistentes códigos já cadastrados
   * @param {string} [codigoOriginal] código em edição (permite manter o mesmo)
   */
  function validarSecretaria(dados, codigosExistentes, codigoOriginal) {
    const erros = {};
    const codigo = String(dados.codigo || '').trim();
    const nome = String(dados.nome || '').trim();

    if (!codigo) erros.codigo = 'Informe o código da Unidade Orçamentária.';
    else if (!config.PADRAO_CODIGO_SECRETARIA.test(codigo)) erros.codigo = 'Use o formato 02.01.';
    else if (codigo !== codigoOriginal && codigosExistentes.includes(codigo)) erros.codigo = 'Já existe uma secretaria com este código.';

    if (!nome) erros.nome = 'Informe o nome da secretaria.';
    else if (nome.length > 120) erros.nome = 'O nome deve ter no máximo 120 caracteres.';

    return resultado(erros);
  }

  /** Valida o valor da folha de pagamento informado para a secretaria. */
  function validarValor(valor) {
    const numero = paraNumero(valor);
    if (Number.isNaN(numero)) return resultado({ valor: 'Valor numérico inválido. Ex.: 1.234,56' });
    if (numero < 0) return resultado({ valor: 'O valor não pode ser negativo.' });
    return resultado({});
  }

  /** Valida o arquivo escolhido para importação. */
  function validarArquivo(arquivo) {
    if (!arquivo) return resultado({ arquivo: 'Selecione um arquivo.' });
    const extensao = String(arquivo.name || '').split('.').pop().toLowerCase();
    if (!config.EXTENSOES_ACEITAS.includes(extensao)) {
      return resultado({ arquivo: `Formato ".${extensao}" não suportado. Use XLS, XLSX ou CSV.` });
    }
    if (arquivo.size === 0) return resultado({ arquivo: 'O arquivo está vazio.' });
    return resultado({});
  }

  App.utils.validators = Object.freeze({ validarLinha, validarSecretaria, validarValor, validarArquivo, PADROES });
})(window.OrcApp);
