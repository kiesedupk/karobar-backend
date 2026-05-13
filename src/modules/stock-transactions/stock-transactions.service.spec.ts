import { Test, TestingModule } from '@nestjs/testing';
import { StockTransactionsService } from './stock-transactions.service';

describe('StockTransactionsService', () => {
  let service: StockTransactionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StockTransactionsService],
    }).compile();

    service = module.get<StockTransactionsService>(StockTransactionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
