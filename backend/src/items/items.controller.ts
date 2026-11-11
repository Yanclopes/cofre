import { Body, Controller, Delete, Get, HttpCode, Ip, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/token-verifier';
import { CreateItemDto, UpdateItemDto } from './items.dto';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.items.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto, @Ip() ip: string) {
    return this.items.create(user.sub, dto.data, ip);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateItemDto,
    @Ip() ip: string,
  ) {
    return this.items.update(user.sub, id, dto.data, dto.revision, ip);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Ip() ip: string) {
    return this.items.remove(user.sub, id, ip);
  }
}
