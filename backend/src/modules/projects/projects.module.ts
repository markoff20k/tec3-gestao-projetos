import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { TimeEntry } from './entities/time-entry.entity';
import { ProjectAssignment } from './entities/project-assignment.entity';
import { ProjectService } from './services/project.service';
import { ProjectController } from './controllers/project.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, TimeEntry, ProjectAssignment]),
  ],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectsModule {}
