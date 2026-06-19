import { Module } from '@nestjs/common';
import { AuthInfraModule } from '../../auth/auth-infra.module';
import { InviteController } from './invite.controller';
import { InviteService } from './invite.service';

@Module({
  imports: [AuthInfraModule],
  controllers: [InviteController],
  providers: [InviteService],
  exports: [InviteService],
})
export class InviteModule {}
