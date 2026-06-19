import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, CurrentUserPayload } from '../../auth/current-user.decorator';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/register')
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.authService.register({ ...dto, request });
  }

  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('auth/logout')
  logout() {
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getMe(user.id);
  }
}
