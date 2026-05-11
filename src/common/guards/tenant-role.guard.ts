import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class TenantRoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are required, we just pass
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Try to extract companyId from params, query, body or headers
    const companyId = 
      request.params.companyId || 
      request.query.companyId || 
      request.body.companyId || 
      request.headers['x-company-id'];

    if (!companyId) {
      throw new ForbiddenException('Company ID is required for this action');
    }

    // Check if the user is associated with this company and has the right role
    const userCompany = await this.prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: companyId,
        },
      },
      include: {
        role: true,
      },
    });

    if (!userCompany) {
      throw new ForbiddenException('You do not have access to this company');
    }

    const hasRole = requiredRoles.includes(userCompany.role.name);

    if (!hasRole) {
      throw new ForbiddenException(`Requires one of the following roles: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
