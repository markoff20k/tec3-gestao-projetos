import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from './client.entity';
import { ProposalRevision } from './proposal-revision.entity';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../auth/entities/user.entity';

export enum ProposalType {
  FIXED_PRICE = 'fixed_price',
  APPROPRIATION = 'appropriation',
  UMBRELLA = 'umbrella',
  SERVICE_ORDER = 'service_order',
  ADDITIVE = 'additive',
}

export enum ProposalStatus {
  DRAFT = 'draft',
  IN_REVIEW = 'in_review',
  SENT = 'sent',
  NEGOTIATING = 'negotiating',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  CONVERTED = 'converted',
}

@Entity('proposals')
export class Proposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column('uuid')
  clientId: string;

  @ManyToOne(() => Client, (client) => client.proposals)
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column('uuid', { nullable: true })
  coordinatorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'coordinatorId' })
  coordinator: User;

  @Column({
    type: 'enum',
    enum: ProposalType,
    default: ProposalType.FIXED_PRICE,
  })
  type: ProposalType;

  @Column({
    type: 'enum',
    enum: ProposalStatus,
    default: ProposalStatus.DRAFT,
  })
  status: ProposalStatus;

  @Column('uuid', { nullable: true })
  umbrellaProposalId: string;

  @ManyToOne(() => Proposal, { nullable: true })
  @JoinColumn({ name: 'umbrellaProposalId' })
  umbrellaProposal: Proposal;

  @Column('uuid', { nullable: true })
  projectId: string;

  @OneToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ type: 'date', nullable: true })
  expectedStartDate: Date;

  @Column({ type: 'date', nullable: true })
  expectedEndDate: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalValue: number;

  @Column({ type: 'int', default: 0 })
  estimatedHours: number;

  @OneToMany(() => ProposalRevision, (revision) => revision.proposal)
  revisions: ProposalRevision[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
