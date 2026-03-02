import { describe, it, expect } from 'vitest';
import {
  isValidRif,
  normalizeText,
  isNonEmptyString,
  isValidTaxAmount,
  isValidTaxDate,
} from '../validation.helper';

describe('validation.helper', () => {
  describe('isValidRif', () => {
    it('acepta RIF válidos con prefijos V, J, G, E, P', () => {
      expect(isValidRif('V123456789')).toBe(true);
      expect(isValidRif('J123456789')).toBe(true);
      expect(isValidRif('G123456789')).toBe(true);
      expect(isValidRif('E123456789')).toBe(true);
      expect(isValidRif('P123456789')).toBe(true);
    });

    it('ignora mayúsculas/minúsculas y espacios', () => {
      expect(isValidRif('   v123456789   ')).toBe(true);
      expect(isValidRif('j123456789')).toBe(true);
    });

    it('rechaza formatos inválidos', () => {
      expect(isValidRif('X123456789')).toBe(false);
      expect(isValidRif('V123')).toBe(false);
      expect(isValidRif('123456789')).toBe(false);
      expect(isValidRif('V1234567890')).toBe(false);
      expect(isValidRif('')).toBe(false);
      expect(isValidRif(null)).toBe(false);
      expect(isValidRif(undefined)).toBe(false);
    });
  });

  describe('normalizeText', () => {
    it('convierte null/undefined a cadena vacía', () => {
      expect(normalizeText(null)).toBe('');
      expect(normalizeText(undefined)).toBe('');
    });

    it('hace trim y colapsa espacios múltiples', () => {
      expect(normalizeText('  Hola   mundo  ')).toBe('Hola mundo');
    });

    it('devuelve cadena vacía si solo hay espacios', () => {
      expect(normalizeText('    ')).toBe('');
    });
  });

  describe('isNonEmptyString', () => {
    it('detecta strings no vacíos', () => {
      expect(isNonEmptyString('hola')).toBe(true);
      expect(isNonEmptyString('  hola ')).toBe(true);
    });

    it('rechaza valores vacíos o no string', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
    });
  });

  describe('isValidTaxAmount', () => {
    it('acepta montos numéricos válidos y >= 0', () => {
      expect(isValidTaxAmount(0)).toBe(true);
      expect(isValidTaxAmount(10.5)).toBe(true);
      expect(isValidTaxAmount('20')).toBe(true);
    });

    it('rechaza montos negativos, NaN o infinitos', () => {
      expect(isValidTaxAmount(-1)).toBe(false);
      expect(isValidTaxAmount('abc')).toBe(false);
      expect(isValidTaxAmount(NaN)).toBe(false);
      expect(isValidTaxAmount(Infinity)).toBe(false);
    });

    it('rechaza null/undefined', () => {
      expect(isValidTaxAmount(null)).toBe(false);
      expect(isValidTaxAmount(undefined)).toBe(false);
    });
  });

  describe('isValidTaxDate', () => {
    it('acepta fechas válidas en el pasado y presente', () => {
      expect(isValidTaxDate(new Date())).toBe(true);
      expect(isValidTaxDate('2020-01-01')).toBe(true);
    });

    it('rechaza fechas inválidas', () => {
      expect(isValidTaxDate('not-a-date')).toBe(false);
      expect(isValidTaxDate('')).toBe(false);
      expect(isValidTaxDate(null)).toBe(false);
    });

    it('rechaza fechas demasiado futuras (> 1 año)', () => {
      const now = new Date();
      const farFuture = new Date(now);
      farFuture.setFullYear(now.getFullYear() + 2);
      expect(isValidTaxDate(farFuture)).toBe(false);
    });
  });
});

