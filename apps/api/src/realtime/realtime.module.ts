import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FamilyGateway } from './family.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expiresIn = config.get<string>('JWT_ACCESS_EXPIRES_IN')
          || config.get<string>('JWT_EXPIRES_IN')
          || '15m';
        return {
          secret: config.getOrThrow<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: expiresIn as `${number}m`,
          },
        };
      },
    }),
  ],
  providers: [FamilyGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
