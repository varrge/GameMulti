import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { BindingModule } from './modules/binding/binding.module';
import { BridgeModule } from './modules/bridge/bridge.module';
import { ForumModule } from './modules/forum/forum.module';
import { GameModule } from './modules/game/game.module';
import { HealthController } from './modules/health/health.controller';
import { InviteModule } from './modules/invite/invite.module';
import { AuthInfraModule } from './auth/auth-infra.module';
import { PluginAuthModule } from './plugin/plugin-auth.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthInfraModule,
    PluginAuthModule,
    AuthModule,
    InviteModule,
    GameModule,
    BindingModule,
    BridgeModule,
    ForumModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
