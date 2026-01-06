import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { SalesRate } from './sales-rate.entity';
import { Collaborator } from './collaborator.entity';

@Entity('professional_categories')
export class ProfessionalCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => SalesRate, (rate) => rate.category)
  rates: SalesRate[];

  @OneToMany(() => Collaborator, (collaborator) => collaborator.category)
  collaborators: Collaborator[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
