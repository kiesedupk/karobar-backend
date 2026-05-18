import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

// =====================================================
// Helper: Date filter for journal lines (POSTED only)
// =====================================================
interface DateFilter {
  startDate?: string;
  endDate?: string;
}

interface AccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  subType: string | null;
  totalDebits: Decimal;
  totalCredits: Decimal;
  balance: Decimal;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ================================================================
  // SHARED: Compute all account balances from journal lines
  // ================================================================
  private async computeAccountBalances(
    companyId: string,
    dateFilter?: DateFilter,
  ): Promise<AccountBalance[]> {
    const accounts = await this.prisma.account.findMany({
      where: { companyId, isActive: true },
      orderBy: { code: 'asc' },
    });

    // Build journal line date filter
    const journalWhere: any = {
      journalEntry: {
        companyId,
        status: 'POSTED',
      },
    };

    if (dateFilter?.startDate || dateFilter?.endDate) {
      journalWhere.journalEntry.date = {};
      if (dateFilter.startDate) {
        journalWhere.journalEntry.date.gte = new Date(dateFilter.startDate);
      }
      if (dateFilter.endDate) {
        journalWhere.journalEntry.date.lte = new Date(dateFilter.endDate);
      }
    }

    // 1. Single optimized database query to aggregate all journal lines grouped by accountId
    const aggs = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        ...journalWhere,
        // Ensure we only aggregate for active accounts belonging to the company
        account: {
          companyId,
          isActive: true,
        },
      },
      _sum: { debit: true, credit: true },
    });

    // Map aggregations by accountId for constant-time lookup
    const aggMap = new Map<string, { debit: Decimal; credit: Decimal }>();
    for (const a of aggs) {
      aggMap.set(a.accountId, {
        debit: new Decimal(a._sum.debit || 0),
        credit: new Decimal(a._sum.credit || 0),
      });
    }

    const results: AccountBalance[] = [];

    // 2. Compute final balances with proper normal-balance rules
    for (const account of accounts) {
      const agg = aggMap.get(account.id) || {
        debit: new Decimal(0),
        credit: new Decimal(0),
      };

      const totalDebits = agg.debit;
      const totalCredits = agg.credit;

      // Skip zero-activity accounts
      if (totalDebits.isZero() && totalCredits.isZero()) continue;

      // Normal balance rule (Asset/Expense debits increase; Equity/Liability/Revenue credits increase)
      let balance: Decimal;
      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        balance = totalDebits.minus(totalCredits);
      } else {
        balance = totalCredits.minus(totalDebits);
      }

      results.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        subType: account.subType,
        totalDebits,
        totalCredits,
        balance,
      });
    }

    return results;
  }

  // ================================================================
  // 1. TRIAL BALANCE
  // ================================================================
  async getTrialBalance(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const balances = await this.computeAccountBalances(companyId, dateFilter);

    let totalDebitBalances = new Decimal(0);
    let totalCreditBalances = new Decimal(0);

    const rows = balances.map((b) => {
      let debitBalance = new Decimal(0);
      let creditBalance = new Decimal(0);

      if (b.accountType === 'ASSET' || b.accountType === 'EXPENSE') {
        if (b.balance.greaterThanOrEqualTo(0)) {
          debitBalance = b.balance;
        } else {
          creditBalance = b.balance.abs();
        }
      } else {
        if (b.balance.greaterThanOrEqualTo(0)) {
          creditBalance = b.balance;
        } else {
          debitBalance = b.balance.abs();
        }
      }

      totalDebitBalances = totalDebitBalances.plus(debitBalance);
      totalCreditBalances = totalCreditBalances.plus(creditBalance);

      return {
        accountCode: b.accountCode,
        accountName: b.accountName,
        accountType: b.accountType,
        totalDebits: b.totalDebits.toFixed(2),
        totalCredits: b.totalCredits.toFixed(2),
        debitBalance: debitBalance.toFixed(2),
        creditBalance: creditBalance.toFixed(2),
      };
    });

    return {
      reportName: 'Trial Balance',
      companyId,
      dateRange: {
        from: dateFilter?.startDate || 'All Time',
        to: dateFilter?.endDate || 'Present',
      },
      generatedAt: new Date().toISOString(),
      rows,
      totals: {
        totalDebitBalances: totalDebitBalances.toFixed(2),
        totalCreditBalances: totalCreditBalances.toFixed(2),
        isBalanced: totalDebitBalances.equals(totalCreditBalances),
        difference: totalDebitBalances
          .minus(totalCreditBalances)
          .abs()
          .toFixed(2),
      },
    };
  }

  // ================================================================
  // 2. PROFIT & LOSS (Income Statement)
  // ================================================================
  async getProfitAndLoss(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const balances = await this.computeAccountBalances(companyId, dateFilter);

    // --- REVENUE section ---
    const revenueAccounts = balances
      .filter((b) => b.accountType === 'REVENUE')
      .map((b) => ({
        accountCode: b.accountCode,
        accountName: b.accountName,
        subType: b.subType,
        amount: b.balance.toFixed(2),
      }));

    const totalRevenue = balances
      .filter((b) => b.accountType === 'REVENUE')
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));

    // --- EXPENSE section ---
    // Separate COGS from operating expenses
    const cogsAccounts = balances
      .filter((b) => b.accountType === 'EXPENSE' && b.subType === 'COGS')
      .map((b) => ({
        accountCode: b.accountCode,
        accountName: b.accountName,
        subType: b.subType,
        amount: b.balance.toFixed(2),
      }));

    const totalCOGS = balances
      .filter((b) => b.accountType === 'EXPENSE' && b.subType === 'COGS')
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));

    const grossProfit = totalRevenue.minus(totalCOGS);

    const operatingExpenses = balances
      .filter((b) => b.accountType === 'EXPENSE' && b.subType !== 'COGS')
      .map((b) => ({
        accountCode: b.accountCode,
        accountName: b.accountName,
        subType: b.subType,
        amount: b.balance.toFixed(2),
      }));

    const totalOperatingExpenses = balances
      .filter((b) => b.accountType === 'EXPENSE' && b.subType !== 'COGS')
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));

    const totalExpenses = totalCOGS.plus(totalOperatingExpenses);
    const netIncome = totalRevenue.minus(totalExpenses);

    return {
      reportName: 'Profit & Loss Statement',
      companyId,
      dateRange: {
        from: dateFilter?.startDate || 'All Time',
        to: dateFilter?.endDate || 'Present',
      },
      generatedAt: new Date().toISOString(),

      // Revenue section
      revenue: {
        accounts: revenueAccounts,
        totalRevenue: totalRevenue.toFixed(2),
      },

      // Cost of Goods Sold
      costOfGoodsSold: {
        accounts: cogsAccounts,
        totalCOGS: totalCOGS.toFixed(2),
      },

      grossProfit: grossProfit.toFixed(2),

      // Operating Expenses
      operatingExpenses: {
        accounts: operatingExpenses,
        totalOperatingExpenses: totalOperatingExpenses.toFixed(2),
      },

      // Summary
      summary: {
        totalRevenue: totalRevenue.toFixed(2),
        totalExpenses: totalExpenses.toFixed(2),
        netIncome: netIncome.toFixed(2),
        isProfit: netIncome.greaterThan(0),
        profitMargin: totalRevenue.isZero()
          ? '0.00'
          : netIncome.div(totalRevenue).mul(100).toFixed(2),
      },
    };
  }

  // ================================================================
  // 3. BALANCE SHEET
  // ================================================================
  async getBalanceSheet(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const balances = await this.computeAccountBalances(companyId, dateFilter);

    // --- ASSETS ---
    const currentAssets = balances
      .filter(
        (b) =>
          b.accountType === 'ASSET' &&
          b.subType !== 'FIXED' &&
          b.subType !== 'CONTRA' &&
          b.subType !== 'HEADER',
      )
      .map((b) => ({
        accountCode: b.accountCode,
        accountName: b.accountName,
        subType: b.subType,
        amount: b.balance.toFixed(2),
      }));

    const fixedAssets = balances
      .filter(
        (b) =>
          b.accountType === 'ASSET' &&
          (b.subType === 'FIXED' || b.subType === 'CONTRA'),
      )
      .map((b) => ({
        accountCode: b.accountCode,
        accountName: b.accountName,
        subType: b.subType,
        amount: b.balance.toFixed(2),
      }));

    const totalCurrentAssets = balances
      .filter(
        (b) =>
          b.accountType === 'ASSET' &&
          b.subType !== 'FIXED' &&
          b.subType !== 'CONTRA' &&
          b.subType !== 'HEADER',
      )
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));

    const totalFixedAssets = balances
      .filter(
        (b) =>
          b.accountType === 'ASSET' &&
          (b.subType === 'FIXED' || b.subType === 'CONTRA'),
      )
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));

    const totalAssets = totalCurrentAssets.plus(totalFixedAssets);

    // --- LIABILITIES ---
    const currentLiabilities = balances
      .filter(
        (b) =>
          b.accountType === 'LIABILITY' &&
          b.subType !== 'LOAN' &&
          b.subType !== 'HEADER',
      )
      .map((b) => ({
        accountCode: b.accountCode,
        accountName: b.accountName,
        subType: b.subType,
        amount: b.balance.toFixed(2),
      }));

    const longTermLiabilities = balances
      .filter((b) => b.accountType === 'LIABILITY' && b.subType === 'LOAN')
      .map((b) => ({
        accountCode: b.accountCode,
        accountName: b.accountName,
        subType: b.subType,
        amount: b.balance.toFixed(2),
      }));

    const totalCurrentLiabilities = balances
      .filter(
        (b) =>
          b.accountType === 'LIABILITY' &&
          b.subType !== 'LOAN' &&
          b.subType !== 'HEADER',
      )
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));

    const totalLongTermLiabilities = balances
      .filter((b) => b.accountType === 'LIABILITY' && b.subType === 'LOAN')
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));

    const totalLiabilities = totalCurrentLiabilities.plus(
      totalLongTermLiabilities,
    );

    // --- EQUITY ---
    const equityAccounts = balances
      .filter((b) => b.accountType === 'EQUITY' && b.subType !== 'HEADER')
      .map((b) => ({
        accountCode: b.accountCode,
        accountName: b.accountName,
        subType: b.subType,
        amount: b.balance.toFixed(2),
      }));

    const totalEquity = balances
      .filter((b) => b.accountType === 'EQUITY' && b.subType !== 'HEADER')
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));

    // Net Income (Revenue - Expenses) flows into Equity
    const revenueTotal = balances
      .filter((b) => b.accountType === 'REVENUE')
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));
    const expenseTotal = balances
      .filter((b) => b.accountType === 'EXPENSE')
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));
    const netIncome = revenueTotal.minus(expenseTotal);

    const totalEquityWithNetIncome = totalEquity.plus(netIncome);
    const totalLiabilitiesAndEquity = totalLiabilities.plus(
      totalEquityWithNetIncome,
    );

    return {
      reportName: 'Balance Sheet',
      companyId,
      asOfDate: dateFilter?.endDate || new Date().toISOString().split('T')[0],
      generatedAt: new Date().toISOString(),

      assets: {
        currentAssets: {
          accounts: currentAssets,
          total: totalCurrentAssets.toFixed(2),
        },
        fixedAssets: {
          accounts: fixedAssets,
          total: totalFixedAssets.toFixed(2),
        },
        totalAssets: totalAssets.toFixed(2),
      },

      liabilities: {
        currentLiabilities: {
          accounts: currentLiabilities,
          total: totalCurrentLiabilities.toFixed(2),
        },
        longTermLiabilities: {
          accounts: longTermLiabilities,
          total: totalLongTermLiabilities.toFixed(2),
        },
        totalLiabilities: totalLiabilities.toFixed(2),
      },

      equity: {
        accounts: equityAccounts,
        netIncome: netIncome.toFixed(2),
        totalEquity: totalEquityWithNetIncome.toFixed(2),
      },

      totalLiabilitiesAndEquity: totalLiabilitiesAndEquity.toFixed(2),

      // The Accounting Equation: Assets = Liabilities + Equity
      accountingEquation: {
        assets: totalAssets.toFixed(2),
        liabilitiesAndEquity: totalLiabilitiesAndEquity.toFixed(2),
        isBalanced: totalAssets.equals(totalLiabilitiesAndEquity),
        difference: totalAssets
          .minus(totalLiabilitiesAndEquity)
          .abs()
          .toFixed(2),
      },
    };
  }

  // ================================================================
  // 4. CASH FLOW STATEMENT
  // ================================================================
  async getCashFlowStatement(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);

    // Build date filter for journal entries
    const dateWhere: any = {};
    if (dateFilter?.startDate || dateFilter?.endDate) {
      dateWhere.date = {};
      if (dateFilter.startDate)
        dateWhere.date.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) dateWhere.date.lte = new Date(dateFilter.endDate);
    }

    // Get all CASH and BANK accounts
    const cashBankAccounts = await this.prisma.account.findMany({
      where: {
        companyId,
        isActive: true,
        type: 'ASSET',
        subType: { in: ['CASH', 'BANK'] },
      },
    });

    const cashBankIds = cashBankAccounts.map((a) => a.id);

    // --- OPERATING ACTIVITIES ---
    // Revenue and Expense account movements (excluding asset purchases)
    const revenueExpenseAccounts = await this.prisma.account.findMany({
      where: {
        companyId,
        isActive: true,
        type: { in: ['REVENUE', 'EXPENSE'] },
      },
    });

    let operatingCashIn = new Decimal(0);
    let operatingCashOut = new Decimal(0);
    const operatingDetails: any[] = [];

    for (const account of revenueExpenseAccounts) {
      const agg = await this.prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journalEntry: { companyId, status: 'POSTED', ...dateWhere },
        },
        _sum: { debit: true, credit: true },
      });

      const debits = new Decimal(agg._sum.debit || 0);
      const credits = new Decimal(agg._sum.credit || 0);

      if (debits.isZero() && credits.isZero()) continue;

      if (account.type === 'REVENUE') {
        operatingCashIn = operatingCashIn.plus(credits.minus(debits));
        operatingDetails.push({
          accountCode: account.code,
          accountName: account.name,
          type: 'INFLOW',
          amount: credits.minus(debits).toFixed(2),
        });
      } else {
        operatingCashOut = operatingCashOut.plus(debits.minus(credits));
        operatingDetails.push({
          accountCode: account.code,
          accountName: account.name,
          type: 'OUTFLOW',
          amount: debits.minus(credits).toFixed(2),
        });
      }
    }

    const netOperating = operatingCashIn.minus(operatingCashOut);

    // --- INVESTING ACTIVITIES ---
    // Fixed asset movements
    const fixedAssetAccounts = await this.prisma.account.findMany({
      where: {
        companyId,
        isActive: true,
        type: 'ASSET',
        subType: { in: ['FIXED', 'CONTRA'] },
      },
    });

    let investingAmount = new Decimal(0);
    const investingDetails: any[] = [];

    for (const account of fixedAssetAccounts) {
      const agg = await this.prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journalEntry: { companyId, status: 'POSTED', ...dateWhere },
        },
        _sum: { debit: true, credit: true },
      });

      const debits = new Decimal(agg._sum.debit || 0);
      const credits = new Decimal(agg._sum.credit || 0);
      if (debits.isZero() && credits.isZero()) continue;

      const net = debits.minus(credits);
      investingAmount = investingAmount.plus(net);

      investingDetails.push({
        accountCode: account.code,
        accountName: account.name,
        type: net.greaterThan(0) ? 'PURCHASE' : 'SALE',
        amount: net.toFixed(2),
      });
    }

    const netInvesting = investingAmount.negated(); // Purchases are outflows

    // --- FINANCING ACTIVITIES ---
    // Equity and Loan movements
    const financingAccounts = await this.prisma.account.findMany({
      where: {
        companyId,
        isActive: true,
        type: { in: ['EQUITY', 'LIABILITY'] },
        subType: { in: ['CAPITAL', 'DRAWINGS', 'RETAINED', 'LOAN'] },
      },
    });

    let financingAmount = new Decimal(0);
    const financingDetails: any[] = [];

    for (const account of financingAccounts) {
      const agg = await this.prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journalEntry: { companyId, status: 'POSTED', ...dateWhere },
        },
        _sum: { debit: true, credit: true },
      });

      const debits = new Decimal(agg._sum.debit || 0);
      const credits = new Decimal(agg._sum.credit || 0);
      if (debits.isZero() && credits.isZero()) continue;

      let net: Decimal;
      if (account.subType === 'DRAWINGS') {
        net = debits.minus(credits).negated(); // Drawings are outflows
      } else {
        net = credits.minus(debits); // Capital/Loans are inflows
      }

      financingAmount = financingAmount.plus(net);

      financingDetails.push({
        accountCode: account.code,
        accountName: account.name,
        subType: account.subType,
        type: net.greaterThan(0) ? 'INFLOW' : 'OUTFLOW',
        amount: net.toFixed(2),
      });
    }

    const netFinancing = financingAmount;

    // --- CASH POSITION ---
    const netCashChange = netOperating.plus(netInvesting).plus(netFinancing);

    // Get opening and closing cash balances
    let openingCashBalance = new Decimal(0);
    let closingCashBalance = new Decimal(0);

    for (const account of cashBankAccounts) {
      // Opening = all transactions BEFORE startDate
      if (dateFilter?.startDate) {
        const openingAgg = await this.prisma.journalLine.aggregate({
          where: {
            accountId: account.id,
            journalEntry: {
              companyId,
              status: 'POSTED',
              date: { lt: new Date(dateFilter.startDate) },
            },
          },
          _sum: { debit: true, credit: true },
        });
        const d = new Decimal(openingAgg._sum.debit || 0);
        const c = new Decimal(openingAgg._sum.credit || 0);
        openingCashBalance = openingCashBalance.plus(d.minus(c));
      }

      // Closing = all transactions up to endDate (or all time)
      const closingWhere: any = {
        accountId: account.id,
        journalEntry: { companyId, status: 'POSTED' },
      };
      if (dateFilter?.endDate) {
        closingWhere.journalEntry.date = { lte: new Date(dateFilter.endDate) };
      }

      const closingAgg = await this.prisma.journalLine.aggregate({
        where: closingWhere,
        _sum: { debit: true, credit: true },
      });
      const d = new Decimal(closingAgg._sum.debit || 0);
      const c = new Decimal(closingAgg._sum.credit || 0);
      closingCashBalance = closingCashBalance.plus(d.minus(c));
    }

    return {
      reportName: 'Cash Flow Statement',
      companyId,
      dateRange: {
        from: dateFilter?.startDate || 'All Time',
        to: dateFilter?.endDate || 'Present',
      },
      generatedAt: new Date().toISOString(),

      operatingActivities: {
        details: operatingDetails,
        cashIn: operatingCashIn.toFixed(2),
        cashOut: operatingCashOut.toFixed(2),
        netOperatingCashFlow: netOperating.toFixed(2),
      },

      investingActivities: {
        details: investingDetails,
        netInvestingCashFlow: netInvesting.toFixed(2),
      },

      financingActivities: {
        details: financingDetails,
        netFinancingCashFlow: netFinancing.toFixed(2),
      },

      summary: {
        netCashChange: netCashChange.toFixed(2),
        openingCashBalance: openingCashBalance.toFixed(2),
        closingCashBalance: closingCashBalance.toFixed(2),
      },
    };
  }

  // ================================================================
  // 5. ACCOUNT LEDGER (detailed transactions for one account)
  // ================================================================
  async getAccountLedger(
    companyId: string,
    accountId: string,
    dateFilter?: DateFilter,
  ) {
    await this.validateCompany(companyId);

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) throw new NotFoundException('Account not found');
    if (account.companyId !== companyId) {
      throw new NotFoundException('Account does not belong to this company');
    }

    const where: any = {
      accountId,
      journalEntry: { companyId, status: 'POSTED' },
    };

    if (dateFilter?.startDate || dateFilter?.endDate) {
      where.journalEntry.date = {};
      if (dateFilter.startDate)
        where.journalEntry.date.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate)
        where.journalEntry.date.lte = new Date(dateFilter.endDate);
    }

    const lines = await this.prisma.journalLine.findMany({
      where,
      include: {
        journalEntry: {
          select: { id: true, date: true, reference: true, description: true },
        },
      },
      orderBy: { journalEntry: { date: 'asc' } },
    });

    // Compute running balance
    let runningBalance = new Decimal(0);
    const ledgerEntries = lines.map((line) => {
      const debit = new Decimal(line.debit);
      const credit = new Decimal(line.credit);

      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        runningBalance = runningBalance.plus(debit).minus(credit);
      } else {
        runningBalance = runningBalance.plus(credit).minus(debit);
      }

      return {
        date: line.journalEntry.date,
        reference: line.journalEntry.reference,
        description: line.description || line.journalEntry.description,
        debit: debit.toFixed(2),
        credit: credit.toFixed(2),
        balance: runningBalance.toFixed(2),
        journalEntryId: line.journalEntry.id,
      };
    });

    // Totals
    const totalDebits = lines.reduce(
      (sum, l) => sum.plus(new Decimal(l.debit)),
      new Decimal(0),
    );
    const totalCredits = lines.reduce(
      (sum, l) => sum.plus(new Decimal(l.credit)),
      new Decimal(0),
    );

    return {
      reportName: 'Account Ledger',
      companyId,
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
      },
      dateRange: {
        from: dateFilter?.startDate || 'All Time',
        to: dateFilter?.endDate || 'Present',
      },
      generatedAt: new Date().toISOString(),
      entries: ledgerEntries,
      totals: {
        totalDebits: totalDebits.toFixed(2),
        totalCredits: totalCredits.toFixed(2),
        closingBalance: runningBalance.toFixed(2),
        transactionCount: lines.length,
      },
    };
  }

  // ================================================================
  // 6. TAX / GST SUMMARY
  // ================================================================
  async getTaxSummary(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);

    const invoiceWhere: any = { companyId, status: { not: 'DRAFT' } };
    const billWhere: any = { companyId, status: { not: 'DRAFT' } };

    if (dateFilter?.startDate || dateFilter?.endDate) {
      invoiceWhere.issueDate = {};
      billWhere.billDate = {};
      if (dateFilter.startDate) {
        invoiceWhere.issueDate.gte = new Date(dateFilter.startDate);
        billWhere.billDate.gte = new Date(dateFilter.startDate);
      }
      if (dateFilter.endDate) {
        invoiceWhere.issueDate.lte = new Date(dateFilter.endDate);
        billWhere.billDate.lte = new Date(dateFilter.endDate);
      }
    }

    // Tax Collected from Invoices (Sales)
    const invoices = await this.prisma.invoice.findMany({
      where: invoiceWhere,
      select: { invoiceNumber: true, issueDate: true, subTotal: true, taxAmount: true, totalAmount: true },
    });

    // Tax Paid on Purchases (Bills)
    const bills = await this.prisma.purchaseBill.findMany({
      where: billWhere,
      select: { billNumber: true, billDate: true, subTotal: true, taxAmount: true, totalAmount: true },
    });

    const totalTaxCollected = invoices.reduce((sum, i) => sum.plus(new Decimal(i.taxAmount)), new Decimal(0));
    const totalTaxPaid = bills.reduce((sum, b) => sum.plus(new Decimal(b.taxAmount)), new Decimal(0));
    const netTaxPayable = totalTaxCollected.minus(totalTaxPaid);

    return {
      reportName: 'Tax / GST Summary',
      companyId,
      dateRange: {
        from: dateFilter?.startDate || 'All Time',
        to: dateFilter?.endDate || 'Present',
      },
      generatedAt: new Date().toISOString(),
      salesTax: {
        totalCollected: totalTaxCollected.toFixed(2),
        invoices: invoices.map(i => ({
          number: i.invoiceNumber,
          date: i.issueDate,
          taxAmount: new Decimal(i.taxAmount).toFixed(2),
          totalAmount: new Decimal(i.totalAmount).toFixed(2)
        })).filter(i => parseFloat(i.taxAmount) > 0)
      },
      purchaseTax: {
        totalPaid: totalTaxPaid.toFixed(2),
        bills: bills.map(b => ({
          number: b.billNumber,
          date: b.billDate,
          taxAmount: new Decimal(b.taxAmount).toFixed(2),
          totalAmount: new Decimal(b.totalAmount).toFixed(2)
        })).filter(b => parseFloat(b.taxAmount) > 0)
      },
      summary: {
        netTaxPayable: netTaxPayable.toFixed(2),
        status: netTaxPayable.greaterThan(0) ? 'PAYABLE' : (netTaxPayable.lessThan(0) ? 'REFUNDABLE' : 'NIL')
      }
    };
  }

  // ================================================================
  // 7. BRANCH / WAREHOUSE SUMMARY
  // ================================================================
  async getBranchSummary(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);

    const branches = await this.prisma.warehouse.findMany({
      where: { companyId, status: 'ACTIVE' },
    });

    const results = [];

    const dateWhere: any = {};
    if (dateFilter?.startDate || dateFilter?.endDate) {
      dateWhere.date = {};
      if (dateFilter.startDate) dateWhere.date.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) dateWhere.date.lte = new Date(dateFilter.endDate);
    }

    for (const branch of branches) {
      // Sales
      const invoicesWhere: any = {
        companyId,
        warehouseId: branch.id,
        status: { not: 'DRAFT' },
      };
      if (dateFilter?.startDate) invoicesWhere.issueDate = { ...invoicesWhere.issueDate, gte: new Date(dateFilter.startDate) };
      if (dateFilter?.endDate) invoicesWhere.issueDate = { ...invoicesWhere.issueDate, lte: new Date(dateFilter.endDate) };

      const invoices = await this.prisma.invoice.aggregate({
        where: invoicesWhere,
        _sum: { totalAmount: true },
        _count: { id: true },
      });

      // Purchases
      const billsWhere: any = {
        companyId,
        warehouseId: branch.id,
        status: { not: 'DRAFT' },
      };
      if (dateFilter?.startDate) billsWhere.billDate = { ...billsWhere.billDate, gte: new Date(dateFilter.startDate) };
      if (dateFilter?.endDate) billsWhere.billDate = { ...billsWhere.billDate, lte: new Date(dateFilter.endDate) };

      const bills = await this.prisma.purchaseBill.aggregate({
        where: billsWhere,
        _sum: { totalAmount: true },
      });

      // Stock Value
      const fifoLayers = await this.prisma.inventoryFifoLayer.aggregate({
        where: { companyId, warehouseId: branch.id, remainingQty: { gt: 0 } },
        _sum: { remainingQty: true },
      });

      const layers = await this.prisma.inventoryFifoLayer.findMany({
        where: { companyId, warehouseId: branch.id, remainingQty: { gt: 0 } },
        select: { remainingQty: true, unitCost: true },
      });
      const stockValue = layers.reduce((sum, layer) => sum.plus(new Decimal(layer.remainingQty).mul(new Decimal(layer.unitCost))), new Decimal(0));

      results.push({
        branchId: branch.id,
        branchName: branch.name,
        location: branch.location,
        sales: {
          totalAmount: new Decimal(invoices._sum.totalAmount || 0).toFixed(2),
          invoiceCount: invoices._count.id,
        },
        purchases: {
          totalAmount: new Decimal(bills._sum.totalAmount || 0).toFixed(2),
        },
        inventory: {
          totalItems: new Decimal(fifoLayers._sum.remainingQty || 0).toFixed(2),
          totalValue: stockValue.toFixed(2),
        }
      });
    }

    return {
      reportName: 'Branch / Warehouse Summary',
      companyId,
      dateRange: {
        from: dateFilter?.startDate || 'All Time',
        to: dateFilter?.endDate || 'Present',
      },
      generatedAt: new Date().toISOString(),
      branches: results,
    };
  }

  // ================================================================
  // 8. SALES BY CUSTOMER
  // ================================================================
  async getSalesByCustomer(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const where: any = { companyId, status: { not: 'CANCELLED' } };
    if (dateFilter?.startDate || dateFilter?.endDate) {
      where.issueDate = {};
      if (dateFilter.startDate) where.issueDate.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) where.issueDate.lte = new Date(dateFilter.endDate);
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
    });

    const customerMap = new Map<string, any>();
    for (const inv of invoices) {
      const key = inv.customerId || 'walk-in';
      const existing = customerMap.get(key) || {
        customerId: key,
        customerName: inv.customer?.name || 'Walk-in Customer',
        email: inv.customer?.email || '',
        invoiceCount: 0,
        totalSales: 0,
        totalPaid: 0,
        totalOutstanding: 0,
      };
      existing.invoiceCount++;
      existing.totalSales += Number(inv.totalAmount);
      existing.totalPaid += Number(inv.paidAmount);
      existing.totalOutstanding += Number(inv.totalAmount) - Number(inv.paidAmount);
      customerMap.set(key, existing);
    }

    const customers = Array.from(customerMap.values()).sort((a, b) => b.totalSales - a.totalSales);
    const grandTotal = customers.reduce((s, c) => s + c.totalSales, 0);

    return {
      reportName: 'Sales by Customer',
      dateRange: { from: dateFilter?.startDate || 'All Time', to: dateFilter?.endDate || 'Present' },
      generatedAt: new Date().toISOString(),
      customers: customers.map(c => ({ ...c, percentage: grandTotal > 0 ? ((c.totalSales / grandTotal) * 100).toFixed(1) : '0' })),
      summary: { grandTotal: grandTotal.toFixed(2), customerCount: customers.length },
    };
  }

  // ================================================================
  // 9. SALES BY PRODUCT
  // ================================================================
  async getSalesByProduct(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const where: any = { invoice: { companyId, status: { not: 'CANCELLED' } } };
    if (dateFilter?.startDate || dateFilter?.endDate) {
      where.invoice.issueDate = {};
      if (dateFilter.startDate) where.invoice.issueDate.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) where.invoice.issueDate.lte = new Date(dateFilter.endDate);
    }

    const items = await this.prisma.invoiceItem.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, costPrice: true } },
        invoice: { select: { issueDate: true } },
      },
    });

    const productMap = new Map<string, any>();
    for (const item of items) {
      const key = item.productId || item.description;
      const existing = productMap.get(key) || {
        productId: item.productId,
        productName: item.product?.name || item.description,
        sku: item.product?.sku || '',
        totalQty: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        invoiceCount: 0,
      };
      const qty = Number(item.quantity);
      const revenue = Number(item.totalAmount);
      const costPrice = Number(item.product?.costPrice || 0);
      existing.totalQty += qty;
      existing.totalRevenue += revenue;
      existing.totalCost += costPrice * qty;
      existing.totalProfit += revenue - (costPrice * qty);
      existing.invoiceCount++;
      productMap.set(key, existing);
    }

    const products = Array.from(productMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
    const grandTotal = products.reduce((s, p) => s + p.totalRevenue, 0);

    return {
      reportName: 'Sales by Product',
      dateRange: { from: dateFilter?.startDate || 'All Time', to: dateFilter?.endDate || 'Present' },
      generatedAt: new Date().toISOString(),
      products: products.map(p => ({
        ...p,
        profitMargin: p.totalRevenue > 0 ? ((p.totalProfit / p.totalRevenue) * 100).toFixed(1) : '0',
        percentage: grandTotal > 0 ? ((p.totalRevenue / grandTotal) * 100).toFixed(1) : '0',
      })),
      summary: { grandTotal: grandTotal.toFixed(2), productCount: products.length },
    };
  }

  // ================================================================
  // 10. DAILY PROFIT REPORT
  // ================================================================
  async getDailyProfit(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const where: any = { companyId, status: { in: ['PAID', 'PARTIAL', 'SENT'] } };
    if (dateFilter?.startDate || dateFilter?.endDate) {
      where.issueDate = {};
      if (dateFilter.startDate) where.issueDate.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) where.issueDate.lte = new Date(dateFilter.endDate);
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: { items: { include: { product: { select: { costPrice: true } } } } },
      orderBy: { issueDate: 'asc' },
    });

    const dailyMap = new Map<string, any>();
    for (const inv of invoices) {
      const day = new Date(inv.issueDate).toISOString().split('T')[0];
      const existing = dailyMap.get(day) || { date: day, revenue: 0, cost: 0, profit: 0, invoiceCount: 0 };
      let dayCost = 0;
      for (const item of inv.items) {
        dayCost += Number(item.product?.costPrice || 0) * Number(item.quantity);
      }
      existing.revenue += Number(inv.totalAmount);
      existing.cost += dayCost;
      existing.profit += Number(inv.totalAmount) - dayCost;
      existing.invoiceCount++;
      dailyMap.set(day, existing);
    }

    const days = Array.from(dailyMap.values());
    const totalRevenue = days.reduce((s, d) => s + d.revenue, 0);
    const totalCost = days.reduce((s, d) => s + d.cost, 0);
    const totalProfit = days.reduce((s, d) => s + d.profit, 0);

    return {
      reportName: 'Daily Profit Report',
      dateRange: { from: dateFilter?.startDate || 'All Time', to: dateFilter?.endDate || 'Present' },
      generatedAt: new Date().toISOString(),
      days,
      summary: {
        totalRevenue: totalRevenue.toFixed(2),
        totalCost: totalCost.toFixed(2),
        totalProfit: totalProfit.toFixed(2),
        avgDailyProfit: days.length > 0 ? (totalProfit / days.length).toFixed(2) : '0',
        profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0',
        dayCount: days.length,
      },
    };
  }

  // ================================================================
  // 11. PROFIT BY PRODUCT
  // ================================================================
  async getProfitByProduct(companyId: string, dateFilter?: DateFilter) {
    const salesData = await this.getSalesByProduct(companyId, dateFilter);
    const products = salesData.products.sort((a: any, b: any) => b.totalProfit - a.totalProfit);
    const totalProfit = products.reduce((s: number, p: any) => s + p.totalProfit, 0);

    return {
      reportName: 'Profit by Product',
      dateRange: salesData.dateRange,
      generatedAt: new Date().toISOString(),
      products: products.map((p: any) => ({
        ...p,
        profitShare: totalProfit > 0 ? ((p.totalProfit / totalProfit) * 100).toFixed(1) : '0',
      })),
      summary: { totalProfit: totalProfit.toFixed(2), productCount: products.length },
    };
  }

  // ================================================================
  // 12. PROFIT BY CUSTOMER
  // ================================================================
  async getProfitByCustomer(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const where: any = { companyId, status: { not: 'CANCELLED' } };
    if (dateFilter?.startDate || dateFilter?.endDate) {
      where.issueDate = {};
      if (dateFilter.startDate) where.issueDate.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) where.issueDate.lte = new Date(dateFilter.endDate);
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        items: { include: { product: { select: { costPrice: true } } } },
      },
    });

    const custMap = new Map<string, any>();
    for (const inv of invoices) {
      const key = inv.customerId || 'walk-in';
      const existing = custMap.get(key) || {
        customerId: key, customerName: inv.customer?.name || 'Walk-in',
        revenue: 0, cost: 0, profit: 0, invoiceCount: 0,
      };
      let invCost = 0;
      for (const item of inv.items) {
        invCost += Number(item.product?.costPrice || 0) * Number(item.quantity);
      }
      existing.revenue += Number(inv.totalAmount);
      existing.cost += invCost;
      existing.profit += Number(inv.totalAmount) - invCost;
      existing.invoiceCount++;
      custMap.set(key, existing);
    }

    const customers = Array.from(custMap.values()).sort((a, b) => b.profit - a.profit);
    const totalProfit = customers.reduce((s, c) => s + c.profit, 0);

    return {
      reportName: 'Profit by Customer',
      dateRange: { from: dateFilter?.startDate || 'All Time', to: dateFilter?.endDate || 'Present' },
      generatedAt: new Date().toISOString(),
      customers: customers.map(c => ({
        ...c,
        profitMargin: c.revenue > 0 ? ((c.profit / c.revenue) * 100).toFixed(1) : '0',
      })),
      summary: { totalProfit: totalProfit.toFixed(2), customerCount: customers.length },
    };
  }

  // ================================================================
  // 13. TOP PRODUCTS REPORT
  // ================================================================
  async getTopProducts(companyId: string, dateFilter?: DateFilter, limit = 20) {
    const salesData = await this.getSalesByProduct(companyId, dateFilter);
    return {
      reportName: 'Top Products',
      dateRange: salesData.dateRange,
      generatedAt: new Date().toISOString(),
      products: salesData.products.slice(0, limit),
      summary: salesData.summary,
    };
  }

  // ================================================================
  // 14. RECEIVABLES AGING REPORT
  // ================================================================
  async getAgingReport(companyId: string) {
    await this.validateCompany(companyId);
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { in: ['SENT', 'PARTIAL', 'OVERDUE'] } },
      include: { customer: { select: { id: true, name: true } } },
    });

    const now = new Date();
    const aging = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
    const details: any[] = [];

    for (const inv of invoices) {
      const balance = Number(inv.totalAmount) - Number(inv.paidAmount);
      if (balance <= 0) continue;
      const dueDate = new Date(inv.dueDate || inv.issueDate || now);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      let bucket = 'current';
      if (daysOverdue <= 0) { aging.current += balance; bucket = 'current'; }
      else if (daysOverdue <= 30) { aging.days30 += balance; bucket = '1-30'; }
      else if (daysOverdue <= 60) { aging.days60 += balance; bucket = '31-60'; }
      else if (daysOverdue <= 90) { aging.days90 += balance; bucket = '61-90'; }
      else { aging.over90 += balance; bucket = '90+'; }
      aging.total += balance;

      details.push({
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer?.name || 'Walk-in',
        dueDate: inv.dueDate,
        totalAmount: Number(inv.totalAmount),
        balance,
        daysOverdue: Math.max(0, daysOverdue),
        bucket,
      });
    }

    return {
      reportName: 'Receivables Aging Report',
      generatedAt: new Date().toISOString(),
      aging,
      details: details.sort((a, b) => b.daysOverdue - a.daysOverdue),
    };
  }

  // ================================================================
  // 15. SALES SUMMARY (Monthly/Weekly)
  // ================================================================
  async getSalesSummary(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const where: any = { companyId, status: { not: 'CANCELLED' } };
    if (dateFilter?.startDate || dateFilter?.endDate) {
      where.issueDate = {};
      if (dateFilter.startDate) where.issueDate.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) where.issueDate.lte = new Date(dateFilter.endDate);
    }

    const invoices = await this.prisma.invoice.findMany({ where, orderBy: { issueDate: 'asc' } });

    const monthlyMap = new Map<string, any>();
    let totalSales = 0, totalPaid = 0, totalInvoices = 0;

    for (const inv of invoices) {
      const d = new Date(inv.issueDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthlyMap.get(key) || { month: key, sales: 0, paid: 0, invoiceCount: 0 };
      existing.sales += Number(inv.totalAmount);
      existing.paid += Number(inv.paidAmount);
      existing.invoiceCount++;
      monthlyMap.set(key, existing);
      totalSales += Number(inv.totalAmount);
      totalPaid += Number(inv.paidAmount);
      totalInvoices++;
    }

    return {
      reportName: 'Sales Summary',
      dateRange: { from: dateFilter?.startDate || 'All Time', to: dateFilter?.endDate || 'Present' },
      generatedAt: new Date().toISOString(),
      monthly: Array.from(monthlyMap.values()),
      summary: {
        totalSales: totalSales.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalOutstanding: (totalSales - totalPaid).toFixed(2),
        totalInvoices,
        avgInvoiceValue: totalInvoices > 0 ? (totalSales / totalInvoices).toFixed(2) : '0',
      },
    };
  }

  // ================================================================
  // 16. EXPENSE BY CATEGORY
  // ================================================================
  async getExpenseByCategory(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const where: any = { companyId, status: { not: 'CANCELLED' } };
    if (dateFilter?.startDate || dateFilter?.endDate) {
      where.date = {};
      if (dateFilter.startDate) where.date.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) where.date.lte = new Date(dateFilter.endDate);
    }

    const expenses = await this.prisma.expense.findMany({ where });
    // Since we don't have direct include for Account, we need to fetch them
    const accountIds = Array.from(new Set(expenses.map(e => e.expenseAccountId)));
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true, code: true }
    });
    const accMap = new Map(accounts.map(a => [a.id, a]));

    const catMap = new Map<string, any>();
    for (const exp of expenses) {
      const acc = accMap.get(exp.expenseAccountId) || { name: 'Unknown Category', code: '---' };
      const existing = catMap.get(exp.expenseAccountId) || {
        categoryId: exp.expenseAccountId,
        categoryName: acc.name,
        categoryCode: acc.code,
        expenseCount: 0,
        totalAmount: 0,
      };
      existing.expenseCount++;
      existing.totalAmount += Number(exp.amount);
      catMap.set(exp.expenseAccountId, existing);
    }

    const categories = Array.from(catMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    const grandTotal = categories.reduce((s, c) => s + c.totalAmount, 0);

    return {
      reportName: 'Expense by Category',
      dateRange: { from: dateFilter?.startDate || 'All Time', to: dateFilter?.endDate || 'Present' },
      generatedAt: new Date().toISOString(),
      categories: categories.map(c => ({
        ...c,
        percentage: grandTotal > 0 ? ((c.totalAmount / grandTotal) * 100).toFixed(1) : '0',
      })),
      summary: { grandTotal: grandTotal.toFixed(2), categoryCount: categories.length },
    };
  }

  // ================================================================
  // 17. PURCHASE BY VENDOR
  // ================================================================
  async getPurchaseByVendor(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const where: any = { companyId, status: { not: 'CANCELLED' } };
    if (dateFilter?.startDate || dateFilter?.endDate) {
      where.billDate = {};
      if (dateFilter.startDate) where.billDate.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) where.billDate.lte = new Date(dateFilter.endDate);
    }

    const bills = await this.prisma.purchaseBill.findMany({
      where,
      include: { vendor: { select: { id: true, name: true } } },
    });

    const vendorMap = new Map<string, any>();
    for (const bill of bills) {
      const key = bill.vendorId || 'walk-in';
      const existing = vendorMap.get(key) || {
        vendorId: key,
        vendorName: bill.vendor?.name || 'Walk-in Vendor',
        billCount: 0,
        totalPurchases: 0,
        totalPaid: 0,
        totalOutstanding: 0,
      };
      existing.billCount++;
      existing.totalPurchases += Number(bill.totalAmount);
      existing.totalPaid += Number(bill.paidAmount);
      existing.totalOutstanding += Number(bill.totalAmount) - Number(bill.paidAmount);
      vendorMap.set(key, existing);
    }

    const vendors = Array.from(vendorMap.values()).sort((a, b) => b.totalPurchases - a.totalPurchases);
    const grandTotal = vendors.reduce((s, v) => s + v.totalPurchases, 0);

    return {
      reportName: 'Purchase by Vendor',
      dateRange: { from: dateFilter?.startDate || 'All Time', to: dateFilter?.endDate || 'Present' },
      generatedAt: new Date().toISOString(),
      vendors: vendors.map(v => ({
        ...v,
        percentage: grandTotal > 0 ? ((v.totalPurchases / grandTotal) * 100).toFixed(1) : '0',
      })),
      summary: { grandTotal: grandTotal.toFixed(2), vendorCount: vendors.length },
    };
  }

  // ================================================================
  // 18. PAYMENT COLLECTION REPORT
  // ================================================================
  async getPaymentCollection(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const where: any = { companyId };
    if (dateFilter?.startDate || dateFilter?.endDate) {
      where.paymentDate = {};
      if (dateFilter.startDate) where.paymentDate.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) where.paymentDate.lte = new Date(dateFilter.endDate);
    }

    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { paymentDate: 'desc' }
    });

    const methodMap = new Map<string, any>();
    let totalAmount = 0;
    
    for (const payment of payments) {
      const method = payment.method || 'CASH';
      const existing = methodMap.get(method) || { method, count: 0, amount: 0 };
      existing.count++;
      existing.amount += Number(payment.amount);
      totalAmount += Number(payment.amount);
      methodMap.set(method, existing);
    }

    const methods = Array.from(methodMap.values()).sort((a, b) => b.amount - a.amount);

    return {
      reportName: 'Payment Collection Report',
      dateRange: { from: dateFilter?.startDate || 'All Time', to: dateFilter?.endDate || 'Present' },
      generatedAt: new Date().toISOString(),
      methods: methods.map(m => ({
        ...m,
        percentage: totalAmount > 0 ? ((m.amount / totalAmount) * 100).toFixed(1) : '0',
      })),
      summary: { totalAmount: totalAmount.toFixed(2), paymentCount: payments.length },
    };
  }

  // ================================================================
  // 19. STOCK VALUATION REPORT
  // ================================================================
  async getStockValuation(companyId: string) {
    await this.validateCompany(companyId);
    
    const products = await this.prisma.product.findMany({
      where: { companyId, trackInventory: true },
      include: {
        warehouseStocks: { select: { quantity: true, warehouseId: true } },
      }
    });

    let totalValuation = 0;
    let totalQty = 0;
    
    const valuationData = products.map(p => {
      const stockQty = p.warehouseStocks.reduce((sum, ws) => sum + Number(ws.quantity), 0);
      const cost = Number(p.costPrice || 0);
      const val = stockQty * cost;
      totalValuation += val;
      totalQty += stockQty;
      return {
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        costPrice: cost.toFixed(2),
        totalStock: stockQty,
        valuation: val.toFixed(2),
      };
    }).sort((a, b) => Number(b.valuation) - Number(a.valuation));

    return {
      reportName: 'Stock Valuation Report',
      generatedAt: new Date().toISOString(),
      products: valuationData,
      summary: {
        totalValuation: totalValuation.toFixed(2),
        totalItems: totalQty,
        productCount: valuationData.length
      }
    };
  }

  // ================================================================
  // 20. SLOW MOVING STOCK
  // ================================================================
  async getSlowMovingStock(companyId: string, daysThreshold: number = 90) {
    await this.validateCompany(companyId);
    
    // Get all trackable products
    const products = await this.prisma.product.findMany({
      where: { companyId, trackInventory: true },
      include: { warehouseStocks: { select: { quantity: true } } }
    });

    // Get last invoice item for each product
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

    const slowProducts: any[] = [];
    
    for (const p of products) {
      const stockQty = p.warehouseStocks.reduce((sum, ws) => sum + Number(ws.quantity), 0);
      if (stockQty <= 0) continue; // Skip if no stock

      // Check last sold date
      const lastSold = await this.prisma.invoiceItem.findFirst({
        where: { productId: p.id, invoice: { status: { not: 'CANCELLED' } } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });

      let daysSinceSold = 999;
      if (lastSold) {
        daysSinceSold = Math.floor((new Date().getTime() - lastSold.createdAt.getTime()) / (1000 * 3600 * 24));
      }

      if (daysSinceSold >= daysThreshold || !lastSold) {
        slowProducts.push({
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          currentStock: stockQty,
          lastSoldDate: lastSold ? lastSold.createdAt : null,
          daysSinceSold: lastSold ? daysSinceSold : 'Never',
          costValue: (stockQty * Number(p.costPrice || 0)).toFixed(2)
        });
      }
    }

    slowProducts.sort((a, b) => {
      const aDays = a.daysSinceSold === 'Never' ? 9999 : a.daysSinceSold;
      const bDays = b.daysSinceSold === 'Never' ? 9999 : b.daysSinceSold;
      return bDays - aDays;
    });

    const totalTiedUp = slowProducts.reduce((sum, p) => sum + Number(p.costValue), 0);

    return {
      reportName: 'Slow Moving Stock Report',
      thresholdDays: daysThreshold,
      generatedAt: new Date().toISOString(),
      products: slowProducts,
      summary: {
        productCount: slowProducts.length,
        capitalTiedUp: totalTiedUp.toFixed(2)
      }
    };
  }

  // ================================================================
  // 21. PEAK HOURS ANALYSIS
  // ================================================================
  async getPeakHoursAnalysis(companyId: string, dateFilter?: DateFilter) {
    await this.validateCompany(companyId);
    const where: any = { companyId, status: { not: 'CANCELLED' } };
    if (dateFilter?.startDate || dateFilter?.endDate) {
      where.issueDate = {};
      if (dateFilter.startDate) where.issueDate.gte = new Date(dateFilter.startDate);
      if (dateFilter.endDate) where.issueDate.lte = new Date(dateFilter.endDate);
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      select: { createdAt: true, totalAmount: true }
    });

    const hourMap = new Map<number, { count: number, revenue: number }>();
    for (let i = 0; i < 24; i++) {
      hourMap.set(i, { count: 0, revenue: 0 });
    }

    for (const inv of invoices) {
      const h = inv.createdAt.getHours();
      const existing = hourMap.get(h)!;
      existing.count++;
      existing.revenue += Number(inv.totalAmount);
      hourMap.set(h, existing);
    }

    const hours = Array.from(hourMap.entries()).map(([hour, data]) => {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const h12 = hour % 12 || 12;
      return {
        hour,
        label: `${h12}:00 ${ampm}`,
        invoiceCount: data.count,
        revenue: data.revenue.toFixed(2)
      };
    });

    // Find peak
    const sortedByRevenue = [...hours].sort((a, b) => Number(b.revenue) - Number(a.revenue));
    const sortedByCount = [...hours].sort((a, b) => b.invoiceCount - a.invoiceCount);

    return {
      reportName: 'Peak Hours Analysis',
      dateRange: { from: dateFilter?.startDate || 'All Time', to: dateFilter?.endDate || 'Present' },
      generatedAt: new Date().toISOString(),
      hourlyData: hours,
      summary: {
        peakRevenueHour: sortedByRevenue[0]?.label,
        peakVolumeHour: sortedByCount[0]?.label,
        totalInvoices: invoices.length,
        totalRevenue: invoices.reduce((s, i) => s + Number(i.totalAmount), 0).toFixed(2)
      }
    };
  }

  // ================================================================
  // 22. PAYABLES AGING REPORT
  // ================================================================
  async getPayablesAging(companyId: string) {
    await this.validateCompany(companyId);
    const bills = await this.prisma.purchaseBill.findMany({
      where: { companyId, status: { in: ['OPEN', 'PARTIAL'] } },
      include: { vendor: { select: { id: true, name: true } } },
    });

    const now = new Date();
    const aging = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
    const details: any[] = [];

    for (const bill of bills) {
      const balance = Number(bill.totalAmount) - Number(bill.paidAmount);
      if (balance <= 0) continue;
      
      const dueDate = new Date(bill.dueDate || bill.billDate || now);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      let bucket = 'current';
      if (daysOverdue <= 0) { aging.current += balance; bucket = 'current'; }
      else if (daysOverdue <= 30) { aging.days30 += balance; bucket = '1-30'; }
      else if (daysOverdue <= 60) { aging.days60 += balance; bucket = '31-60'; }
      else if (daysOverdue <= 90) { aging.days90 += balance; bucket = '61-90'; }
      else { aging.over90 += balance; bucket = '90+'; }
      aging.total += balance;

      details.push({
        billNumber: bill.billNumber,
        vendorName: bill.vendor?.name || 'Walk-in Vendor',
        dueDate: bill.dueDate,
        totalAmount: Number(bill.totalAmount),
        balance,
        daysOverdue: Math.max(0, daysOverdue),
        bucket,
      });
    }

    return {
      reportName: 'Payables Aging Report',
      generatedAt: new Date().toISOString(),
      aging,
      details: details.sort((a, b) => b.daysOverdue - a.daysOverdue),
    };
  }

  // ================================================================
  // DASHBOARD SUMMARY
  // ================================================================
  async getDashboardSummary(companyId: string) {
    await this.validateCompany(companyId);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 1. Total Revenue (Invoices issues this month)
    const revenueAgg = await this.prisma.invoice.aggregate({
      where: { companyId, issueDate: { gte: startOfMonth, lte: endOfMonth }, status: { not: 'CANCELLED' } },
      _sum: { totalAmount: true },
    });
    const totalRevenue = revenueAgg._sum.totalAmount || 0;

    // 2. Total Expenses (Expenses recorded this month)
    const expenseAgg = await this.prisma.expense.aggregate({
      where: { companyId, date: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { amount: true },
    });
    const totalExpenses = expenseAgg._sum.amount || 0;

    // 3. Unpaid Invoices Count (Pending + Overdue)
    const unpaidInvoicesCount = await this.prisma.invoice.count({
      where: { companyId, status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] } },
    });

    // 4. Active Customers Count
    const activeCustomersCount = await this.prisma.customer.count({
      where: { companyId },
    });

    // 5. Recent Transactions / Invoices
    const recentInvoices = await this.prisma.invoice.findMany({
      where: { companyId },
      orderBy: { issueDate: 'desc' },
      take: 5,
      include: { customer: { select: { name: true } } },
    });

    const recentInvoicesFormatted = recentInvoices.map((inv) => ({
      id: inv.id,
      number: inv.invoiceNumber,
      date: inv.issueDate,
      customer: inv.customer?.name || 'Walk-in',
      amount: new Decimal(inv.totalAmount).toFixed(2),
      status: inv.status,
    }));

    // 6. Expense Breakdown (Current Month)
    const expenses = await this.prisma.expense.findMany({
      where: { companyId, date: { gte: startOfMonth, lte: endOfMonth } },
      include: { company: { select: { id: true } } }, // dummy include just to get raw, or we can use raw query
    });
    
    // We need category. In Expense model, there's no category string, there's `expenseAccountId`.
    // Let's get the account names for these expenses
    const accountIds = [...new Set(expenses.map(e => e.expenseAccountId))];
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
    });
    const accountMap = new Map(accounts.map(a => [a.id, a.name]));

    const expenseBreakdownMap = new Map<string, number>();
    for (const exp of expenses) {
      const cat = accountMap.get(exp.expenseAccountId) || 'Other';
      const val = Number(exp.amount);
      expenseBreakdownMap.set(cat, (expenseBreakdownMap.get(cat) || 0) + val);
    }
    const expenseBreakdown = Array.from(expenseBreakdownMap.entries()).map(([name, value]) => ({ name, value }));

    // 7. Income vs Expense Trend (Last 6 Months)
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      const rev = await this.prisma.invoice.aggregate({
        where: { companyId, issueDate: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
      });
      const exp = await this.prisma.expense.aggregate({
        where: { companyId, date: { gte: start, lte: end } },
        _sum: { amount: true },
      });

      trend.push({
        month: d.toLocaleString('default', { month: 'short' }),
        income: Number(rev._sum.totalAmount || 0),
        expense: Number(exp._sum.amount || 0),
      });
    }

    return {
      totalRevenue: Number(totalRevenue).toFixed(2),
      totalExpenses: Number(totalExpenses).toFixed(2),
      unpaidInvoices: unpaidInvoicesCount,
      activeCustomers: activeCustomersCount,
      recentInvoices: recentInvoicesFormatted,
      expenseBreakdown,
      trend,
    };
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================
  private async validateCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }
}
