import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

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

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles or permissions are required, we just pass
    if (!requiredRoles && !requiredPermissions) {
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

    // Check if the user is associated with this company and has the right role/permissions
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

    const userRole = userCompany.role.name;
    const userPermissions = userCompany.role.permissions ? userCompany.role.permissions.split(',') : [];

    // ADMIN always has full access
    if (userRole === 'ADMIN' || userPermissions.includes('*')) {
      return true;
    }

    // 1. Check Roles (Backward compatibility)
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.includes(userRole);
      if (!hasRole && !requiredPermissions) {
        throw new ForbiddenException(`Requires one of the following roles: ${requiredRoles.join(', ')}`);
      }
      if (hasRole) return true;
    }

    // 2. Check Permissions (Granular RBAC)
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasPermission = requiredPermissions.some(rp => {
        // Exact match
        if (userPermissions.includes(rp)) return true;
        
        // Wildcard match (e.g. user has 'invoice:*' and requires 'invoice:read')
        const [module, action] = rp.split(':');
        return userPermissions.includes(`${module}:*`);
      });

      if (!hasPermission) {
        throw new ForbiddenException(`Insufficient permissions. Requires: ${requiredPermissions.join(' or ')}`);
      }
    }

    return true;
  }
}
