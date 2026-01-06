import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Proposal } from './proposal.entity';
import { ProposalExpense } from './proposal-expense.entity';
import { ProposalAdditive } from './proposal-additive.entity';

@Entity('proposal_revisions')
export class ProposalRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  proposalId: string;

  @ManyToOne(() => Proposal, (proposal) => proposal.revisions)
  @JoinColumn({ name: 'proposalId' })
  proposal: Proposal;

  @Column({ type: 'int' })
  revisionNumber: number;

  @Column({ nullable: true })
  summary: string;

  @Column({ type: 'text', nullable: true })
  scope: string;

  @Column({ type: 'text', nullable: true })
  assumptions: string;

  @Column({ type: 'text', nullable: true })
  deliverables: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalValue: number;

  @Column({ type: 'int', default: 0 })
  estimatedHours: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => ProposalExpense, (expense) => expense.revision)
  expenses: ProposalExpense[];

  @OneToMany(() => ProposalAdditive, (additive) => additive.revision)
  additives: ProposalAdditive[];

  @CreateDateColumn()
  createdAt: Date;
}
