import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

// Global wrapper around JwtModule so both AuthModule (issuing tokens) and
// JwtAuthGuard (verifying them, applied globally in AppModule) share the same
// configured JwtService instead of each registering their own.
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_TOKEN_TTL') ?? '15m' },
      }),
    }),
  ],
  exports: [JwtModule],
})
export class TokenModule {}
