/**
 * @file config.js
 * @description Configurações centrais e imutáveis da aplicação.
 * Para incluir/remover secretarias de forma permanente, edite SECRETARIAS_PADRAO
 * (ou use o módulo "Configurações" na interface, que persiste localmente).
 */
(function (App) {
  'use strict';

  /** Lista inicial de Unidades Orçamentárias (extraída da aba GERAL da planilha). */
  const SECRETARIAS_PADRAO = Object.freeze([
    { codigo: '02.01', nome: 'Gabinete do Prefeito' },
    { codigo: '02.02', nome: 'Secretaria Municipal de Habitação e Urbanismo' },
    { codigo: '02.04', nome: 'Secretaria Municipal de Educação' },
    { codigo: '02.06', nome: 'Secretaria Municipal de Saúde' },
    { codigo: '02.07', nome: 'Secretaria Municipal de Esportes' },
    { codigo: '02.08', nome: 'Secretaria Municipal de Segurança' },
    { codigo: '02.09', nome: 'Secretaria Municipal de Assistência Social' },
    { codigo: '02.10', nome: 'Fundo Municipal de Assistência Social' },
    { codigo: '02.11', nome: 'Secretaria Municipal de Cultura' },
    { codigo: '02.12', nome: 'Secretaria Municipal de Infraestrutura' },
    { codigo: '02.21', nome: 'Encargos Gerais' },
    { codigo: '02.32', nome: 'Procuradoria Geral do Município' },
    { codigo: '02.34', nome: 'Secretaria Municipal de Desenvolvimento Econômico' },
    { codigo: '02.35', nome: 'Secretaria Municipal de Zeladoria e Serviços' },
    { codigo: '02.36', nome: 'Secretaria Municipal de Governo e Relações Institucionais' },
    { codigo: '02.37', nome: 'Secretaria Municipal de Administração' },
    { codigo: '02.38', nome: 'Secretaria Municipal da Fazenda' },
    { codigo: '02.39', nome: 'Secretaria Municipal de Comunicação' },
    { codigo: '02.40', nome: 'Secretaria Municipal de Turismo' },
    { codigo: '02.41', nome: 'Secretaria Municipal do Meio Ambiente' },
    { codigo: '02.42', nome: 'Secretaria Municipal de Agricultura' }
  ].map(Object.freeze));

  /**
   * Definição dos campos de uma linha de despesa.
   * Usada pelo formulário, pela tabela, pela exportação e pela validação.
   * `cabecalhoPlanilha` = rótulo gravado no Excel (compatível com a planilha original).
   */
  const CAMPOS_LINHA = Object.freeze([
    { chave: 'ficha',       rotulo: 'Nº Ficha',            cabecalhoPlanilha: 'Ficha',        tipo: 'texto',  obrigatorio: true },
    { chave: 'ue',          rotulo: 'U.E',                 cabecalhoPlanilha: 'U.E',          tipo: 'texto',  obrigatorio: true },
    { chave: 'fonte',       rotulo: 'Fonte de Recurso',    cabecalhoPlanilha: 'FR',           tipo: 'texto',  obrigatorio: true },
    { chave: 'despesa',     rotulo: 'Cód. Despesa',        cabecalhoPlanilha: 'N. Despesa',   tipo: 'texto',  obrigatorio: true },
    { chave: 'descricao',   rotulo: 'Descrição',           cabecalhoPlanilha: 'Descrição',    tipo: 'texto',  obrigatorio: false },
    { chave: 'observacao',  rotulo: 'Observação (Período)', cabecalhoPlanilha: 'Observação',  tipo: 'texto',  obrigatorio: false },
    { chave: 'essencial',   rotulo: 'Valor Essencial',     cabecalhoPlanilha: 'Essencial',    tipo: 'moeda',  obrigatorio: false },
    { chave: 'antes',       rotulo: 'Valor Anterior',      cabecalhoPlanilha: 'Antes',        tipo: 'moeda',  obrigatorio: false },
    // "Cortes" foi removido (v1.4): a coluna é ignorada na leitura e não é exportada.
    { chave: 'reserva',    rotulo: 'Valor Reserva',       cabecalhoPlanilha: 'Reserva',      tipo: 'moeda',  obrigatorio: false },
    { chave: 'saldoFicha',  rotulo: 'Saldo Ficha',         cabecalhoPlanilha: 'Saldo ficha',  tipo: 'moeda',  obrigatorio: false },
    // v1.1: notas livres (antes misturadas na "Observação"). Gravado na coluna K.
    { chave: 'anotacao',    rotulo: 'Anotações',           cabecalhoPlanilha: 'Anotações',    tipo: 'texto',  obrigatorio: false }
  ].map(Object.freeze));

  /** Textos-padrão de despacho (extraídos da aba GERAL, células A63:A66). */
  const MENSAGENS_PARECER = Object.freeze({
    consta: 'Informo que o valor e a despesa constam na planilha. Para demais providências.',
    valorMenor: 'Informo que a despesa consta, mas o valor está MENOR, sendo necessário adequar os valores da planilha. Para demais providências.',
    naoConsta: 'Informo que a despesa NÃO consta na planilha. Para demais providências.',
    adequado: 'Informo que foi realizado a adequação da despesa na planilha. Para demais providências.'
  });

  /**
   * Integração Fiorilli — relatório de Notas de Reserva ("download-dd-mm-aaaa.xls"):
   * letra da coluna de cada campo. Pode ser alterado pelo usuário em Configurações.
   * Conferido no arquivo de 15/09/2026: R=Ficha, W=U.E, Y=Despesa, BD=Fonte,
   * AS=Processo, BL=Saldo da Reserva, BM=Saldo orçamentário da ficha.
   * (Layout antigo "download-SaldoDotacao-*.csv": V, AT, AZ, AV, BK, BD e sem processo.)
   */
  const FIORILLI_COLUNAS_PADRAO = Object.freeze({
    ficha: 'R',
    ue: 'W',
    fonte: 'BD',
    despesa: 'Y',
    processo: 'AS',
    reserva: 'BL',
    saldoFicha: 'BM'
  });

  /**
   * Filtro das notas que compõem a Reserva (quanto cada secretaria pode gastar).
   * Lista vazia = sem restrição. Alterável em Configurações.
   */
  const FILTRO_RESERVAS_PADRAO = Object.freeze({
    processos: Object.freeze(['001.003', '001.003.1', '001.003.3']),
    fontes: Object.freeze(['1'])
  });

  /**
   * Situação orçamentária de uma ficha (v1.5: três níveis). Compara o disponível
   * (Reserva + Saldo Ficha, já com as movimentações) com a necessidade
   * (soma do Essencial da ficha), com tolerância de TOLERANCIA_CONFERENCIA.
   * `ordem` = gravidade (0 = mais grave), usada para ordenar e filtrar.
   */
  const SITUACOES_FICHA = Object.freeze({
    deficit:  Object.freeze({ ordem: 0, rotulo: 'Déficit',  icone: '▼', descricao: 'O disponível não cobre o Essencial (inclui fichas zeradas).' }),
    atende:   Object.freeze({ ordem: 1, rotulo: 'Atende',   icone: '=', descricao: 'O disponível é igual ao Essencial (sem sobra).' }),
    positivo: Object.freeze({ ordem: 2, rotulo: 'Positivo', icone: '▲', descricao: 'O disponível supera o Essencial.' })
  });

  /**
   * Opções oferecidas como caixas de seleção no filtro de reservas
   * (Configurações e atualização Fiorilli). Outros códigos podem ser digitados.
   */
  const PROCESSOS_DISPONIVEIS = Object.freeze(['001.003', '001.003.1', '001.003.2', '001.003.3', '001.005']);
  const FONTES_DISPONIVEIS = Object.freeze(['1', '2', '3', '5', '8']);

  /** Instrumento legal da movimentação (por ora apenas informativo; o filtro virá depois). */
  const INSTRUMENTOS_TRANSFERENCIA = Object.freeze([
    Object.freeze({ valor: '', rotulo: 'A definir' }),
    Object.freeze({ valor: 'decreto', rotulo: 'Decreto (mais simples e rápido)' }),
    Object.freeze({ valor: 'lei', rotulo: 'Projeto de Lei (mais demorado)' })
  ]);

  App.core.config = Object.freeze({
    APP_NOME: 'Planejamento e Orçamento',
    APP_VERSAO: '1.5.0',
    ORGAO: 'Prefeitura Municipal de Botucatu',
    LOGO: 'assets/img/brasao.png',
    STORAGE_KEY: 'orcamento-botucatu:v1',
    TEMA_STORAGE_KEY: 'orcamento-botucatu:tema',
    FIORILLI_COLUNAS_PADRAO,
    FILTRO_RESERVAS_PADRAO,
    VERSAO_DADOS: 1,
    PADRAO_CODIGO_SECRETARIA: /^\d{2}\.\d{2}$/,
    TOLERANCIA_CONFERENCIA: 0.01,
    EXTENSOES_ACEITAS: Object.freeze(['xlsx', 'xls', 'csv']),
    SECRETARIAS_PADRAO,
    CAMPOS_LINHA,
    CAMPOS_NUMERICOS: Object.freeze(CAMPOS_LINHA.filter((c) => c.tipo === 'moeda').map((c) => c.chave)),
    MENSAGENS_PARECER,
    SITUACOES_FICHA,
    PROCESSOS_DISPONIVEIS,
    FONTES_DISPONIVEIS,
    INSTRUMENTOS_TRANSFERENCIA
  });
})(window.OrcApp);
