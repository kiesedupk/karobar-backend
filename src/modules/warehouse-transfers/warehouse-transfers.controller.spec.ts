import { Test, TestingModule } from '@nestjs/testing';
import { WarehouseTransfersController } from './warehouse-transfers.controller';

describe('WarehouseTransfersController', () => {
  let controller: WarehouseTransfersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WarehouseTransfersController],
    }).compile();

    controller = module.get<WarehouseTransfersController>(WarehouseTransfersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
