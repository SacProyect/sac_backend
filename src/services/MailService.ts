import nodemailer from "nodemailer";
import logger from "../utils/logger";

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});

export class MailService {
    static async sendResetPasswordEmail(email: string, token: string): Promise<void> {
        if (!SMTP_USER || !SMTP_PASS) {
            logger.warn("SMTP_USER o SMTP_PASS no están configurados. Se omite envío de reset password.");
            return;
        }

        const resetUrl = `${process.env.APP_BASE_URL || "https://sac-app.com"}/reset-password?token=${encodeURIComponent(
            token,
        )}`;

        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>Restablecimiento de Contraseña - SAC</title>
  <style>
    .container { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; }
    .header { background-color: #1a73e8; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 30px; line-height: 1.6; color: #333; }
    .button { display: inline-block; padding: 12px 25px; background-color: #1a73e8; color: white !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
    .footer { font-size: 12px; color: #777; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Sistema de Gestión SAC</h2>
    </div>
    <div class="content">
      <h3>Restablecimiento de Contraseña</h3>
      <p>Hola,</p>
      <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en el sistema SAC.</p>
      <p>Para continuar con el proceso, haz clic en el siguiente botón:</p>
      
      <div style="text-align: center;">
        <a href="${resetUrl}" class="button">Restablecer mi contraseña</a>
      </div>
      
      <p>Este enlace es de uso único y <strong>expirará en 60 minutos</strong> por motivos de seguridad.</p>
      <p>Si no solicitaste este cambio, puedes ignorar este correo de forma segura; tu contraseña actual no se verá afectada.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} SAC - Control Administrativo. Todos los derechos reservados.</p>
      <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
    </div>
  </div>
</body>
</html>
        `;

        try {
            await transport.sendMail({
                from: SMTP_USER,
                to: email,
                subject: "Restablecer contraseña - SAC",
                html,
            });
        } catch (error: any) {
            logger.error("Error enviando email de reset password", {
                email,
                message: error?.message,
                stack: error?.stack,
            });
            throw error;
        }
    }
}

