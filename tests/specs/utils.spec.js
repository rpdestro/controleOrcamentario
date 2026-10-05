/**
 * @file utils.spec.js
 * @description Testes de formatação e validação.
 */
(function (TestRunner, App) {
  'use strict';

  const { describe, it, expect } = TestRunner;
  const f = App.utils.format;
  const v = App.utils.validators;

  describe('format.paraNumero', () => {
    it('aceita número', () => expect(f.paraNumero(10.5)).toBe(10.5));
    it('converte formato brasileiro', () => expect(f.paraNumero('1.234,56')).toBe(1234.56));
    it('remove símbolo de moeda', () => expect(f.paraNumero('R$ 2.000,00')).toBe(2000));
    it('aceita ponto decimal', () => expect(f.paraNumero('300.69')).toBe(300.69));
    it('vazio vira zero', () => expect(f.paraNumero('')).toBe(0));
    it('texto inválido vira NaN (ex.: "300,69," da planilha)', () => expect(Number.isNaN(f.paraNumero('300,69,'))).toBeTruthy());
  });

  describe('format diversos', () => {
    it('arredonda 0.1 + 0.2', () => expect(f.arredondar(0.1 + 0.2)).toBe(0.3));
    it('normaliza texto', () => expect(f.normalizarTexto('  Observação  ')).toBe('observacao'));
    it('gera slug', () => expect(f.slug('Relatório 02.01')).toBe('relatorio-02-01'));
    it('formata moeda', () => expect(f.moeda(1234.5).replace(/\s/g, ' ')).toContain('1.234,50'));
  });

  describe('validators.validarLinha', () => {
    const valida = { ficha: '25', ue: '020101', fonte: '1', despesa: '3.3.90.30', essencial: '1.000,00' };

    it('aceita linha válida', () => expect(v.validarLinha(valida).valido).toBeTruthy());
    it('aceita código de despesa 33.91.97', () => expect(v.validarLinha({ ...valida, despesa: '33.91.97' }).valido).toBeTruthy());
    it('exige ficha', () => expect(v.validarLinha({ ...valida, ficha: '' }).erros.ficha).toBeTruthy());
    it('rejeita U.E com 5 dígitos', () => expect(v.validarLinha({ ...valida, ue: '20101' }).erros.ue).toBeTruthy());
    it('rejeita despesa mal formatada', () => expect(v.validarLinha({ ...valida, despesa: '3390' }).erros.despesa).toBeTruthy());
    it('rejeita valor negativo', () => expect(v.validarLinha({ ...valida, reserva: '-10' }).erros.reserva).toBeTruthy());
    it('rejeita valor não numérico', () => expect(v.validarLinha({ ...valida, saldoFicha: 'abc' }).erros.saldoFicha).toBeTruthy());
  });

  describe('validators.validarSecretaria', () => {
    it('aceita secretaria nova', () => expect(v.validarSecretaria({ codigo: '02.50', nome: 'Nova' }, ['02.01']).valido).toBeTruthy());
    it('rejeita código duplicado', () => expect(v.validarSecretaria({ codigo: '02.01', nome: 'X' }, ['02.01']).erros.codigo).toBeTruthy());
    it('permite manter o próprio código na edição', () => expect(v.validarSecretaria({ codigo: '02.01', nome: 'X' }, ['02.01'], '02.01').valido).toBeTruthy());
    it('rejeita formato inválido', () => expect(v.validarSecretaria({ codigo: '2.1', nome: 'X' }, []).erros.codigo).toBeTruthy());
  });

  describe('validators.validarArquivo', () => {
    it('rejeita extensão PDF', () => expect(v.validarArquivo({ name: 'a.pdf', size: 10 }).valido).toBeFalsy());
    it('rejeita arquivo vazio', () => expect(v.validarArquivo({ name: 'a.xlsx', size: 0 }).valido).toBeFalsy());
    it('aceita CSV', () => expect(v.validarArquivo({ name: 'a.CSV', size: 10 }).valido).toBeTruthy());
  });
})(window.TestRunner, window.OrcApp);
