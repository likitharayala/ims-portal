import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
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

  async sendStudentOnboardingEmail(options: {
    email: string;
    name: string;
    instituteName: string;
    temporaryPassword: string;
  }): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const loginUrl = `${frontendUrl}/login`;

    await this.send({
      to: options.email,
      subject: `Welcome to ${options.instituteName} - Your Student Portal Access`,
      html: `
        <p>Dear ${options.name},</p>
        <p>Your student account for <strong>${options.instituteName}</strong> has been successfully provisioned.</p>
        <p>You may now access the student portal using the credentials below:</p>
        <p><strong>Student Email:</strong> ${options.email}</p>
        <p><strong>Temporary Password:</strong> ${options.temporaryPassword}</p>
        <p><a href="${loginUrl}" style="background:#3b82f6;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Access Portal</a></p>
        <p>For security purposes, you will be required to reset your password during your first login.</p>
        <p><strong>Security Notice:</strong></p>
        <p>Do not share these credentials. Change your password immediately after signing in, and contact your institute admin if you face any issues.</p>
        <p>Regards,<br />${options.instituteName}<br />Student Management Platform</p>
        <p style="color:#64748b;font-size:12px;">This is an automated email. Do not reply.</p>
      `,
    });
  }

  private async send(options: { to: string; subject: string; html: string }): Promise<void> {
    try {
      const { error } = await this.resend.emails.send({
        from: 'Teachly <onboarding@resend.dev>',
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${(error as Error).message}`);
      throw error;
    }
  }
}
