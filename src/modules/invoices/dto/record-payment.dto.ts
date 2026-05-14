import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';

const PAYMENT_METHODS = ['CASH', 'BANK', 'CHEQUE', 'ONLINE'];

export class RecordPaymentDto {
  @IsNotEmpty()
  @IsString()
  companyId: string;

  @IsNotEmpty()
  @IsString()
  invoiceId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Payment amount must be greater than zero' })
  amount: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(PAYMENT_METHODS, {
    message: 'method must be one of: CASH, BANK, CHEQUE, ONLINE',
  })
  method?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Account IDs for journal entry auto-posting
  @IsOptional()
  @IsString()
  receivableAccountId?: string; // Accounts Receivable (credit side)

  @IsOptional()
  @IsString()
  cashBankAccountId?: string; // Cash or Bank (debit side)
}
