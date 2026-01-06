import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { ProfessionalCategory } from './professional-category.entity';
import { TimeEntry } from '../../projects/entities/time-entry.entity';

export enum EmploymentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ON_LEAVE = 'on_leave',
}

@Entity('collaborators')
export class Collaborator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column('uuid')
  categoryId: string;

  @ManyToOne(() => ProfessionalCategory, (category) => category.collaborators)
  @JoinColumn({ name: 'categoryId' })
  category: ProfessionalCategory;

  @Column({
    type: 'enum',
    enum: EmploymentStatus,
    default: EmploymentStatus.ACTIVE,
  })
  status: EmploymentStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  costRate: number;

  @OneToMany(() => TimeEntry, (entry) => entry.collaborator)
  timeEntries: TimeEntry[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
