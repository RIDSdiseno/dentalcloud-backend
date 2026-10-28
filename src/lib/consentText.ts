// Texto legal del consentimiento de tratamiento de datos personales.
// PROVISORIO (v2, 28-10-2026): actualizado para referenciar la Ley N° 21.719.
// NO es el texto definitivo: debe ser revisado y aprobado por el abogado de la
// clínica antes de considerarse final.
// Al reemplazarlo, subir CONSENT_TEXT_VERSION (ej. a 'v3') para que los envíos
// futuros queden trazados con la versión correcta — no afecta los
// consentimientos ya respondidos.
export const CONSENT_TEXT_VERSION = 'v2';

export const CONSENT_LEGAL_TEXT = `
CONSENTIMIENTO PARA EL TRATAMIENTO DE DATOS PERSONALES

En cumplimiento de la Ley N° 19.628 sobre Protección de la Vida Privada y su
modificación por la Ley N° 21.719 sobre Protección de Datos Personales, solicitamos
su autorización para recopilar, almacenar y tratar sus datos personales, incluidos
datos sensibles de salud, con la finalidad exclusiva de gestionar su atención
odontológica: agendamiento de horas, tratamientos, evolución clínica, presupuestos,
pagos y comunicaciones relacionadas con su atención en nuestra clínica.

Sus datos serán tratados con estricta confidencialidad y con medidas de seguridad
adecuadas. No serán cedidos ni comunicados a terceros, salvo obligación legal o
cuando sea necesario para su propia atención de salud.

Usted podrá ejercer en cualquier momento, de forma gratuita, sus derechos de acceso,
rectificación, supresión, oposición y portabilidad de sus datos, solicitándolo a la
clínica. La conservación de su ficha clínica se rige, además, por la normativa
sanitaria aplicable sobre resguardo de la información clínica.
`.trim();
