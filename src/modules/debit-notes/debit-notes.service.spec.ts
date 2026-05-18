import { Test, TestingModule } from '@nestjs/testing';
import { DebitNotesService } from './debit-notes.service';

describe('DebitNotesService', () => {
  let service: DebitNotesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DebitNotesService],
    }).compile();

    service = module.get<DebitNotesService>(DebitNotesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
