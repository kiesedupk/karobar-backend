import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseBillsService } from './purchase-bills.service';

describe('PurchaseBillsService', () => {
  let service: PurchaseBillsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PurchaseBillsService],
    }).compile();

    service = module.get<PurchaseBillsService>(PurchaseBillsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
