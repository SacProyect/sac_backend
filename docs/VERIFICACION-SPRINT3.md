# Verificación endpoints - Sprint 3

Testing manual de los endpoints de **eventos**, **pagos**, **observaciones** y **reportes de reparo** después de la modularización.

**Base URL:** `http://localhost:PORT`. Prefijo: `/taxpayer`.  
**Autenticación:** Header `Authorization: Bearer <token>`.

---

## Endpoints alineados al checklist

Todos los ítems del checklist están implementados con las rutas indicadas.

### Eventos

| Checklist | Ruta | Método | Notas |
|-----------|------|--------|--------|
| Crear evento | `POST /taxpayer/event` | POST | Body: `type` (FINE \| PAYMENT_COMPROMISE \| WARNING), `date`, `amount`, `taxpayerId`, opcional `description`, `fineEventId` (para PAYMENT_COMPROMISE). |
| Crear con validación de multa (PAYMENT_COMPROMISE) | `POST /taxpayer/event` con `type: "PAYMENT_COMPROMISE"` | POST | Incluir `fineEventId` en el body. |
| Listar eventos por contribuyente | `GET /taxpayer/events/:taxpayerId` | GET | Opcional: `?type=FINE` (o WARNING, PAYMENT_COMPROMISE). |
| Filtrar por tipo | `GET /taxpayer/events?type=FINE` | GET | Query: `type`, opcional `taxpayerId`. |
| Listar pagos (pendientes) | `GET /taxpayer/events?type=payment` | GET | Devuelve eventos con deuda pendiente de pago. |
| Actualizar evento | `PUT /taxpayer/event/:id` | PUT | Body opcional: `date`, `amount`, `description`, `type`. |
| Eliminar evento | `DELETE /taxpayer/event/:id` | DELETE | `:id` = eventId. **Soft delete**: marca `status=false`. |

### Pagos

| Checklist | Ruta | Método | Notas |
|-----------|------|--------|--------|
| Crear pago (deuda decrementa) | `POST /taxpayer/payment` | POST | Body: `date`, `amount`, `eventId`, `taxpayerId`, `debt`. |
| Actualizar pago | `PUT /taxpayer/payment/:id` | PUT | Body opcional: `date`, `amount`. |
| Cambiar estado de pago | `PUT /taxpayer/payment/status/:id` | PUT | Body: `status` (ej. `paid`, `not_paid`). **Regla**: `paid` aplica pago (decrementa deuda) si estaba `not_paid`; `not_paid` restaura deuda si estaba `paid`. |
| Soft delete de pago | `DELETE /taxpayer/payment/:id` | DELETE | |
| Listar pagos pendientes | `GET /taxpayer/pending-payments` | GET | Opcional: `GET /taxpayer/pending-payments/:id` (por contribuyente). |

### Observaciones

| Checklist | Ruta | Método | Notas |
|-----------|------|--------|--------|
| Crear observación | `POST /taxpayer/observation` | POST | Body: `description`, `date`, `taxpayerId`. |
| Listar observaciones | `GET /taxpayer/observations/:taxpayerId` | GET | |
| Actualizar observación | `PUT /taxpayer/observation/:id` | PUT | Body: `newDescription`. |
| Eliminar observación | `DELETE /taxpayer/observation/:id` | DELETE | |

### Reportes de reparo

| Checklist | Ruta | Método | Notas |
|-----------|------|--------|--------|
| Subir reporte | `POST /taxpayer/repair-report` o `POST /taxpayer/repair-report/:taxpayerId` | POST | Multipart: campo `repairReport` (PDF). Si no hay :id, enviar `taxpayerId` en el body. |
| Actualizar URL | `PUT /taxpayer/repair-report/:id` | PUT | Body: `pdf_url`. `:id` = repairReportId. |
| Eliminar reporte | `DELETE /taxpayer/repair-report/:id` | DELETE | `:id` = repairReportId. |

---

## Criterios de aceptación

- [ ] Todos los endpoints responden correctamente.
- [ ] La lógica de deuda de eventos/pagos funciona (al crear pago, la deuda del evento decrece).
- [ ] No hay errores 500 nuevos.
- [ ] Los formatos de respuesta JSON se mantienen.

---

## Cómo probar

1. Obtener un JWT (login) y usarlo en `Authorization: Bearer <token>`.
2. Tener IDs de prueba: `taxpayerId`, `eventId`, `observationId`, etc.
3. Usar `docs/sprint3-endpoints.http` (REST Client en VSCode/Cursor) o Postman/Insomnia.

Orden sugerido: eventos → pagos → observaciones → reportes de reparo.
