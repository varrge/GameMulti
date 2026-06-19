import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../auth/current-user.decorator';
import { AuthenticatedPluginClient, PluginClient } from '../../plugin/plugin-client.decorator';
import { PluginAuthGuard } from '../../plugin/plugin-auth.guard';
import { BindingService } from './binding.service';
import { ConfirmBindingDto } from './dto/confirm-binding.dto';
import { CreateBindingSessionDto } from './dto/create-binding-session.dto';
import { FindBindingByPairCodeDto } from './dto/find-binding-by-pair-code.dto';
import { FindBindingByTokenDto } from './dto/find-binding-by-token.dto';

@Controller()
export class BindingController {
  constructor(private readonly bindingService: BindingService) {}

  @Post('plugin/bindings/session')
  @UseGuards(PluginAuthGuard)
  createSession(
    @PluginClient() pluginClient: AuthenticatedPluginClient,
    @Body() dto: CreateBindingSessionDto,
  ) {
    return this.bindingService.createSession(pluginClient, dto);
  }

  @Get('bindings/session/by-token')
  findByToken(@Query() dto: FindBindingByTokenDto) {
    return this.bindingService.findByToken(dto.token);
  }

  @Post('bindings/session/by-pair-code')
  findByPairCode(@Body() dto: FindBindingByPairCodeDto) {
    return this.bindingService.findByPairCode(dto.pairCode);
  }

  @Post('bindings/confirm')
  @UseGuards(AuthGuard)
  confirm(@CurrentUser() user: CurrentUserPayload, @Body() dto: ConfirmBindingDto) {
    return this.bindingService.confirmBinding(user.id, dto.sessionId);
  }

  @Get('me/game-bindings')
  @UseGuards(AuthGuard)
  listMine(@CurrentUser() user: CurrentUserPayload) {
    return this.bindingService.listUserBindings(user.id);
  }
}
