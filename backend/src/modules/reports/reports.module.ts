import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../projects/entities/project.entity';
import { TimeEntry } from '../projects/entities/time-entry.entity';
import { Proposal } from '../commercial/entities/proposal.entity';
import { Client } from '../commercial/entities/client.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, TimeEntry, Proposal, Client]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
