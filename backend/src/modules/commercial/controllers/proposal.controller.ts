import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ProposalService } from '../services/proposal.service';
import {
  CreateProposalDto,
  UpdateProposalDto,
  CreateProposalRevisionDto,
  CreateProposalExpenseDto,
  CreateProposalAdditiveDto,
  ConvertToProjectDto,
} from '../dto/proposal.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@Controller('proposals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProposalController {
  constructor(private proposalService: ProposalService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.COORDINATOR)
  create(@Body() dto: CreateProposalDto) {
    return this.proposalService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.COORDINATOR)
  findAll() {
    return this.proposalService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.COORDINATOR)
  findOne(@Param('id') id: string) {
    return this.proposalService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.COORDINATOR)
  update(@Param('id') id: string, @Body() dto: UpdateProposalDto) {
    return this.proposalService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
  remove(@Param('id') id: string) {
    return this.proposalService.remove(id);
  }

  @Post('revisions')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.COORDINATOR)
  createRevision(@Body() dto: CreateProposalRevisionDto) {
    return this.proposalService.createRevision(dto);
  }

  @Get(':id/revisions')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.COORDINATOR)
  getRevisions(@Param('id') id: string) {
    return this.proposalService.getRevisions(id);
  }

  @Get('revisions/:id')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.COORDINATOR)
  getRevision(@Param('id') id: string) {
    return this.proposalService.getRevision(id);
  }

  @Post('expenses')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.COORDINATOR)
  createExpense(@Body() dto: CreateProposalExpenseDto) {
    return this.proposalService.createExpense(dto);
  }

  @Delete('expenses/:id')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
  removeExpense(@Param('id') id: string) {
    return this.proposalService.removeExpense(id);
  }

  @Post('additives')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.COORDINATOR)
  createAdditive(@Body() dto: CreateProposalAdditiveDto) {
    return this.proposalService.createAdditive(dto);
  }

  @Delete('additives/:id')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
  removeAdditive(@Param('id') id: string) {
    return this.proposalService.removeAdditive(id);
  }

  @Post('convert')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
  convertToProject(@Body() dto: ConvertToProjectDto) {
    return this.proposalService.convertToProject(dto);
  }
}
