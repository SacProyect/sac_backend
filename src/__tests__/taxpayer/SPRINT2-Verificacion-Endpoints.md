# Verificación endpoints taxpayer — Sprint 2

Testing manual exhaustivo tras la modularización del Sprint 2. Base URL: `http://localhost:PORT/taxpayer` (reemplazar PORT por el puerto del servidor).

---

## 1. CRUD contribuyentes

| # | Método | Ruta real | Descripción | Roles a probar | Esperado |
|---|--------|-----------|-------------|----------------|----------|
| 1 | `POST` | `/` | Crear contribuyente manual (multipart: `pdfs`, `providenceNum`, `process`, `name`, `rif`, `contract_type`, `officerName`, `address`, `emition_date`, `category`, `parish`) | ADMIN, COORDINATOR, FISCAL, SUPERVISOR | 201 creado o 400 validación; con AF debe enviar email |
| 2 | `POST` | `/create-taxpayer` | Crear desde Excel (body JSON: mismos campos sin `pdfs`) | ADMIN, COORDINATOR, FISCAL, SUPERVISOR | 201 o 400 |
| 3 | `GET` | `/:id` | Obtener contribuyente por ID | Cualquiera autenticado | 200 + JSON (user, parish, taxpayer_category, RepairReports, investigation_pdfs, observations) |
| 4 | `GET` | `/get-taxpayers` | Listar todos (query: `page`, `limit`, `year`, `search`) | Cualquiera autenticado | 200 + `{ data, total, page, totalPages, limit }` |
| 5 | `GET` | `/all/:id` | Listar por usuario (`:id` = userId) | Cualquiera autenticado | 200 + array |
| 6 | `PUT` | `/:id` | Actualizar contribuyente (body: `name`, `rif`, `providenceNum`, `process`, `contractType`, `officerId`, etc.) | ADMIN todo; FISCAL/SUPERVISOR solo con permisos (officer/supervisor/grupo) | 200 o 403 sin permiso |
| 7 | `DELETE` | `/:id` | Eliminar contribuyente | Cualquiera autenticado (revisar permisos en controller) | 200 o 403/404 |

**Nota:** La ruta "GET /taxpayer" del checklist se corresponde con **GET /taxpayer/get-taxpayers**. La ruta "GET /taxpayer/user/:userId" es **GET /taxpayer/all/:id** (el `id` es el userId).

---

## 2. Estado del contribuyente

| # | Método | Ruta real | Descripción | Verificación |
|---|--------|-----------|-------------|--------------|
| 8 | `PUT` | `/update-fase/:id` | Cambiar fase. Body: `{ "fase": "FASE_2" }` | 200; verificar envío de email (Resend configurado) |
| 9 | `PUT` | `/update-culminated/:id` | Marcar como culminado. Body: `{ "culminated": true }` | 200; FISCAL solo si es officer/supervisor/miembro grupo |
| 10 | `PUT` | `/notify/:id` | Notificar contribuyente | 200; verificar email a coordinador/fiscal |

---

## 3. Queries complejas

| # | Método | Ruta real | Descripción | Esperado |
|---|--------|-----------|-------------|----------|
| 11 | `GET` | `/get-fiscal-taxpayers-for-stats/:id` | Estadísticas del fiscal (`:id` = userId) | 200 + JSON |
| 12 | `GET` | `/get-taxpayers-for-events` | Contribuyentes con eventos (por rol del usuario autenticado). Query: `page`, `limit`, `search` | 200; comportamiento distinto por ADMIN/COORDINATOR/SUPERVISOR/FISCAL |
| 13 | `GET` | `/data/:id` | Datos completos del contribuyente (`:id` = taxpayerId) | 200 + JSON |
| 14 | `GET` | `/getTaxSummary/:id` | Resumen IVA (`:id` = taxpayerId) | 200 + JSON |

---

## 4. Método de testing recomendado

1. **Postman / Insomnia:** Crear colección con variable `baseUrl = http://localhost:PORT/taxpayer` y `token` (JWT).
2. **Headers:** `Authorization: Bearer {{token}}`, `Content-Type: application/json` (o multipart en POST `/`).
3. **Roles:** Probar cada endpoint con tokens de ADMIN, COORDINATOR, SUPERVISOR y FISCAL (generar JWTs con `type` y `user` según tu auth).
4. **Respuestas:** Confirmar que el status code y la estructura JSON coinciden con el comportamiento pre-refactor (sin 500 nuevos en flujos válidos).
5. **Logs:** Revisar consola del servidor para errores no capturados.

---

## 5. Criterios de aceptación

- [ ] Todos los endpoints responden con el mismo status code que antes (200, 201, 400, 403, 404 según caso).
- [ ] Los JSON de respuesta mantienen la misma estructura (sin cambios no documentados).
- [ ] No aparecen errores 500 en flujos que antes funcionaban.
- [ ] Permisos por rol: FISCAL recibe 403 donde corresponda (ej. editar contribuyente ajeno, culminar ajeno); ADMIN/COORDINATOR/SUPERVISOR según reglas actuales.

---

## 6. Ejecución de tests automáticos (regresión)

La suite de verificación existente cubre los mismos endpoints con mocks:

```bash
npm test -- src/__tests__/taxpayer/taxpayer-endpoints-verification.test.ts
```

- **58 tests** que comprueban códigos HTTP esperados y permisos (403 FISCAL en endpoints restringidos).
- No sustituye el testing manual para formato exacto de JSON ni envío real de emails, pero confirma que las rutas y la autorización siguen funcionando tras el refactor.

**Última ejecución:** `npm test -- src/__tests__/taxpayer/taxpayer-endpoints-verification.test.ts` — todos los tests pasan (regresión Sprint 2 OK).
