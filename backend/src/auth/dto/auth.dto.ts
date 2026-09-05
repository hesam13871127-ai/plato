import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export class PhoneOtpRequestDto {
  @ApiProperty({ example: '+14155551234', description: 'E.164 phone number' })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'phone must be a valid E.164 number (e.g. +14155551234)' })
  phone!: string;
}

export class PhoneOtpVerifyDto {
  @ApiProperty({ example: '+14155551234' })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'phone must be a valid E.164 number' })
  phone!: string;

  @ApiProperty({ example: '482910', description: 'Numeric OTP code received by SMS' })
  @IsString()
  @Length(4, 10)
  @Matches(/^\d+$/, { message: 'code must contain digits only' })
  code!: string;

  @ApiPropertyOptional({ example: 'John', description: 'Display name for first-time sign-ups' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token previously issued by the API' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @ApiProperty({ description: 'Refresh token to revoke (its whole family stays valid)' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class EmailRegisterDto {
  @ApiProperty({ example: 'player@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ example: 'NeonRider' })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username!: string;

  @ApiProperty({ example: 'Neon Rider' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  displayName!: string;
}

export class EmailLoginDto {
  @ApiProperty({ example: 'player@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
