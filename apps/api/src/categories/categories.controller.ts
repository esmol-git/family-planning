import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { FamilyAccessGuard } from '../common/guards/family-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(FamilyAccessGuard)
@Controller('families/:familyId/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiQuery({ name: 'includeInactive', required: false })
  list(
    @Param('familyId') familyId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.categoriesService.list(familyId, includeInactive === 'true');
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('familyId') familyId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(user.userId, familyId, dto);
  }

  @Patch(':categoryId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('familyId') familyId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.userId, familyId, categoryId, dto);
  }

  @Delete(':categoryId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('familyId') familyId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.categoriesService.remove(user.userId, familyId, categoryId);
  }
}
