import { Module } from '@nestjs/common';
import { AuthInfraModule } from '../../auth/auth-infra.module';
import { InviteModule } from '../invite/invite.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [AuthInfraModule, InviteModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
