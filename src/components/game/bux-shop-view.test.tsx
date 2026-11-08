import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BuxShopView } from './bux-shop-view';
import { emptyProgress, type BuxAccount } from '@/lib/game/bux';
import type { CareerV2 } from '@/lib/game/career';

const DAY = '2026-11-05';
const career = (buxBuffs: CareerV2['buxBuffs'] = [], buxDaily?: CareerV2['buxDaily']) => ({ date: DAY, buxBuffs, ...(buxDaily ? { buxDaily } : {}) }) as unknown as CareerV2;
const account = (balance: number, claimedToday: string[] = [], earnedToday = 0): BuxAccount => ({ balance, unlocked: [], claimedToday, earnedToday, recent: [] });
const progress = (p: Partial<NonNullable<CareerV2['buxDaily']>>) => ({ ...emptyProgress(DAY), ...p });
const noop = () => {};
const clean = (html: string) => html.replace(/<!-- -->/g, ''); // o React separa pedaços de texto com marcadores invisíveis
const view = (p: Partial<Parameters<typeof BuxShopView>[0]> = {}) => clean(renderToString(<BuxShopView career={career()} day={DAY} account={account(20)} guest={false} loadError={false} busy={null} onBuy={noop} onClaim={noop} onRetry={noop} {...p} />));
const row = (html: string, name: string) => html.split('<li').find((s) => s.includes(name)) ?? '';

describe('Loja Bux · tela', () => {
  it('mostra o saldo e deixa claro que é moeda fictícia', () => {
    const html = view();
    expect(html).toContain('Saldo: 20'); expect(html).toContain('Fictício'); expect(html).toContain('moeda fictícia');
  });
  it('visitante vê o convite para entrar e nenhum botão de compra', () => {
    const html = view({ guest: true, account: null });
    expect(html).toContain('Entre na sua conta'); expect(html).not.toContain('COMPRAR');
  });
  it('não existe recompensa de login/boas-vindas', () => { expect(view()).not.toContain('BOAS-VINDAS'); });
  it('metas: mostram progresso, só liberam o resgate ao atingir o alvo e travam depois de resgatadas', () => {
    const half = view({ career: career([], progress({ wins: 4 })) });
    expect(row(half, 'Ganhar 10 partidas')).toContain('4/10'); expect(row(half, 'Ganhar 10 partidas')).toContain('EM ANDAMENTO'); expect(row(half, 'Ganhar 10 partidas')).toContain('disabled');
    const done = view({ career: career([], progress({ wins: 10 })) });
    expect(row(done, 'Ganhar 10 partidas')).toContain('RESGATAR +5'); expect(row(done, 'Ganhar 10 partidas')).not.toContain('disabled');
    const claimed = view({ career: career([], progress({ wins: 10 })), account: account(25, ['goal_win_10'], 5) });
    expect(row(claimed, 'Ganhar 10 partidas')).toContain('RESGATADO'); expect(row(claimed, 'Ganhar 10 partidas')).toContain('disabled');
  });
  it('mostra quanto já rendeu hoje e trava o resgate que passaria de 20 Bux', () => {
    const html = view({ career: career([], progress({ seasons: 1 })), account: account(30, [], 15) });
    expect(html).toContain('15/20 Bux'); expect(row(html, 'Terminar uma temporada')).toContain('LIMITE DIÁRIO'); expect(row(html, 'Terminar uma temporada')).toContain('disabled');
  });
  it('progresso de outro dia não conta', () => {
    const old = view({ career: career([], { ...progress({ wins: 10 }), day: '2026-11-04' }) });
    expect(row(old, 'Ganhar 10 partidas')).toContain('0/10');
  });
  it('desativa o botão de quem custa mais que o saldo e mostra o efeito real', () => {
    const html = view({ account: account(20) });
    expect(row(html, 'Energia básica')).not.toContain('disabled'); expect(row(html, 'Energia profissional')).toContain('disabled'); // 10 Bux cabem em 20; 25 não
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
