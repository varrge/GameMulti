import { Module } from '@nestjs/common';
import { BindingModule } from '../binding/binding.module';
import { BridgeAuthController } from './bridge-auth.controller';
import { BridgeAuthService } from './bridge-auth.service';
import { BridgePagesController } from './bridge-pages.controller';

@Module({
  imports: [BindingModule],
  controllers: [BridgeAuthController, BridgePagesController],
  providers: [BridgeAuthService],
  exports: [BridgeAuthService],
})
export class BridgeModule {}
