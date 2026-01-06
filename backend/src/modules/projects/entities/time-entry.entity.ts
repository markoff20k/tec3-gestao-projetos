import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';
import { Collaborator } from '../../commercial/entities/collaborator.entity';
import { User } from '../../auth/entities/user.entity';

export enum TimeEntryStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('time_entries')
export class TimeEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  projectId: string;

  @ManyToOne(() => Project, (project) => project.timeEntries)
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column('uuid')
  collaboratorId: string;

  @ManyToOne(() => Collaborator, (collaborator) => collaborator.timeEntries)
  @JoinColumn({ name: 'collaboratorId' })
  collaborator: Collaborator;

  @Column({ type: 'date' })
  entryDate: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  hours: number;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: TimeEntryStatus,
    default: TimeEntryStatus.PENDING,
  })
  status: TimeEntryStatus;

  @Column('uuid', { nullable: true })
  approvedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approvedById' })
  approvedBy: User;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date;

  @Column({ nullable: true })
  rejectionReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
