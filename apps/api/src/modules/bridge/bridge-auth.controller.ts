import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { BridgeAuthService } from './bridge-auth.service';

@Controller('auth/discourse')
export class BridgeAuthController {
  constructor(private readonly bridgeAuth: BridgeAuthService) {}

  @Get('start')
  start(@Query('returnTo') returnTo: string | undefined, @Res() response: Response) {
    response.redirect(302, this.bridgeAuth.createDiscourseLoginRedirect(response, returnTo));
  }

  @Get('callback')
  async callback(
    @Req() request: Request,
    @Res() response: Response,
    @Query('sso') sso?: string,
    @Query('sig') sig?: string,
  ) {
    const result = await this.bridgeAuth.consumeDiscourseCallback(request, response, { sso, sig });
    response.redirect(302, result.returnTo);
  }
}
