# Asistente de IA — reglas para agregar acciones

Guía obligatoria para quien agregue una **consulta** o una **acción** al Asistente
(`assistantController.ts`). Nació de un pedido explícito de Oscar: el asistente
debe poder hacer de todo, **pero en orden** — nunca saltándose un paso que el
sistema normal obliga.

## Principio

> El asistente es un **atajo para disparar el MISMO flujo** del sistema, nunca
> un **bypass**. Cada acción debe hacer exactamente lo que hace la pantalla
> equivalente: mismos pre-requisitos, mismas validaciones, mismos efectos
> colaterales y en el mismo orden. Ni menos (se salta un paso) ni más (inventa
> una restricción que el sistema no tiene y confunde al usuario).

Saltarse un paso no es un error cosmético: puede descontar inventario, cobrar,
o tocar un registro clínico/legal cuando no corresponde.

## Checklist antes de construir una acción nueva

1. **Encuentra el flujo real** en el sistema (el controller/endpoint que hace
   eso hoy, p.ej. `appointmentsController.create`, `ledgerController.create`,
   `evolutionsController.create`).
2. **Lista sus PRE-REQUISITOS**: qué debe existir y en qué estado
   (paciente existe; sillón activo; presupuesto del paciente y no "de alta";
   cita "agendada" antes de marcar llegada; firma del profesional; etc.).
3. **Lista sus VALIDACIONES**:
   - **Permisos — las DOS capas** (ver `moduleOn` + `resolveRequestPermissions`):
     a) perfil/usuario (`resolveRequestPermissions` → `permissionOverrides`), y
     b) plan de la clínica (`moduleOn` → `Clinica.modules` + `moduleOverrides`,
        aplica **incluso al admin**). Inventario es aparte: solo rol `admin`.
   - **Reglas de negocio** (monto > 0, estado válido, formato de correo, etc.).
4. **Lista los EFECTOS COLATERALES** que el flujo real dispara y replícalos
   TODOS: sync a federación, correo al paciente, descuento de inventario,
   movimiento de cartola, estampado de ciclo de vida (`lifecycleStamps`), etc.
5. **Patrón**: `proponer_accion` → el usuario confirma → `execute`. Los datos de
   paciente se resuelven en backend y van al FRONT, **nunca al modelo**.
6. **Prueba** (contra la clínica demo, ver `probar-asistente-saturandolo`):
   - camino feliz,
   - **cada pre-requisito rechazado** (dato faltante, estado incorrecto, fecha
     pasada, insumo sin stock…),
   - **permiso denegado** con cuenta no-admin **y** con módulo apagado,
   - que los **efectos colaterales** de verdad ocurrieron (y no de más).

## Estado actual (auditado oct-2026 — todas respetan los pasos)

| Acción | Pre-requisito clave que respeta |
|---|---|
| marcar_llegada | la cita debe estar "agendada" (no finalizada/en atención/cancelada) |
| estado_presupuesto | no si está "de alta"; estado válido (como el dropdown real) |
| registrar_pago | si va a un presupuesto, ese presupuesto es del paciente; monto > 0 |
| agendar/reagendar/cancelar | sillón activo + sin choque + fecha futura + cita existente |
| descontar_stock | solo admin; FEFO; no lote vencido; stock suficiente |
| generar_receta | permiso `pacientes` + firma del profesional + ≥1 medicamento |
| crear_paciente / editar_ficha | RUT requerido / solo tel-correo-dirección, correo válido |

## Pendiente de alto cuidado: evoluciones

Una evolución **no es solo texto**. `evolutionsController.create` exige/arrastra:
- paciente válido;
- si va ligada a un ítem de tratamiento: ese ítem debe ser del paciente y el
  plan **no estar "de alta"**;
- puede **registrar un pago** y **descontar inventario** al crearse.

Por eso, antes de dar a un profesional "dictar una evolución" por el asistente,
hay que mapear y replicar TODO ese flujo (no un atajo), con el mismo cuidado
legal que el resto (una evolución no se borra, se anula).
