import { Test, TestingModule } from '@nestjs/testing';
import { DebitNotesController } from './debit-notes.controller';

describe('DebitNotesController', () => {
  let controller: DebitNotesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DebitNotesController],
    }).compile();

    controller = module.get<DebitNotesController>(DebitNotesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
