import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const login = dto.login.trim().toLowerCase();
    const email = dto.email?.trim() ? dto.email.trim().toLowerCase() : null;

    const loginTaken = await this.prisma.user.findUnique({ where: { login } });
    if (loginTaken) {
      throw new ConflictException('Логин уже занят');
    }
    if (email) {
      const emailTaken = await this.prisma.user.findUnique({ where: { email } });
      if (emailTaken) {
        throw new ConflictException('Пользователь с таким email уже существует');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        login,
        email,
        name: dto.name.trim(),
        passwordHash,
      },
    });

    return this.buildAuthResponse(user.id);
  }

  async login(dto: LoginDto) {
    const identifier = dto.login.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ login: identifier }, { email: identifier }],
      },
    });
    if (!user) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    return this.buildAuthResponse(user.id);
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Сессия истекла, войдите снова');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.buildAuthResponse(stored.userId);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  /**
   * Always returns the same message (no email enumeration).
   * In non-production, includes devResetUrl when a user exists.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const generic = {
      ok: true,
      message: this.mail.isConfigured
        ? 'Если аккаунт с этим email существует, мы отправили ссылку для сброса пароля'
        : 'Если аккаунт с этим email существует, ссылка для сброса будет в логе сервера',
    };

    if (!user || !user.email) {
      return generic;
    }

    // Invalidate previous unused tokens
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const raw = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(raw);
    const hours = Number(this.config.get<string>('PASSWORD_RESET_EXPIRES_HOURS') || '2');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (Number.isFinite(hours) ? hours : 2));

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const webOrigin =
      this.config.get<string>('WEB_ORIGIN') ||
      this.config.get<string>('CORS_ORIGIN') ||
      'http://localhost:5173';
    const resetUrl = `${webOrigin.replace(/\/$/, '')}/reset-password?token=${raw}`;

    await this.mail.sendPasswordReset(user.email, resetUrl);

    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const message = this.mail.isConfigured
      ? 'Если аккаунт с этим email существует, мы отправили ссылку для сброса пароля'
      : 'Если аккаунт с этим email существует, ссылка для сброса будет в логе сервера';

    if (!isProd) {
      return { ok: true, message, devResetUrl: resetUrl };
    }
    return { ok: true, message };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.usedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Ссылка недействительна или устарела');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { ok: true, message: 'Пароль обновлён. Войдите с новым паролем.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException('Неверный текущий пароль');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Новый пароль должен отличаться от текущего');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Issue fresh session so the user stays logged in
    return this.buildAuthResponse(userId);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        login: true,
        email: true,
        name: true,
        ownedFamilies: { select: { id: true, name: true } },
        members: {
          where: { active: true },
          select: {
            id: true,
            familyId: true,
            type: true,
            relation: true,
            family: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    const familiesMap = new Map<string, { id: string; name: string }>();
    for (const f of user.ownedFamilies) {
      familiesMap.set(f.id, f);
    }
    for (const m of user.members) {
      familiesMap.set(m.family.id, m.family);
    }

    return {
      id: user.id,
      login: user.login,
      email: user.email,
      name: user.name,
      families: Array.from(familiesMap.values()),
      memberships: user.members.map((m) => ({
        familyId: m.familyId,
        memberId: m.id,
        type: m.type,
        relation: m.relation,
      })),
    };
  }

  private async buildAuthResponse(userId: string) {
    const profile = await this.me(userId);
    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    const accessToken = this.jwt.sign(
      { sub: profile.id, login: profile.login },
      { expiresIn: accessExpiresIn as `${number}m` },
    );
    const refreshToken = await this.issueRefreshToken(userId);
    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
      user: profile,
    };
  }

  private async issueRefreshToken(userId: string) {
    const raw = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(raw);
    const days = Number(this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS') || '30');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (Number.isFinite(days) ? days : 30));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    void this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    return raw;
  }

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }
}
