import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalCategory } from './entities/professional-category.entity';
import { SalesRate } from './entities/sales-rate.entity';
import { Collaborator } from './entities/collaborator.entity';
import { Client } from './entities/client.entity';
import { Proposal } from './entities/proposal.entity';
import { ProposalRevision } from './entities/proposal-revision.entity';
import { ProposalExpense } from './entities/proposal-expense.entity';
import { ProposalAdditive } from './entities/proposal-additive.entity';
import { Project } from '../projects/entities/project.entity';
import { ProfessionalCategoryService } from './services/professional-category.service';
import { SalesRateService } from './services/sales-rate.service';
import { CollaboratorService } from './services/collaborator.service';
import { ClientService } from './services/client.service';
import { ProposalService } from './services/proposal.service';
import { ProfessionalCategoryController } from './controllers/professional-category.controller';
import { SalesRateController } from './controllers/sales-rate.controller';
import { CollaboratorController } from './controllers/collaborator.controller';
import { ClientController } from './controllers/client.controller';
import { ProposalController } from './controllers/proposal.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProfessionalCategory,
      SalesRate,
      Collaborator,
      Client,
      Proposal,
      ProposalRevision,
      ProposalExpense,
      ProposalAdditive,
      Project,
    ]),
  ],
  controllers: [
    ProfessionalCategoryController,
    SalesRateController,
    CollaboratorController,
    ClientController,
    ProposalController,
  ],
  providers: [
    ProfessionalCategoryService,
    SalesRateService,
    CollaboratorService,
    ClientService,
    ProposalService,
  ],
  exports: [
    ProfessionalCategoryService,
    SalesRateService,
    CollaboratorService,
    ClientService,
    ProposalService,
  ],
})
export class CommercialModule {}
