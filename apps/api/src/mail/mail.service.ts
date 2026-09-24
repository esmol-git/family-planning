import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const smtp = this.config.get<string>('SMTP_URL');
    if (smtp) {
      try {
        this.transporter = nodemailer.createTransport(smtp);
      } catch (e) {
        this.logger.error(
          `Не удалось создать SMTP-транспорт: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  /** true если письма реально уходят */
  get isConfigured() {
    return !!this.transporter;
  }

  async sendPasswordReset(email: string, resetUrl: string) {
    const subject = 'Сброс пароля — Семейный календарь';
    const text = `Здравствуйте!\n\nЧтобы задать новый пароль, откройте ссылку:\n${resetUrl}\n\nЕсли вы не запрашивали сброс — просто проигнорируйте это письмо.`;
    const html = `<p>Здравствуйте!</p><p>Чтобы задать новый пароль, перейдите по ссылке:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Если вы не запрашивали сброс — просто проигнорируйте это письмо.</p>`;

    if (!this.transporter) {
      this.logger.log(`Password reset for ${email}: ${resetUrl}`);
      return { sent: false as const };
    }

    const from =
      this.config.get<string>('SMTP_FROM') ||
      this.config.get<string>('VAPID_SUBJECT')?.replace(/^mailto:/, '') ||
      'noreply@family-calendar.local';

    try {
      await this.transporter.sendMail({
        from,
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(`Password reset email sent to ${email}`);
      return { sent: true as const };
    } catch (e) {
      this.logger.error(
        `SMTP send failed for ${email}: ${e instanceof Error ? e.message : e}`,
      );
      this.logger.log(`Password reset fallback link for ${email}: ${resetUrl}`);
      return { sent: false as const };
    }
  }
}
