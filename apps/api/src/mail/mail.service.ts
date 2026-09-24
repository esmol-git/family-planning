import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordReset(email: string, resetUrl: string) {
    // SMTP later via SMTP_URL; for now log so local/dev works without mail infra
    this.logger.log(`Password reset for ${email}: ${resetUrl}`);
    const smtp = this.config.get<string>('SMTP_URL');
    if (smtp) {
      this.logger.warn('SMTP_URL задан, но отправка ещё не подключена — ссылка в логе выше');
    }
  }
}
