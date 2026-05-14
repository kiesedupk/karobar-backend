import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || 'user@example.com',
        pass: process.env.SMTP_PASS || 'password',
      },
    });
  }

  async sendMail(
    to: string,
    subject: string,
    html: string,
    attachments: any[] = [],
  ) {
    try {
      const info = await this.transporter.sendMail({
        from: `"${process.env.MAIL_FROM_NAME || 'Karobar SaaS'}" <${process.env.MAIL_FROM_EMAIL || 'noreply@karobar.pk'}>`,
        to,
        subject,
        html,
        attachments,
      });
      this.logger.log(`Email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      throw error;
    }
  }

  // --- HTML Templates ---

  getInvoiceTemplate(invoice: any, company: any) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
        <div style="background-color: #003d9b; color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Invoice from ${company.name}</h1>
        </div>
        <div style="padding: 30px; color: #333;">
          <p>Dear <strong>${invoice.customer?.name}</strong>,</p>
          <p>We hope you are doing well. Please find attached the invoice <strong>${invoice.invoiceNumber}</strong> for your recent business with us.</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #eee;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; color: #666;">Invoice Number:</td>
                <td style="padding: 5px 0; text-align: right; font-weight: bold;">${invoice.invoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #666;">Due Date:</td>
                <td style="padding: 5px 0; text-align: right; font-weight: bold;">${new Date(invoice.dueDate).toLocaleDateString()}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #666;">Total Amount:</td>
                <td style="padding: 5px 0; text-align: right; font-weight: bold; font-size: 18px; color: #003d9b;">Rs ${parseFloat(invoice.totalAmount).toLocaleString()}</td>
              </tr>
            </table>
          </div>

          <p>Please make the payment before the due date to avoid any late fees.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.APP_URL}/invoices/${invoice.id}" style="background-color: #003d9b; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">View Invoice Online</a>
          </div>

          <p style="font-size: 12px; color: #999; margin-top: 40px; border-top: 1px solid #eee; pt: 20px;">
            If you have any questions, feel free to reply to this email or contact us at ${company.phone || 'our support number'}.
          </p>
        </div>
        <div style="background-color: #f3f4f6; color: #666; padding: 20px; text-align: center; font-size: 11px;">
          &copy; ${new Date().getFullYear()} ${company.name}. Powerd by Karobar SaaS.
        </div>
      </div>
    `;
  }

  getWelcomeTemplate(user: any) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
        <h2>Welcome to Karobar, ${user.name}!</h2>
        <p>We are excited to have you on board. Your account has been successfully created.</p>
        <p>You can now start managing your invoices, inventory, and banking all in one place.</p>
        <a href="${process.env.APP_URL}/dashboard" style="background-color: #003d9b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
      </div>
    `;
  }
}
