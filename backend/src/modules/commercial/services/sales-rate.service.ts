import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesRate } from '../entities/sales-rate.entity';
import { CreateSalesRateDto, UpdateSalesRateDto } from '../dto/sales-rate.dto';

@Injectable()
export class SalesRateService {
  constructor(
    @InjectRepository(SalesRate)
    private rateRepository: Repository<SalesRate>,
  ) {}

  async create(dto: CreateSalesRateDto): Promise<SalesRate> {
    const rate = this.rateRepository.create(dto);
    return this.rateRepository.save(rate);
  }

  async findAll(): Promise<SalesRate[]> {
    return this.rateRepository.find({
      relations: ['category'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByCategory(categoryId: string): Promise<SalesRate[]> {
    return this.rateRepository.find({
      where: { categoryId },
      order: { validFrom: 'DESC' },
    });
  }

  async findOne(id: string): Promise<SalesRate> {
    const rate = await this.rateRepository.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!rate) {
      throw new NotFoundException(`Rate with ID ${id} not found`);
    }
    return rate;
  }

  async update(id: string, dto: UpdateSalesRateDto): Promise<SalesRate> {
    await this.findOne(id);
    await this.rateRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.rateRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Rate with ID ${id} not found`);
    }
  }
}
