import { Module } from '@nestjs/common';
import { DebitNotesController } from './debit-notes.controller';
import { DebitNotesService } from './debit-notes.service';

@Module({
  controllers: [DebitNotesController],
  providers: [DebitNotesService]
})
export class DebitNotesModule {}
