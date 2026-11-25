/**
 * Envío de correos (recuperación de contraseña).
 * Configura en el .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (y SMTP_SECURE=true si usas SSL directo).
 * Sin SMTP_HOST el correo NO sale: el mensaje (con el código) se imprime en la consola del servidor.
 * Eso sirve para probar, pero en producción hay que configurar el SMTP.
 */
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) { /* se avisa al enviar */ }

async function enviarCorreo({ para, asunto, texto }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !nodemailer) {
    console.log(`\n[CORREO SIN CONFIGURAR${nodemailer ? '' : ' / falta instalar nodemailer'}] Para: ${para}\nAsunto: ${asunto}\n${texto}\n`);
    return { enviado: false, modo: 'consola' };
  }
  const puerto = Number(SMTP_PORT) || 587;
  const transporte = nodemailer.createTransport({
    host: SMTP_HOST,
    port: puerto,
    secure: SMTP_SECURE === 'true' || puerto === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
  await transporte.sendMail({ from: SMTP_FROM || SMTP_USER, to: para, subject: asunto, text: texto });
  return { enviado: true, modo: 'smtp' };
}

module.exports = { enviarCorreo };
