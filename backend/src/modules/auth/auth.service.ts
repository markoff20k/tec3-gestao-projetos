import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { LoginDto, RegisterDto, UpdateUserDto, AuthResponseDto } from './dto/auth.dto';
import { UserNotification, UserNotificationType } from './entities/user-notification.entity';

export interface CreateNotificationInput {
  userId: string;
  type: UserNotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserNotification)
    private notificationRepository: Repository<UserNotification>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = this.userRepository.create({
      ...registerDto,
      password: hashedPassword,
      role: registerDto.role || UserRole.USER,
    });

    await this.userRepository.save(user);

    return this.generateAuthResponse(user);
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateAuthResponse(user);
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId, isActive: true } });
  }

  async findAllUsers(): Promise<User[]> {
    return this.userRepository.find({
      select: ['id', 'email', 'name', 'role', 'isActive', 'createdAt'],
    });
  }

  async updateUser(id: string, updateDto: UpdateUserDto): Promise<User> {
    await this.userRepository.update(id, updateDto);
    return this.userRepository.findOne({ where: { id } });
  }

  async createNotification(input: CreateNotificationInput): Promise<UserNotification> {
    const projectId = typeof input.metadata?.projectId === 'string' ? input.metadata.projectId : null;

    if (input.type === UserNotificationType.PROJECT_SETUP_COMPLETED && projectId) {
      const existing = await this.notificationRepository
        .createQueryBuilder('notification')
        .where('notification.userId = :userId', { userId: input.userId })
        .andWhere('notification.type = :type', { type: input.type })
        .andWhere("notification.metadata ->> 'projectId' = :projectId", { projectId })
        .getOne();

      if (existing) {
        return existing;
      }
    }

    const notification = this.notificationRepository.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link || null,
      metadata: input.metadata || null,
    });

    return this.notificationRepository.save(notification);
  }

  async getNotifications(
    userId: string,
    options?: { limit?: number; unreadOnly?: boolean },
  ): Promise<{ items: UserNotification[]; nextCursor: string | null; unreadCount: number }> {
    const limit = Math.min(Math.max(options?.limit || 12, 1), 50);
    const where = {
      userId,
      ...(options?.unreadOnly ? { isRead: false } : {}),
    };

    const [items, unreadCount] = await Promise.all([
      this.notificationRepository.find({
        where,
        order: { createdAt: 'DESC' },
        take: limit,
      }),
      this.notificationRepository.count({ where: { userId, isRead: false } }),
    ]);

    return { items, nextCursor: null, unreadCount };
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<UserNotification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notificationRepository.save(notification);
    }

    return notification;
  }

  async markAllNotificationsRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(UserNotification)
      .set({ isRead: true, readAt: () => 'CURRENT_TIMESTAMP' })
      .where('userId = :userId', { userId })
      .andWhere('isRead = false')
      .execute();

    return { updatedCount: result.affected || 0 };
  }

  private generateAuthResponse(user: User): AuthResponseDto {
    const payload = { sub: user.id, email: user.email, role: user.role };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
