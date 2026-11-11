import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { VaultItem } from './vault-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VaultItem])],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class ItemsModule {}
