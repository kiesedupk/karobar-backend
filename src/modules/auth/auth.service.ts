import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: any) {
    const { firstName, lastName, email, password, companyName } = registerDto;

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new UnauthorizedException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create everything in a transaction
    const user = await this.prisma.$transaction(async (tx) => {
      // 1. Create User
      const newUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          password: hashedPassword,
        },
      });

      // 2. Create Company
      const company = await tx.company.create({
        data: {
          name: companyName,
          currency: 'PKR',
        },
      });

      // 3. Create Default Roles
      const adminRole = await tx.role.create({
        data: {
          companyId: company.id,
          name: 'ADMIN',
          description: 'Administrator with full system privileges',
          permissions: '*',
        },
      });

      await tx.role.create({
        data: {
          companyId: company.id,
          name: 'ACCOUNTANT',
          description: 'Accountant with financial entry and reports access',
          permissions: 'accounts:*,journal:*,reports:*,customers:*,vendors:*,invoices:*',
        },
      });

      await tx.role.create({
        data: {
          companyId: company.id,
          name: 'MANAGER',
          description: 'Manager with dashboard and financial view privileges',
          permissions: 'dashboard:*,reports:*,customers:read,vendors:read,invoices:read',
        },
      });

      await tx.role.create({
        data: {
          companyId: company.id,
          name: 'CASHIER',
          description: 'Cashier with sales invoicing and customer management access',
          permissions: 'invoices:create,invoices:read,customers:create,customers:read,pos:*',
        },
      });

      // 4. Link User to Company as ADMIN
      await tx.userCompany.create({
        data: {
          userId: newUser.id,
          companyId: company.id,
          roleId: adminRole.id,
        },
      });

      return newUser;
    });

    // Auto-login after registration
    return this.login({ email, password });
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        companies: {
          include: {
            company: true,
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const payload = { sub: user.id, email: user.email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret:
          process.env.JWT_REFRESH_SECRET ||
          'super-secret-refresh-key-change-me-in-production',
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
      }),
    ]);

    // Enrich companies with subscription status warnings
    const companiesWithStatus = user.companies.map((c) => {
      const company = c.company as any;
      let subscriptionWarning: string | null = null;

      if (company.subscriptionStatus === 'SUSPENDED') {
        subscriptionWarning =
          company.suspendedReason ||
          'آپ کا اکاؤنٹ معطل ہے۔ براہ کرم ہم سے رابطہ کریں یا پیڈ پلان حاصل کریں۔';
      } else if (company.subscriptionStatus === 'EXPIRED') {
        subscriptionWarning =
          'آپ کا ٹرائل ختم ہو گیا ہے۔ سروس جاری رکھنے کے لیے پیڈ پلان خریدیں۔';
      } else if (company.plan === 'TRIAL' && company.trialEndsAt) {
        const daysLeft = Math.ceil(
          (new Date(company.trialEndsAt).getTime() - Date.now()) / 86400000,
        );
        if (daysLeft <= 7 && daysLeft > 0) {
          subscriptionWarning = `آپ کا ٹرائل ${daysLeft} دنوں میں ختم ہو جائے گا۔`;
        } else if (daysLeft <= 0) {
          subscriptionWarning = 'آپ کا ٹرائل ختم ہو گیا ہے۔ پیڈ پلان خریدیں۔';
        }
      }

      return {
        companyId: company.id,
        companyName: company.name,
        role: c.role.name,
        permissions: c.role.permissions ? c.role.permissions.split(',') : [],
        plan: company.plan,
        subscriptionStatus: company.subscriptionStatus,
        trialEndsAt: company.trialEndsAt,
        subscriptionWarning,
      };
    });

    // Log this login
    try {
      await this.prisma.activityLog.create({
        data: {
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
          description: `${user.firstName} ${user.lastName || ''} (${user.email}) لاگن ہوا`,
          performedBy: user.id,
        },
      });
    } catch { /* don't block login if logging fails */ }

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isSuperAdmin: (user as any).isSuperAdmin ?? false,
        companies: companiesWithStatus,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }


  async refreshToken(userId: string, email: string) {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret:
          process.env.JWT_REFRESH_SECRET ||
          'super-secret-refresh-key-change-me-in-production',
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
      }),
    ]);

    return {
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) throw new UnauthorizedException('موجودہ پاسورڈ غلط ہے');

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return { message: 'پاسورڈ کامیابی سے تبدیل ہو گیا' };
  }
}
