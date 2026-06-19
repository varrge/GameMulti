import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard';
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
