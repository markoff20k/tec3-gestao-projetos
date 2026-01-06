import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProposalRevision } from './proposal-revision.entity';

export enum ExpenseType {
  TRAVEL = 'travel',
  ACCOMMODATION = 'accommodation',
  EQUIPMENT = 'equipment',
  SOFTWARE = 'software',
  OTHER = 'other',
}

@Entity('proposal_expenses')
export class ProposalExpense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  revisionId: string;

  @ManyToOne(() => ProposalRevision, (revision) => revision.expenses)
  @JoinColumn({ name: 'revisionId' })
  revision: ProposalRevision;

  @Column()
  description: string;

  @Column({
    type: 'enum',
    enum: ExpenseType,
    default: ExpenseType.OTHER,
  })
  type: ExpenseType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
