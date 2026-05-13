import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

type HistoricalEmailPayload = {
  email: string;
  firstName: string;
  lastName: string;
  temporaryPassword: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private static readonly BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

  constructor(private readonly configService: ConfigService) {}

  private createTransporter() {
    const port = Number(this.configService.get<string>('SMTP_PORT', '587'));

    return nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port,
      secure: port === 465,
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 30_000,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendHistoricalLearnerCredentials(
    params: HistoricalEmailPayload,
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL')?.trim() ??
      'https://gestionecoleodc.com';
    const fromAddress =
      this.configService.get<string>('SMTP_FROM')?.trim() ||
      this.configService.get<string>('SMTP_USER')?.trim() ||
      'no-reply@odc.local';
    const fromName =
      this.configService.get<string>('MAIL_FROM_NAME')?.trim() ||
      'Suivi insertion ODC';

    const subject = 'Vos identifiants Suivi insertion';
    const html = this.buildHistoricalCredentialsTemplate({
      ...params,
      frontendUrl,
    });
    const text = [
      `Bonjour ${params.firstName} ${params.lastName},`,
      '',
      'Votre compte Suivi insertion a ete cree.',
      `Email : ${params.email}`,
      `Mot de passe temporaire : ${params.temporaryPassword}`,
      `Connexion : ${frontendUrl}`,
      '',
      'Vous devrez changer ce mot de passe lors de votre premiere connexion.',
    ].join('\n');

    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.sendEmail({
          email: params.email,
          firstName: params.firstName,
          lastName: params.lastName,
          fromAddress,
          fromName,
          subject,
          html,
          text,
        });
        this.logger.log(`Identifiants historiques envoyes a ${params.email}`);
        return;
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error ? error.message : 'Erreur SMTP inconnue';

        this.logger.warn(
          `Echec envoi email historique a ${params.email} (tentative ${attempt}/${maxAttempts}): ${message}`,
        );

        if (attempt < maxAttempts) {
          await this.delay(attempt * 2_000);
        }
      }
    }

    const finalMessage =
      lastError instanceof Error ? lastError.message : 'Erreur SMTP inconnue';

    throw new ServiceUnavailableException(
      `Impossible d'envoyer l'email pour le moment: ${finalMessage}`,
    );
  }

  private async sendEmail(params: {
    email: string;
    firstName: string;
    lastName: string;
    fromAddress: string;
    fromName: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const brevoApiKey = this.configService.get<string>('BREVO_API_KEY')?.trim();

    if (brevoApiKey) {
      await this.sendWithBrevoApi({
        apiKey: brevoApiKey,
        ...params,
      });
      return;
    }

    this.ensureSmtpConfiguration();

    const transporter = this.createTransporter();
    await transporter.sendMail({
      from: {
        name: params.fromName,
        address: params.fromAddress,
      },
      to: params.email,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
  }

  private async sendWithBrevoApi(params: {
    apiKey: string;
    email: string;
    firstName: string;
    lastName: string;
    fromAddress: string;
    fromName: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 20_000);

    try {
      const response = await fetch(EmailService.BREVO_API_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': params.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: params.fromName,
            email: params.fromAddress,
          },
          to: [
            {
              email: params.email,
              name: `${params.firstName} ${params.lastName}`.trim(),
            },
          ],
          subject: params.subject,
          htmlContent: params.html,
          textContent: params.text,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(
          `Brevo API ${response.status}: ${responseText || response.statusText}`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
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

  private async delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
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
