import { describe, expect, it } from "vitest";
import { cancelSponsor, createCareer, ensureFields, sponsorExitFee, type CareerV2 } from "./career";
import { amortize, budgetError, finance, installment, loanCapacity, monthStatement, processFinanceDay, reallocateBudget, takeLoan } from "./finance";
import { DEBT_REFERENCES, SPONSOR_MAP_2025 } from "./finance-data";
import { CLUBS } from "./clubs";


describe("Career finances", () => {
  it("calculates fixed installments with the Price table", () => {
    expect(installment({ balance: 12_000_000, monthlyRate: 0.015, installmentsTotal: 12, installmentsPaid: 0 })).toBe(1_100_160);
    expect(installment({ balance: 0, monthlyRate: 0.015, installmentsTotal: 12, installmentsPaid: 0 })).toBe(0);
  });

  it("starts from an official net debt only when the club statement publishes one", () => {
    const cam = createCareer("T", "atletico-mg");
    expect(cam.debt).toBe(1_772_000_000);
    expect(finance(cam).debts[0]?.status).toBe("oficial");
    const cor = createCareer("T", "corinthians");
    expect(DEBT_REFERENCES.corinthians?.metric).toBe("Passivo total");
    expect(cor.debt).toBe(CLUBS.find((x) => x.id === "corinthians")!.debt);
    expect(finance(cor).debts[0]?.status).toBe("estimativa");
  });

  it("charges installments and interest on the 1st of the month", () => {
    const c = createCareer("T", "flamengo");
    const before = finance(c).debts[0]!;
    const due = installment(before);
    const interest = Math.round(before.balance * before.monthlyRate);
    const after = structuredClone(c); after.date = "2025-04-01"; processFinanceDay(after);
    const d = finance(after).debts[0]!;
    expect(d.installmentsPaid).toBe(1);
    expect(d.balance).toBe(before.balance - (due - interest));
    expect(after.debt).toBe(d.balance);
    expect(monthStatement(after, "2025-04").rows.juros).toBe(-interest);
  });

  it("limits bank loans to the credit capacity and records them as debt", () => {
    const c = createCareer("T", "flamengo");
    expect(takeLoan(c, loanCapacity(c) + 1_000_000, 12).error).toBeTruthy();
    const r = takeLoan(c, 10_000_000, 24);
    expect(r.error).toBeUndefined();
    expect(r.career.balance).toBe(c.balance + 10_000_000);
    expect(r.career.debt).toBe(c.debt + 10_000_000);
    expect(finance(r.career).debts.at(-1)?.monthlyRate).toBe(0.017);
    const paid = amortize(r.career, 10_000_000, finance(r.career).debts.at(-1)!.id).career;
    expect(paid.debt).toBe(c.debt);
  });

  it("enforces the board transfer and wage budgets", () => {
    const c = createCareer("T", "flamengo");
    const b = finance(c).budget;
    expect(b.transfer).toBe(60_000_000);
    expect(budgetError(c, b.transfer + 1, 0)).toMatch(/Orçamento de transferências/);
    expect(budgetError(c, 0, b.wagesMonthly)).toMatch(/folha salarial/);
    const moved = reallocateBudget(c, 100_000).career;
    expect(finance(moved).budget.wagesMonthly).toBe(b.wagesMonthly + 100_000);
    expect(finance(moved).budget.transfer).toBe(b.transfer - 1_200_000);
  });

  it("uses the IBOPE Repucom brand map and removes unverified real badges from old saves", () => {
    const cam = createCareer("T", "atletico-mg");
    const master = cam.sponsors.find((s) => s.slot === "Máster")!;
    expect(master.company).toBe(SPONSOR_MAP_2025["atletico-mg"]!.master);
    expect(master.real).toBe(true);
    const old = { ...cam, sponsors: cam.sponsors.map((s) => s.slot === "Máster" ? { ...s, company: "Betano", real: true } : s) } as CareerV2;
    delete old.finance;
    const migrated = ensureFields(old);
    expect(migrated.sponsors.find((s) => s.slot === "Máster")?.real).toBe(false);
    expect(migrated.debt).toBe(cam.debt);
    expect(finance(migrated).debts[0]?.balance).toBe(cam.debt);
  });

  it("charges a 25% exit fee on the remaining sponsor contract", () => {
    const c = createCareer("T", "flamengo");
    const s = c.sponsors.find((x) => x.slot === "Manga")!;
    const fee = sponsorExitFee(c, s);
    const r = cancelSponsor(c, s.id);
    expect(r.career.balance).toBe(c.balance - fee);
    expect(r.career.sponsors.some((x) => x.id === s.id)).toBe(false);
  });
});
