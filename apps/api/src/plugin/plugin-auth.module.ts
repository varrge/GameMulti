import { Module } from '@nestjs/common';
import { PluginAuthGuard } from './plugin-auth.guard';

@Module({
  providers: [PluginAuthGuard],
  exports: [PluginAuthGuard],
})
export class PluginAuthModule {}
