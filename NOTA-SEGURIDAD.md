# Nota de seguridad — actualización de dependencias (15-10-2026)

Hola 👋 Esta nota es para dejar registro de un arreglo de seguridad en las dependencias.

## Qué se hizo
Se corrió **`npm audit fix`** (SIN `--force`) en los dos backends (este clínico y el
`portal-paciente-backend`) para parchar vulnerabilidades conocidas de dependencias.

- **Solo cambió `package-lock.json`** (versiones de dependencias transitivas, dentro de
  rangos compatibles). **No se tocó código, ni el esquema de Prisma, ni la base de datos.**

## Qué quedó corregido
- **proxy-addr (CRÍTICA)** — falsificación de IP vía IPv4-mapped IPv6. Importaba porque
  usamos `app.set('trust proxy', 1)` + rate limiting por IP en el login.
- **axios** (SSRF / inyección de cabeceras / prototype pollution) — subió a 1.20.0.
- **nodemailer** (DoS / reuso de credenciales SMTP entre tenants).
- **dompurify** (bypass del sanitizador → posible XSS guardado).

## Qué quedó SIN tocar a propósito
- La cadena **deepmerge-ts → @prisma/config → prisma** (3 "high" restantes). Arreglarlo
  exige `npm audit fix --force`, que **sube Prisma a una versión MAYOR (rompe)**. El riesgo
  real es bajo (DoS al mergear config recursiva, no alcanzable en operación normal). Dejar
  la actualización de Prisma como un cambio **intencional y probado**, no automático.

## Verificado antes de desplegar
- `tsc` compila sin errores en ambos backends.
- Todas las dependencias reales cargan (`require` OK).
- Sin cambios de base de datos.

## Cómo revertir si algo sale mal
- Restaurar `package.json` + `package-lock.json` del backup, o `git revert` del commit de
  este cambio, y `npm ci`.

## Pendientes sugeridos (NO hechos aquí)
- Agregar **`helmet`** a este backend clínico (el portal ya lo tiene).
- Cambiar la contraseña de admin `Admin123!` (débil) — decisión del equipo.

— RIDS / Claude
