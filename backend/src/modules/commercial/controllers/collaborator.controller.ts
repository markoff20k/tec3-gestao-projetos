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
import { CollaboratorService } from '../services/collaborator.service';
import { CreateCollaboratorDto, UpdateCollaboratorDto } from '../dto/collaborator.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@Controller('collaborators')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollaboratorController {
  constructor(private collaboratorService: CollaboratorService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
  create(@Body() dto: CreateCollaboratorDto) {
    return this.collaboratorService.create(dto);
  }

  @Get()
  findAll() {
    return this.collaboratorService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.collaboratorService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
  update(@Param('id') id: string, @Body() dto: UpdateCollaboratorDto) {
    return this.collaboratorService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.collaboratorService.remove(id);
  }
}
