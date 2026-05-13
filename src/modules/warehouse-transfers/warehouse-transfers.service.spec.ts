import { Test, TestingModule } from '@nestjs/testing';
import { WarehouseTransfersService } from './warehouse-transfers.service';

describe('WarehouseTransfersService', () => {
  let service: WarehouseTransfersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WarehouseTransfersService],
    }).compile();

    service = module.get<WarehouseTransfersService>(WarehouseTransfersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
