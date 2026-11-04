import type { CareerV2 } from "./career";
import { clubById } from "./clubs";
import { STAFF_SALARY_IBGE_2024, startingDebt, type DataStatus } from "./finance-data";

export type FinanceCategory =
  | "bilheteria" | "patrocinio" | "bonus_patrocinio" | "premiacao" | "venda_jogadores" | "emprestimo_recebido"
  | "salarios_jogadores" | "salarios_funcionarios" | "categorias_base" | "manutencao" | "juros" | "amortizacao" | "compra_jogadores" | "obras" | "multas";

export const CATEGORY_LABEL: Record<FinanceCategory, string> = {
  bilheteria: "Bilheteria", patrocinio: "Patrocínios", bonus_patrocinio: "Bônus de patrocínio", premiacao: "Premiação",
  venda_jogadores: "Venda de jogadores", emprestimo_recebido: "Empréstimos recebidos",
  salarios_jogadores: "Salários do elenco", salarios_funcionarios: "Salários de funcionários", categorias_base: "Categorias de base", manutencao: "Manutenção do estádio",
  juros: "Juros", amortizacao: "Amortização de dívidas", compra_jogadores: "Compra de jogadores", obras: "Obras", multas: "Multas contratuais",
};
export const INCOME: FinanceCategory[] = ["bilheteria", "patrocinio", "bonus_patrocinio", "premiacao", "venda_jogadores", "emprestimo_recebido"];
export const EXPENSE: FinanceCategory[] = ["salarios_jogadores", "salarios_funcionarios", "categorias_base", "manutencao", "juros", "amortizacao", "compra_jogadores", "obras", "multas"];

export type DebtContract = {
  id: string;
  label: string;
  kind: "estrutural" | "bancario";
  original: number;
  balance: number;
  monthlyRate: number;
  installmentsTotal: number;
  installmentsPaid: number;
  startedAt: string;
  status: DataStatus; // origin of the opening balance; rates and terms are always simulated
  note: string;
};

export type FinanceState = {
  version: 1;
  debts: DebtContract[];
  months: Record<string, Partial<Record<FinanceCategory, number>>>;
  budget: { season: string; transfer: number; transferSpent: number; wagesMonthly: number };
  staff: { count: number; monthlySalary: number };
};

// Simulated game rules.
export const STRUCTURAL_DEBT = { monthlyRate: 0.003, installments: 360 };
export const LOAN_OPTIONS = [
  { months: 12, monthlyRate: 0.015 },
  { months: 24, monthlyRate: 0.017 },
  { months: 36, monthlyRate: 0.019 },
] as const;
export const OVERDRAFT_RATE = 0.02;

const iso = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function ledgerWeek(c: CareerV2) {
  const d = new Date(`${c.date}T00:00:00Z`);
  const monday = iso(c.date, -((d.getUTCDay() + 6) % 7));
  let wk = c.ledger[0];
  if (!wk || wk.week !== monday) { wk = { week: monday, income: 0, expense: 0, items: [] }; c.ledger.unshift(wk); c.ledger = c.ledger.slice(0, 8); }
  return wk;
}

/** The single entry point for money moving in or out of the manager's club. */
export function book(c: CareerV2, category: FinanceCategory, label: string, value: number) {
  if (!value) return;
  c.balance += value;
  const wk = ledgerWeek(c);
  if (value >= 0) wk.income += value; else wk.expense -= value;
  wk.items.push({ label, value });
  const f = finance(c);
  const key = c.date.slice(0, 7);
  const month = (f.months[key] ??= {});
  month[category] = (month[category] ?? 0) + value;
  const keys = Object.keys(f.months).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 24))) delete f.months[old];
}

export const payroll = (c: CareerV2) => c.squad.reduce((s, p) => s + p.wage, 0);

export function installment(d: Pick<DebtContract, "balance" | "monthlyRate" | "installmentsTotal" | "installmentsPaid">) {
  const n = d.installmentsTotal - d.installmentsPaid;
  if (d.balance <= 0 || n <= 0) return 0;
  if (n === 1 || d.monthlyRate === 0) return Math.round(d.balance * (1 + d.monthlyRate));
  return Math.round((d.balance * d.monthlyRate) / (1 - Math.pow(1 + d.monthlyRate, -n)));
}

export const monthlyInstallments = (c: CareerV2) => finance(c).debts.reduce((s, d) => s + installment(d), 0);
export const syncDebt = (c: CareerV2) => { c.debt = finance(c).debts.reduce((s, d) => s + d.balance, 0); };

function boardBudget(c: CareerV2, season: string): FinanceState["budget"] {
  const wages = payroll(c);
  return { season, transfer: Math.max(0, Math.round((c.balance * 0.5) / 100_000) * 100_000), transferSpent: 0, wagesMonthly: Math.round((wages * 1.1) / 10_000) * 10_000 };
}

export function createFinance(c: CareerV2): FinanceState {
  const club = clubById(c.clubId);
  const start = startingDebt(c.clubId, club.debt);
  const isOfficial = start.status === "oficial" && start.value === c.debt;
  const debts: DebtContract[] = c.debt > 0 ? [{
    id: "debt-estrutural", label: "Dívida histórica renegociada", kind: "estrutural", original: c.debt, balance: c.debt,
    monthlyRate: STRUCTURAL_DEBT.monthlyRate, installmentsTotal: STRUCTURAL_DEBT.installments, installmentsPaid: 0, startedAt: c.date,
    status: isOfficial ? "oficial" : "estimativa",
    note: isOfficial ? start.note : "Saldo inicial estimado pelo jogo, não confirmado como dívida em demonstração oficial. Juros e prazo simulados.",
  }] : [];
  const staffCount = Math.round(60 + Math.max(0, club.rating - 65) * 6);
  return { version: 1, debts, months: {}, budget: boardBudget(c, c.season), staff: { count: staffCount, monthlySalary: STAFF_SALARY_IBGE_2024 } };
}

export function finance(c: CareerV2): FinanceState {
  return (c.finance ??= createFinance(c));
}

export const transferRemaining = (c: CareerV2) => { const b = finance(c).budget; return Math.max(0, b.transfer - b.transferSpent); };

/** Board budget rules for the manager's club. */
export function budgetError(c: CareerV2, fee: number, wage: number, replacingWage = 0) {
  const b = finance(c).budget;
  if (fee > transferRemaining(c)) return `Orçamento de transferências insuficiente. Disponível: R$ ${transferRemaining(c).toLocaleString("pt-BR")}.`;
  if (payroll(c) - replacingWage + wage > b.wagesMonthly) return "A folha salarial passaria do orçamento mensal aprovado pela diretoria.";
  return undefined;
}

export function trackTransferCash(c: CareerV2, amount: number) {
  const b = finance(c).budget;
  if (amount < 0) b.transferSpent += -amount; else b.transfer += amount;
}

/** Move money between the transfer budget and the monthly wage budget (12 months of wages). */
export function reallocateBudget(c: CareerV2, monthlyWageDelta: number): { career: CareerV2; error?: string } {
  const next = structuredClone(c);
  const b = finance(next).budget;
  const transferDelta = -monthlyWageDelta * 12;
  if (b.wagesMonthly + monthlyWageDelta < payroll(next)) return { career: c, error: "O orçamento salarial não pode ficar abaixo da folha atual." };
  if (b.transfer + transferDelta < b.transferSpent) return { career: c, error: "Orçamento de transferências insuficiente para essa troca." };
  b.wagesMonthly += monthlyWageDelta; b.transfer += transferDelta;
  return { career: next };
}

export function loanCapacity(c: CareerV2) {
  const yearlySponsors = c.sponsors.reduce((s, x) => s + x.weekly, 0) * 52;
  const bank = finance(c).debts.filter((d) => d.kind === "bancario").reduce((s, d) => s + d.balance, 0);
  return Math.max(0, Math.round((Math.max(10_000_000, yearlySponsors * 0.6) - bank) / 1_000_000) * 1_000_000);
}

export function takeLoan(c: CareerV2, amount: number, months: number): { career: CareerV2; error?: string } {
  const option = LOAN_OPTIONS.find((o) => o.months === months);
  if (!option || !Number.isFinite(amount) || amount <= 0) return { career: c, error: "Condições de empréstimo inválidas." };
  if (amount > loanCapacity(c)) return { career: c, error: "O banco recusou: valor acima do limite de crédito do clube." };
  const next = structuredClone(c);
  const f = finance(next);
  f.debts.push({ id: `loan-${next.date}-${f.debts.length}`, label: `Empréstimo bancário ${months}x`, kind: "bancario", original: amount, balance: amount, monthlyRate: option.monthlyRate, installmentsTotal: months, installmentsPaid: 0, startedAt: next.date, status: "simulado", note: "Empréstimo simulado da carreira." });
  book(next, "emprestimo_recebido", `Empréstimo bancário ${months}x`, amount);
  syncDebt(next);
  return { career: next };
}

export function amortize(c: CareerV2, amount: number, debtId?: string): { career: CareerV2; error?: string } {
  const next = structuredClone(c);
  const f = finance(next);
  const target = debtId ? f.debts.find((d) => d.id === debtId) : [...f.debts].filter((d) => d.balance > 0).sort((a, b) => b.monthlyRate - a.monthlyRate)[0];
  if (!target) return { career: c, error: "Dívida não encontrada." };
  const value = Math.min(amount, target.balance);
  if (value <= 0) return { career: c };
  if (value > next.balance) return { career: c, error: "Saldo insuficiente para essa amortização." };
  target.balance -= value;
  book(next, "amortizacao", `Amortização antecipada · ${target.label}`, -value);
  f.debts = f.debts.filter((d) => d.balance > 0 || d.kind === "estrutural");
  syncDebt(next);
  return { career: next };
}

function payInstallments(c: CareerV2) {
  const f = finance(c);
  let total = 0;
  for (const d of f.debts) {
    const due = installment(d);
    if (!due) continue;
    const interest = Math.round(d.balance * d.monthlyRate);
    const principal = Math.min(d.balance, due - interest);
    d.balance -= principal; d.installmentsPaid += 1; total += due;
    book(c, "juros", `Juros · ${d.label}`, -interest);
    book(c, "amortizacao", `Parcela ${d.installmentsPaid}/${d.installmentsTotal} · ${d.label}`, -principal);
  }
  const finished = f.debts.filter((d) => d.balance <= 0 && d.kind === "bancario");
  f.debts = f.debts.filter((d) => !finished.includes(d));
  syncDebt(c);
  if (total) c.news.unshift({ id: `debt-${c.date}`, date: c.date, kind: "info", title: "Parcelas das dívidas pagas", body: `R$ ${total.toLocaleString("pt-BR")} debitados. Dívida restante: R$ ${c.debt.toLocaleString("pt-BR")}.${finished.length ? ` ${finished.length} empréstimo(s) quitado(s).` : ""}` });
}

/** Daily money routine. Runs from advanceDay so it can never be skipped. */
export function processFinanceDay(c: CareerV2) {
  const f = finance(c);
  if (f.budget.season !== c.season) {
    f.budget = boardBudget(c, c.season);
    c.news.unshift({ id: `budget-${c.season}`, date: c.date, kind: "info", title: `Orçamento ${c.season} aprovado`, body: `Transferências: R$ ${f.budget.transfer.toLocaleString("pt-BR")} · Folha mensal: R$ ${f.budget.wagesMonthly.toLocaleString("pt-BR")}. Valores definidos pela regra do jogo.` });
  }
  if (new Date(`${c.date}T00:00:00Z`).getUTCDay() === 1) weekly(c);
  if (c.date.endsWith("-01")) {
    payInstallments(c);
    if (c.balance < 0) book(c, "juros", "Juros do saldo negativo (simulado)", -Math.round(-c.balance * OVERDRAFT_RATE));
  }
}

function weekly(c: CareerV2) {
  c.sponsors = c.sponsors.filter((s) => {
    if (s.until < c.date) { c.news.unshift({ id: `spend-${s.id}-${c.date}`, date: c.date, kind: "info", title: `Fim do contrato com ${s.company}`, body: `O espaço ${s.slot} está livre. Aguarde novas propostas.` }); return false; }
    return true;
  });
  const f = finance(c);
  book(c, "patrocinio", "Patrocínios", c.sponsors.reduce((s, x) => s + x.weekly, 0));
  book(c, "salarios_jogadores", "Salários do elenco", -Math.round((payroll(c) * 12) / 52));
  book(c, "salarios_funcionarios", `Salários de ${f.staff.count} funcionários`, -Math.round((f.staff.count * f.staff.monthlySalary * 12) / 52));
  book(c, "manutencao", "Manutenção do estádio", -Math.round(c.stadium.capacity * 9));
}

export function weeklyFixed(c: CareerV2) {
  const f = finance(c);
  const sponsors = c.sponsors.reduce((s, x) => s + x.weekly, 0);
  const wages = Math.round((payroll(c) * 12) / 52);
  const staff = Math.round((f.staff.count * f.staff.monthlySalary * 12) / 52);
  const upkeep = Math.round(c.stadium.capacity * 9);
  return { sponsors, wages, staff, upkeep, net: sponsors - wages - staff - upkeep };
}

export function monthStatement(c: CareerV2, key: string) {
  const m = finance(c).months[key] ?? {};
  const income = INCOME.reduce((s, k) => s + (m[k] ?? 0), 0);
  const expense = EXPENSE.reduce((s, k) => s - (m[k] ?? 0), 0);
  return { key, rows: m, income, expense, result: income - expense };
}
