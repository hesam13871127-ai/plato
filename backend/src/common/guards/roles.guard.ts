import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModerationService } from '../../moderation/moderation.service';

/**
 * Route metadata declaring the minimum platform role required. Used with
 * `RolesGuard` and the `@Roles(...)` decorator.
 */
export const ROLES_KEY = 'platform_roles';
export type PlatformRole = 'player' | 'moderator' | 'admin';

import { SetMetadata } from '@nestjs/common';
export const Roles = (...roles: PlatformRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Authorises requests based on the caller's platform role (`users.role`).
 * Depends on `JwtAuthGuard` having populated `req.user`. Admins always pass;
 * moderators pass for moderator-level routes; players are denied.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moderation: ModerationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PlatformRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: { id?: string } }>();
    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException('Not authenticated.');

    const role = await this.moderation.getRole(userId);
    if (role === 'admin') return true;
    if (required.includes(role)) return true;
    throw new ForbiddenException('You do not have permission to perform this action.');
  }
}
