import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Collaborator } from '../entities/collaborator.entity';
import { CreateCollaboratorDto, UpdateCollaboratorDto } from '../dto/collaborator.dto';

@Injectable()
export class CollaboratorService {
  constructor(
    @InjectRepository(Collaborator)
    private collaboratorRepository: Repository<Collaborator>,
  ) {}

  async create(dto: CreateCollaboratorDto): Promise<Collaborator> {
    const collaborator = this.collaboratorRepository.create(dto);
    return this.collaboratorRepository.save(collaborator);
  }

  async findAll(): Promise<Collaborator[]> {
    return this.collaboratorRepository.find({
      relations: ['category'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Collaborator> {
    const collaborator = await this.collaboratorRepository.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!collaborator) {
      throw new NotFoundException(`Collaborator with ID ${id} not found`);
    }
    return collaborator;
  }

  async update(id: string, dto: UpdateCollaboratorDto): Promise<Collaborator> {
    await this.findOne(id);
    await this.collaboratorRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.collaboratorRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Collaborator with ID ${id} not found`);
    }
  }
}
