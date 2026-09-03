import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthService, AuthResult } from './auth.service';
import {
  EmailLoginDto,
  EmailRegisterDto,
  LogoutDto,
  PhoneOtpRequestDto,
  PhoneOtpVerifyDto,
  RefreshTokenDto,
  SocialLoginDto,
} from './dto/auth.dto';
import { TokenPair } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private meta(request: Request) {
    return {
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    };
  }

  @Public()
  @Post('phone/request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request an SMS one-time code for phone sign-in' })
  requestPhoneOtp(@Body() dto: PhoneOtpRequestDto): Promise<{ sent: true; devCode?: string }> {
    return this.authService.requestPhoneOtp(dto.phone);
  }

  @Public()
  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the SMS code and sign in / register' })
  verifyPhoneOtp(@Body() dto: PhoneOtpVerifyDto, @Req() request: Request): Promise<AuthResult> {
    return this.authService.verifyPhoneOtp(dto, this.meta(request));
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with a Google ID token' })
  googleLogin(@Body() dto: SocialLoginDto, @Req() request: Request): Promise<AuthResult> {
    return this.authService.googleLogin(dto, this.meta(request));
  }

  @Public()
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with an Apple ID token' })
  appleLogin(@Body() dto: SocialLoginDto, @Req() request: Request): Promise<AuthResult> {
    return this.authService.appleLogin(dto, this.meta(request));
  }

  @Public()
  @Post('email/register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register with email and password' })
  registerEmail(@Body() dto: EmailRegisterDto, @Req() request: Request): Promise<AuthResult> {
    return this.authService.registerEmail(dto, this.meta(request));
  }

  @Public()
  @Post('email/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  loginEmail(@Body() dto: EmailLoginDto, @Req() request: Request): Promise<AuthResult> {
    return this.authService.loginEmail(dto, this.meta(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair (rotation)' })
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken, this.meta(request));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a refresh token (sign out this device)' })
  logout(@Body() dto: LogoutDto): Promise<{ loggedOut: true }> {
    return this.authService.logout(dto.refreshToken);
  }
}
