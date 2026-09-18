import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';

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
        // @nestjs/jwt@11's signOptions.expiresIn now types against a
        // branded template-literal union (jsonwebtoken's `StringValue`),
        // not a plain string — a config-sourced value like "15m" can't be
        // narrowed to that statically, so the cast is against the type
        // this project already owns the dependency for, not `any`.
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_TOKEN_TTL') ?? '15m' } as JwtModuleOptions['signOptions'],
      }),
    }),
  ],
  exports: [JwtModule],
})
export class TokenModule {}
