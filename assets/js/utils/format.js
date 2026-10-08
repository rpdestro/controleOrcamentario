/**
 * @file format.js
 * @description Funções PURAS de formatação e conversão (sem acesso ao DOM).
 * Totalmente testáveis de forma isolada (ver /tests).
 */
(function (App) {
  'use strict';

  const formatadorMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatadorNumero = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** Arredonda para 2 casas evitando erros de ponto flutuante (ex.: 0.1 + 0.2). */
  function arredondar(valor) {
    return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
  }

  /** 1234.5 -> "R$ 1.234,50" */
  function moeda(valor) {
    return formatadorMoeda.format(arredondar(valor || 0));
  }

  /** 1234.5 -> "1.234,50" */
  function numero(valor) {
    return formatadorNumero.format(arredondar(valor || 0));
  }

  /**
   * Converte valores digitados/lidos em número.
   * Aceita: 1234.5 | "1234,5" | "1.234,56" | "R$ 1.234,56" | "-300" | "1,5E-10" | "" (=0).
   * Retorna NaN quando o texto não representa um número (ex.: "300,69,").
   */
  function paraNumero(valor) {
    if (valor === null || valor === undefined) return 0;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;

    let texto = String(valor).replace(/R\$/gi, '').replace(/\s/g, '').trim();
    if (texto === '' || texto === '-') return 0;

    if (texto.includes(',')) {
      // Formato brasileiro: ponto = milhar, vírgula = decimal.
      texto = texto.replace(/\./g, '').replace(',', '.');
    }
    // Aceita notação científica exportada pelo Fiorilli (ex.: "1,16E-10").
    if (!/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(texto)) return NaN;
    return Number(texto);
  }

  /** Remove acentos, caixa e espaços extras: " Observação " -> "observacao". */
  function normalizarTexto(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Date -> "dd/mm/aaaa" */
  function dataBR(data) {
    const d = data instanceof Date ? data : new Date(data);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
  }

  /** Date -> "dd/mm/aaaa hh:mm" */
  function dataHoraBR(data) {
    const d = data instanceof Date ? data : new Date(data);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  /**
   * Compara duas datas "dd/mm/aaaa" (o texto pode ter outras palavras em volta).
   * Retorna -1 (a antes de b), 0 (iguais) ou 1; 0 também quando alguma não é reconhecida.
   */
  function compararDatasBR(a, b) {
    const chave = (t) => {
      const m = String(t || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : null;
    };
    const [ka, kb] = [chave(a), chave(b)];
    if (ka === null || kb === null || ka === kb) return 0;
    return ka < kb ? -1 : 1;
  }

  /** Texto seguro para nomes de arquivo: "Relatório 02.01" -> "relatorio-02-01" */
  function slug(texto) {
    return normalizarTexto(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /** "Secretaria Municipal de Saúde" -> "Saúde" (rótulos compactos em menus/gráficos). */
  function nomeCurto(nome) {
    return String(nome || '').replace(/^Secretaria Municipal (de |da |do |dos |das )?/i, '');
  }

  App.utils.format = Object.freeze({
    arredondar, moeda, numero, paraNumero, normalizarTexto, dataBR, dataHoraBR, compararDatasBR, slug, nomeCurto
  });
})(window.OrcApp);
