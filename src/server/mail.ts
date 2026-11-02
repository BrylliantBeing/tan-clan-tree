import nodemailer from 'nodemailer';

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'Reset your Tan Family Tree password',
    text: [
      'Someone asked to reset the password for your Tan Family Tree account.',
      '',
      `Open this link within one hour to choose a new password: ${resetUrl}`,
      '',
      'If this was not you, you can ignore this email.',
    ].join('\n'),
  });
}
