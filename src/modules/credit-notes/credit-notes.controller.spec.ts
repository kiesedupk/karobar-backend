import { Test, TestingModule } from '@nestjs/testing';
import { CreditNotesController } from './credit-notes.controller';

describe('CreditNotesController', () => {
  let controller: CreditNotesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditNotesController],
    }).compile();

    controller = module.get<CreditNotesController>(CreditNotesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
