import nodemailer from 'nodemailer';
import { logInfo, logError } from '../logger';

const FROM_NAME = process.env.SMTP_FROM || process.env.SMTP_FROM_NAME || 'BuildCorp ERP';

/**
 * Create a Nodemailer transport using SMTP settings.
 * Reading env vars at call-time ensures production serverless environment variables are loaded.
 */
function createTransport() {
  const user = (process.env.SMTP_USER || process.env.SMTP_USERNAME)?.trim();
  const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD)?.trim();
  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;

  if (!user || !pass) {
    throw new Error('SMTP credentials not configured. Set SMTP_USER (or SMTP_USERNAME) and SMTP_PASSWORD in environment variables.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // SSL for 465, STARTTLS for 587
    auth: { user, pass },
    connectionTimeout: 10000,  // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * Send an OTP email to the specified address.
 * @param to  Recipient email address
 * @param otp 6-digit OTP code
 */
export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const transporter = createTransport();
  const smtpUser = (process.env.SMTP_USER || process.env.SMTP_USERNAME)?.trim() || '';

  const mailOptions = {
    from: `"${FROM_NAME}" <${smtpUser}>`,
    to,
    subject: 'Your BuildCorp Login Code',
    text: `Your verification code is: ${otp}\n\nIt will expire in ${process.env.OTP_EXPIRES_MIN || '5'} minutes.\n\nIf you did not request this code, please ignore this email.\n\n— BuildCorp ERP`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9f9f9; border-radius: 8px;">
        <h2 style="color: #000; margin-bottom: 8px;">BuildCorp ERP</h2>
        <p style="color: #444; margin-bottom: 24px;">Your one-time login code is:</p>
        <div style="background: #000; color: #fff; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; border-radius: 6px;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 13px; margin-top: 20px;">
          This code expires in <strong>${process.env.OTP_EXPIRES_MIN || '5'} minutes</strong>. Do not share it with anyone.
        </p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
        <p style="color: #999; font-size: 12px;">If you did not request this code, you can safely ignore this email.</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logInfo('otp_email_sent', { to, messageId: info.messageId });
  } catch (err) {
    logError('otp_email_error', { to, error: (err as Error).message });
    throw err;
  }
}
