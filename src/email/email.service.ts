import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: Number(this.configService.get<string>('SMTP_PORT', '587')),
      secure: false,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendHistoricalLearnerCredentials(params: {
    email: string;
    firstName: string;
    lastName: string;
    temporaryPassword: string;
  }): Promise<void> {
    this.ensureSmtpConfiguration();

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL')?.trim() ??
      'https://gestionecoleodc.com';
    const fromAddress =
      this.configService.get<string>('SMTP_FROM')?.trim() ||
      this.configService.get<string>('SMTP_USER')?.trim() ||
      'no-reply@odc.local';

    await this.transporter.sendMail({
      from: {
        name: 'Suivi insertion ODC',
        address: fromAddress,
      },
      to: params.email,
      subject: 'Vos identifiants Suivi insertion',
      html: this.buildHistoricalCredentialsTemplate({
        ...params,
        frontendUrl,
      }),
      text: [
        `Bonjour ${params.firstName} ${params.lastName},`,
        '',
        'Votre compte Suivi insertion a ete cree.',
        `Email : ${params.email}`,
        `Mot de passe temporaire : ${params.temporaryPassword}`,
        `Connexion : ${frontendUrl}`,
        '',
        'Vous devrez changer ce mot de passe lors de votre premiere connexion.',
      ].join('\n'),
    });

    this.logger.log(`Identifiants historiques envoyes a ${params.email}`);
  }

  private ensureSmtpConfiguration(): void {
    const smtpUser = this.configService.get<string>('SMTP_USER')?.trim();
    const smtpPass = this.configService.get<string>('SMTP_PASS')?.trim();

    if (!smtpUser || !smtpPass) {
      this.logger.warn(
        'Envoi email ignore: SMTP_USER ou SMTP_PASS manquant dans la configuration',
      );
      throw new Error('Service email non configure');
    }
  }

  private buildHistoricalCredentialsTemplate(params: {
    email: string;
    firstName: string;
    lastName: string;
    temporaryPassword: string;
    frontendUrl: string;
  }) {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vos identifiants Suivi insertion</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#1f2937;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#f4f4f5;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:32px;text-align:center;color:#fff;">
                    <h1 style="margin:0;font-size:28px;">Suivi insertion</h1>
                    <p style="margin:8px 0 0 0;font-size:15px;opacity:0.92;">Vos identifiants ont ete crees</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <p style="margin:0 0 16px 0;">Bonjour <strong>${params.firstName} ${params.lastName}</strong>,</p>
                    <p style="margin:0 0 16px 0;line-height:1.6;">
                      Votre compte <strong>Suivi insertion</strong> a ete cree pour vous permettre de declarer votre situation professionnelle.
                    </p>
                    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:20px;margin:20px 0;">
                      <p style="margin:0 0 10px 0;"><strong>Email :</strong> ${params.email}</p>
                      <p style="margin:0;"><strong>Mot de passe temporaire :</strong> ${params.temporaryPassword}</p>
                    </div>
                    <p style="margin:0 0 20px 0;line-height:1.6;">
                      Lors de votre premiere connexion, vous devrez changer ce mot de passe.
                    </p>
                    <div style="text-align:center;margin:28px 0;">
                      <a href="${params.frontendUrl}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:bold;">
                        Se connecter
                      </a>
                    </div>
                    <p style="margin:0;color:#6b7280;font-size:13px;">
                      Cet email a ete envoye automatiquement par Suivi insertion. Merci de ne pas y repondre.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }
}
