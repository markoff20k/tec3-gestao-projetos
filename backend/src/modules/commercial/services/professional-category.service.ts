import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfessionalCategory } from '../entities/professional-category.entity';
import { CreateProfessionalCategoryDto, UpdateProfessionalCategoryDto } from '../dto/professional-category.dto';

@Injectable()
export class ProfessionalCategoryService {
  constructor(
    @InjectRepository(ProfessionalCategory)
    private categoryRepository: Repository<ProfessionalCategory>,
  ) {}

  async create(dto: CreateProfessionalCategoryDto): Promise<ProfessionalCategory> {
    const category = this.categoryRepository.create(dto);
    return this.categoryRepository.save(category);
  }

  async findAll(): Promise<ProfessionalCategory[]> {
    return this.categoryRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ProfessionalCategory> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['rates', 'collaborators'],
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async update(id: string, dto: UpdateProfessionalCategoryDto): Promise<ProfessionalCategory> {
    await this.findOne(id);
    await this.categoryRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.categoryRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
  }
}
