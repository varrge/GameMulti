import { Module } from '@nestjs/common';
import { AuthInfraModule } from '../../auth/auth-infra.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PluginClientGeneratorController } from './plugin-client-generator.controller';

@Module({
  imports: [AuthInfraModule],
  controllers: [AdminController, PluginClientGeneratorController],
  providers: [AdminService],
})
export class AdminModule {}
