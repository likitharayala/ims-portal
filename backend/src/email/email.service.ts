import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT'),
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

    await this.send({
      to: email,
      subject: 'Verify your Teachly account',
      html: `
        <p>Hi ${name},</p>
        <p>Welcome to Teachly! Please verify your email address to get started.</p>
        <p><a href="${verifyUrl}" style="background:#3b82f6;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Verify Email</a></p>
        <p>This link expires in 24 hours.</p>
        <p>If you did not create a Teachly account, you can safely ignore this email.</p>
      `,
    });
  }

  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    await this.send({
      to: email,
      subject: 'Reset your Teachly password',
      html: `
        <p>Hi ${name},</p>
        <p>We received a request to reset your password.</p>
        <p><a href="${resetUrl}" style="background:#3b82f6;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Reset Password</a></p>
        <p>This link expires in 30 minutes. If you did not request a password reset, you can safely ignore this email.</p>
      `,
    });
  }

  private async send(options: { to: string; subject: string; html: string }): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM'),
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${(error as Error).message}`);
      throw error;
    }
  }
}
