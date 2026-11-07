import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BuxShopView } from './bux-shop-view';
import type { BuxAccount } from '@/lib/game/bux';
import type { CareerV2 } from '@/lib/game/career';

const career = (buxBuffs: CareerV2['buxBuffs'] = []) => ({ date: '2026-11-05', buxBuffs }) as unknown as CareerV2;
const account = (balance: number, welcomeClaimed = true): BuxAccount => ({ balance, unlocked: [], welcomeClaimed, recent: [] });
const noop = () => {};
const clean = (html: string) => html.replace(/<!-- -->/g, ''); // o React separa pedaços de texto com marcadores invisíveis
const view = (p: Partial<Parameters<typeof BuxShopView>[0]> = {}) => clean(renderToString(<BuxShopView career={career()} account={account(200)} guest={false} loadError={false} busy={null} onBuy={noop} onWelcome={noop} onRetry={noop} {...p} />));
const row = (html: string, name: string) => html.split('<li').find((s) => s.includes(name)) ?? '';

describe('Loja Bux · tela', () => {
  it('mostra o saldo e deixa claro que é moeda fictícia', () => {
    const html = view();
    expect(html).toContain('Saldo: 200'); expect(html).toContain('Fictício'); expect(html).toContain('moeda fictícia');
  });
  it('visitante vê o convite para entrar e nenhum botão de compra', () => {
    const html = view({ guest: true, account: null });
    expect(html).toContain('Entre na sua conta'); expect(html).not.toContain('COMPRAR');
  });
  it('oferece as boas-vindas só enquanto não resgatadas', () => {
    expect(view({ account: account(0, false) })).toContain('RESGATAR BOAS-VINDAS');
    expect(view({ account: account(100, true) })).not.toContain('RESGATAR BOAS-VINDAS');
  });
  it('desativa o botão de quem custa mais que o saldo e mostra o efeito real', () => {
    const html = view({ account: account(200) });
    expect(row(html, 'Energia básica')).not.toContain('disabled'); expect(row(html, 'Energia profissional')).toContain('disabled');
    expect(row(html, 'Energia básica')).toContain('Desgaste de energia −15%'); expect(row(html, 'Departamento médico básico')).toContain('Lesões na base −20%');
  });
  it('buff ativo mostra a validade e vira "ESTENDER"; vencido volta a "COMPRAR"', () => {
    const on = view({ career: career([{ itemId: 'energy_basic', until: '2026-11-12' }]) });
    expect(row(on, 'Energia básica')).toContain('ativo até 12/11/2026'); expect(row(on, 'Energia básica')).toContain('ESTENDER');
    const old = view({ career: career([{ itemId: 'energy_basic', until: '2026-11-04' }]) });
    expect(row(old, 'Energia básica')).not.toContain('ativo até'); expect(row(old, 'Energia básica')).toContain('COMPRAR');
  });
  it('durante uma compra trava todos os botões; erro de carga oferece tentar de novo', () => {
    const buying = view({ busy: 'energy_basic' });
    expect(row(buying, 'Energia básica')).toContain('COMPRANDO'); expect(row(buying, 'Energia profissional')).toContain('disabled');
    expect(view({ account: null, loadError: true })).toContain('TENTAR DE NOVO');
  });
  it('não oferece desbloqueio de clubes nesta versão', () => { expect(view()).not.toContain('Desbloquear'); });
});
