import { Test, TestingModule } from '@nestjs/testing';
import { CreditNotesService } from './credit-notes.service';

describe('CreditNotesService', () => {
  let service: CreditNotesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CreditNotesService],
    }).compile();

    service = module.get<CreditNotesService>(CreditNotesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
