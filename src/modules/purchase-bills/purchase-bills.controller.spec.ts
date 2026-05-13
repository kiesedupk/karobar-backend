import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseBillsController } from './purchase-bills.controller';

describe('PurchaseBillsController', () => {
  let controller: PurchaseBillsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseBillsController],
    }).compile();

    controller = module.get<PurchaseBillsController>(PurchaseBillsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
