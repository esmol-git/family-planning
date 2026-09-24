import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FamiliesService } from './families.service';
import { CreateFamilyDto, UpdateFamilyDto } from './dto/family.dto';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { FamilyAccessGuard } from '../common/guards/family-access.guard';

@ApiTags('families')
@ApiBearerAuth()
@Controller('families')
export class FamiliesController {
  constructor(private readonly familiesService: FamiliesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFamilyDto) {
    return this.familiesService.create(user.userId, dto);
  }

  @UseGuards(FamilyAccessGuard)
  @Get(':familyId')
  findOne(@Param('familyId') familyId: string) {
    return this.familiesService.findOne(familyId);
  }

  @UseGuards(FamilyAccessGuard)
  @Patch(':familyId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('familyId') familyId: string,
    @Body() dto: UpdateFamilyDto,
  ) {
    return this.familiesService.update(user.userId, familyId, dto);
  }

  @UseGuards(FamilyAccessGuard)
  @Get(':familyId/members')
  listMembers(@Param('familyId') familyId: string) {
    return this.familiesService.listMembers(familyId);
  }

  @UseGuards(FamilyAccessGuard)
  @Post(':familyId/members')
  createMember(
    @CurrentUser() user: AuthUser,
    @Param('familyId') familyId: string,
    @Body() dto: CreateMemberDto,
  ) {
    return this.familiesService.createMember(user.userId, familyId, dto);
  }

  @UseGuards(FamilyAccessGuard)
  @Patch(':familyId/members/:memberId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.familiesService.updateMember(user.userId, familyId, memberId, dto);
  }

  @UseGuards(FamilyAccessGuard)
  @Delete(':familyId/members/:memberId')
  deleteMember(
    @CurrentUser() user: AuthUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.familiesService.deleteMember(user.userId, familyId, memberId);
  }
}
