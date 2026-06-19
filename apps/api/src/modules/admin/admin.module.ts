import { Module } from '@nestjs/common';
import { AuthInfraModule } from '../../auth/auth-infra.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthInfraModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
