import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BatchCreateInvitationsDto } from './dto/batch-create-invitations.dto';
import { ValidateInvitationDto } from './dto/validate-invitation.dto';
import { InviteService } from './invite.service';

@Controller()
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  @Post('invitations/validate')
  validate(@Body() dto: ValidateInvitationDto) {
    return this.inviteService.validateCode(dto.code);
  }

  @Get('admin/invitations')
  listInvitations() {
    return this.inviteService.listInvitations();
  }

  @Post('admin/invitations/batch-create')
  batchCreate(@Body() dto: BatchCreateInvitationsDto) {
    return this.inviteService.batchCreate(dto);
  }

  @Get('admin/invitations/:id/usages')
  listUsages(@Param('id') id: string) {
    return this.inviteService.listInvitationUsages(id);
  }
}
