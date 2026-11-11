import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KeysController } from './keys.controller';
import { UserKeys } from './user-keys.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserKeys])],
  controllers: [KeysController],
})
export class KeysModule {}
