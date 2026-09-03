import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../config/configuration';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export interface JwtAccessPayload {
  sub: string;
  isBot: boolean;
  provider: string;
  iat?: number;
  exp?: number;
  iss?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.accessSecret', { infer: true }),
      issuer: configService.get('jwt.issuer', { infer: true }),
    });
  }

  /** Runs after signature/expiry validation; its result becomes `req.user`. */
  public validate(payload: JwtAccessPayload): AuthenticatedUser {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload.');
    }
    return {
      id: payload.sub,
      isBot: payload.isBot ?? false,
      primaryProvider: payload.provider ?? 'phone',
    };
  }
}
