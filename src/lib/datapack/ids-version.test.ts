import { describe, expect, it } from 'vitest';
import { isValidId, isValidPackId, makeId, parseId, slugify } from './ids';
import { compareSemver, isUpgrade, parseSemver } from './version';
import { POSITIONS } from './types';
import { positionToLegacy } from './positions';

describe('Datapack · ids', () => {
  it('slugify tira acentos, maiúsculas e símbolos', () => {
    expect(slugify('São Paulo F.C.')).toBe('sao-paulo-f-c'); expect(slugify('  Grêmio  ')).toBe('gremio'); expect(slugify('???')).toBe('');
  });
  it('makeId monta e parseId desmonta; slug vazio é recusado', () => {
    expect(makeId('club', 'Atlético-MG')).toBe('club:atletico-mg');
    expect(parseId('club:atletico-mg')).toEqual({ kind: 'club', slug: 'atletico-mg' });
    expect(parseId('xx:abc')).toBeNull(); expect(parseId('club:ABC')).toBeNull(); expect(parseId('club')).toBeNull();
    expect(() => makeId('plr', '###')).toThrow();
  });
  it('o id gerado sempre é válido e não depende do clube', () => {
    for (const t of ['Zé Roberto', 'A', 'x'.repeat(200)]) expect(isValidId('plr', makeId('plr', t))).toBe(true);
    expect(isValidId('club', 'plr:abc')).toBe(false); expect(isValidId('club', 5)).toBe(false);
    expect(isValidPackId('pacote-1.0')).toBe(true); expect(isValidPackId('Pacote')).toBe(false);
  });
});

describe('Datapack · versões', () => {
  it('lê e compara versões semânticas', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    for (const bad of ['1.2', '01.2.3', 'v1.2.3', '1.2.3-beta', '', null, 5]) expect(parseSemver(bad)).toBeNull();
    expect(compareSemver('1.2.3', '1.10.0')).toBeLessThan(0); expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0); expect(compareSemver('1.0.0', '1.0.0')).toBe(0); expect(compareSemver('x', '1.0.0')).toBeNull();
  });
  it('só considera atualização uma versão maior que a instalada', () => {
    expect(isUpgrade('1.0.0', '1.0.1')).toBe(true); expect(isUpgrade('1.0.0', '1.0.0')).toBe(false); expect(isUpgrade('2.0.0', '1.9.0')).toBe(false); expect(isUpgrade('1.0.0', 'lixo')).toBe(false);
  });
});

describe('Datapack · posições', () => {
  it('toda posição do contrato tem equivalente entre as 4 do jogo atual', () => {
    for (const p of POSITIONS) expect(['GOL', 'DEF', 'MEI', 'ATA']).toContain(positionToLegacy(p));
    expect(positionToLegacy('GK')).toBe('GOL'); expect(positionToLegacy('CB')).toBe('DEF'); expect(positionToLegacy('CM')).toBe('MEI'); expect(positionToLegacy('ST')).toBe('ATA');
  });
});
