import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// PrismaService and JwtService come from the global PrismaModule/TokenModule
// registered in AppModule — nothing to import here.
@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
