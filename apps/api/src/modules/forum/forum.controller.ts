import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../auth/current-user.decorator';
import { ForumService } from './forum.service';

@Controller()
export class ForumController {
  constructor(private readonly forumService: ForumService) {}

  @Get('forum/entry')
  @UseGuards(AuthGuard)
  entry(@CurrentUser() user: CurrentUserPayload) {
    return this.forumService.getEntry(user.id);
  }

  @Get('forum/sso/start')
  @UseGuards(AuthGuard)
  start(
    @CurrentUser() user: CurrentUserPayload,
    @Req() request: Request,
    @Query('returnPath') returnPath?: string,
  ) {
    return this.forumService.startSso({
      userId: user.id,
      returnPath,
      request,
    });
  }

  @Get('forum/sso/callback')
  callback(@Query('sso') sso?: string, @Query('sig') sig?: string) {
    return this.forumService.consumeCallback({ sso, sig });
  }

  @Get('me/forum-account')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.forumService.getUserForumAccount(user.id);
  }
}
