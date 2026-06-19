import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedPluginClient, PluginClient } from '../../plugin/plugin-client.decorator';
import { PluginAuthGuard } from '../../plugin/plugin-auth.guard';
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

  @Post('game-servers/heartbeat')
  @UseGuards(PluginAuthGuard)
  recordHeartbeat(
    @PluginClient() pluginClient: AuthenticatedPluginClient,
    @Body() dto: RecordServerHeartbeatDto,
  ) {
    return this.gameService.recordHeartbeat(pluginClient, dto);
  }
}
