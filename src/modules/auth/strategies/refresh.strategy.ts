import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_REFRESH_SECRET ||
        'super-secret-refresh-key-change-me-in-production',
      passReqToCallback: true, // Allows us to get the refresh token string
    });
  }

  async validate(req: any, payload: any) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException();
    }

    const refreshToken = req.get('Authorization').replace('Bearer', '').trim();

    return { ...payload, refreshToken, id: payload.sub };
  }
}
