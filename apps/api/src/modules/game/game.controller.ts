import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedPluginClient, PluginClient } from '../../plugin/plugin-client.decorator';
import { PluginAuthGuard } from '../../plugin/plugin-auth.guard';
import { ClaimPluginInstallationDto } from './dto/claim-plugin-installation.dto';
import { RecordPluginEventDto } from './dto/record-plugin-event.dto';
import { RecordServerHeartbeatDto } from './dto/record-server-heartbeat.dto';
import { GameService } from './game.service';

@Controller()
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post('plugin/events')
  @UseGuards(PluginAuthGuard)
  recordPluginEvent(
    @PluginClient() pluginClient: AuthenticatedPluginClient,
    @Body() dto: RecordPluginEventDto,
  ) {
    return this.gameService.recordPluginEvent(pluginClient, dto);
  }

  @Post('plugin/installations/claim')
  claimInstallation(
    @Req() request: Request,
    @Body() dto: ClaimPluginInstallationDto,
  ) {
    return this.gameService.claimInstallation(dto, this.requestIp(request));
  }

  @Post('game-servers/heartbeat')
  @UseGuards(PluginAuthGuard)
  recordHeartbeat(
    @PluginClient() pluginClient: AuthenticatedPluginClient,
    @Body() dto: RecordServerHeartbeatDto,
  ) {
    return this.gameService.recordHeartbeat(pluginClient, dto);
  }

  private requestIp(request: Request) {
    const forwarded = request.headers['x-forwarded-for'];
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
      || request.ip
      || request.socket.remoteAddress
      || null;
  }
}
