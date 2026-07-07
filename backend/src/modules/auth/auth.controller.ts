import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Param,
  UseGuards,
  Request,
  Put,
  Query,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, UpdateUserDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('seed')
  async seed() {
    try {
      return await this.authService.register({
        email: 'admin@empresa.com',
        password: 'admin123',
        name: 'Administrador',
        role: UserRole.OWNER,
      });
    } catch (e) {
      return { message: 'Usuario ja existe. Use: admin@empresa.com / admin123' };
    }
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return req.user;
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async getAllUsers() {
    return this.authService.findAllUsers();
  }

  @Patch('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async updateUser(@Param('id') id: string, @Body() updateDto: UpdateUserDto) {
    return this.authService.updateUser(id, updateDto);
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  async getNotifications(@Request() req, @Query() query: Record<string, string>) {
    return this.authService.getNotifications(req.user.id, {
      limit: query.limit ? Number(query.limit) : undefined,
      unreadOnly: query.unreadOnly === 'true',
    });
  }

  @Put('notifications/:id/read')
  @UseGuards(JwtAuthGuard)
  async markNotificationRead(@Request() req, @Param('id') id: string) {
    return this.authService.markNotificationRead(req.user.id, id);
  }

  @Put('notifications/read-all')
  @UseGuards(JwtAuthGuard)
  async markAllNotificationsRead(@Request() req) {
    return this.authService.markAllNotificationsRead(req.user.id);
  }
}
