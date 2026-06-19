import { Module } from '@nestjs/common';
import { AuthInfraModule } from '../../auth/auth-infra.module';
import { PluginAuthModule } from '../../plugin/plugin-auth.module';
import { BindingController } from './binding.controller';
import { BindingService } from './binding.service';

@Module({
  imports: [AuthInfraModule, PluginAuthModule],
  controllers: [BindingController],
  providers: [BindingService],
})
export class BindingModule {}
