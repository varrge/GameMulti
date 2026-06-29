import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard';
import { CreatePluginInstallTokenDto } from './dto/create-plugin-install-token.dto';
import { CreatePluginClientDto } from './dto/create-plugin-client.dto';
import { UpdateGameServerStatusDto } from './dto/update-game-server-status.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(@Query('keyword') keyword?: string) {
    return this.adminService.listUsers(keyword);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Get('game-servers')
  listGameServers() {
    return this.adminService.listGameServers();
  }

  @Post('game-servers/:id/status')
  updateGameServerStatus(@Param('id') id: string, @Body() dto: UpdateGameServerStatusDto) {
    return this.adminService.updateGameServerStatus(id, dto.status);
  }

  @Post('plugin-clients')
  createPluginClient(@Body() dto: CreatePluginClientDto) {
    return this.adminService.createPluginClient(dto);
  }

  @Post('plugin-install-tokens')
  createPluginInstallToken(@Body() dto: CreatePluginInstallTokenDto) {
    return this.adminService.createPluginInstallToken(dto);
  }

  @Get('plugin-events')
  listPluginEvents(
    @Query('serverCode') serverCode?: string,
    @Query('eventType') eventType?: string,
    @Query('player') player?: string,
  ) {
    return this.adminService.listPluginEvents({ serverCode, eventType, player });
  }

  @Get('forum/summary')
  getForumSummary() {
    return this.adminService.getForumSummary();
  }
}
