import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProposalRevision } from './proposal-revision.entity';
import { Project } from '../../projects/entities/project.entity';

@Entity('proposal_additives')
export class ProposalAdditive {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  revisionId: string;

  @ManyToOne(() => ProposalRevision, (revision) => revision.additives)
  @JoinColumn({ name: 'revisionId' })
  revision: ProposalRevision;

  @Column('uuid', { nullable: true })
  projectId: string;

  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  value: number;

  @Column({ type: 'int', default: 0 })
  estimatedHours: number;

  @Column({ nullable: true })
  justification: string;

  @CreateDateColumn()
  createdAt: Date;
}
