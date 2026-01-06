import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';
import { Collaborator } from '../../commercial/entities/collaborator.entity';

@Entity('project_assignments')
export class ProjectAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  projectId: string;

  @ManyToOne(() => Project, (project) => project.assignments)
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column('uuid')
  collaboratorId: string;

  @ManyToOne(() => Collaborator)
  @JoinColumn({ name: 'collaboratorId' })
  collaborator: Collaborator;

  @Column({ nullable: true })
  role: string;

  @Column({ type: 'int', default: 100 })
  allocationPercentage: number;

  @Column({ type: 'date', nullable: true })
  startDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @CreateDateColumn()
  createdAt: Date;
}
