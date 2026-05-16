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
}
