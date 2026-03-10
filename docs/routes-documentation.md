# Documentación de Rutas de la API

> **Última actualización:** 9 de Marzo de 2026
> **Versión del documento:** 2.2.0

Este documento detalla todas las rutas de la API del proyecto SAC Backend, explicando su propósito, parámetros, cuerpo de las peticiones y respuestas. Las rutas están organizadas por módulo para facilitar la navegación.

---

## Tabla de Contenidos

1. [Rutas de Usuarios (`/user`)](#1-rutas-de-usuarios)
2. [Rutas de Contribuyentes (`/taxpayer`)](#2-rutas-de-contribuyentes)
3. [Rutas de Censos (`/census`)](#3-rutas-de-censos)
4. [Rutas de Reportes (`/reports`)](#4-rutas-de-reportes)

---

## 1. Rutas de Usuarios

**Archivo fuente:** [`src/users/user-routes.ts`](src/users/user-routes.ts)

Las rutas de usuarios manejan la autenticación, creación y gestión de usuarios del sistema. Utilizan JWT para autenticación y bcrypt para el hash de contraseñas.

### 1.1 Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/user/login` | Inicia sesión de un usuario |
| POST | `/user/sign-up` | Registra un nuevo usuario (requiere ADMIN) |

#### POST `/user/login`

Inicia sesión y retorna un token JWT.

```json
// Request
{
  "personId": 12345678,
  "password": "miPassword123"
}

// Response (200 OK)
{
  "user": {
    "id": "uuid-del-usuario",
    "name": "Juan Pérez",
    "role": "FISCAL",
    "personId": 12345678,
    "email": "juan@ejemplo.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST `/user/sign-up`

Crea un nuevo usuario. Solo accesible para administradores.

```json
// Request
{
  "personId": 12345678,
  "password": "miPassword123",
  "name": "Juan Pérez",
  "role": "FISCAL"  // ADMIN, FISCAL, COORDINATOR, SUPERVISOR
}
```

---

### 1.2 Consulta de Usuarios

| Método | Endpoint | Descripción | Rol Requerido |
|--------|----------|-------------|---------------|
| GET | `/user/me` | Datos del usuario autenticado | Cualquiera |
| GET | `/user` | Lista todos los usuarios | ADMIN |
| GET | `/user/get-fiscals-for-review` | Lista fiscales para supervisión con paginación | ADMIN, COORDINATOR, SUPERVISOR |

#### GET `/user/me`

Retorna la información del usuario actualmente autenticado (basado en el token JWT).

```json
// Response (200 OK)
{
  "id": "uuid",
  "name": "Juan Pérez",
  "role": "FISCAL",
  "personId": 12345678,
  "email": "juan@ejemplo.com",
  "groupId": "uuid-del-grupo"
}
```

---

#### GET `/user/get-fiscals-for-review`

Retorna una lista paginada de fiscales (y supervisores, si el rol es ADMIN) disponibles para revisión. Incluye datos del grupo, coordinador y supervisor de cada fiscal.

**Roles permitidos:** `ADMIN`, `COORDINATOR`, `SUPERVISOR`. El rol `FISCAL` recibe `403 Forbidden`.

**Comportamiento por rol:**
| Rol | Fiscales que ve |
|-----|-----------------|
| ADMIN | Todos los fiscales y supervisores del sistema |
| COORDINATOR | Solo los fiscales de su grupo |
| SUPERVISOR | Solo los fiscales que supervisa directamente |

**Parámetros de query:**
- `page` (opcional): Número de página (default: 1)
- `limit` (opcional): Items por página (default: 50)
- `year` (opcional): Filtra fiscales que tienen contribuyentes con fecha de emisión en ese año (rango: 2020–2030)

```
/user/get-fiscals-for-review?page=1&limit=50&year=2025
```

```json
// Response (200 OK)
{
  "data": [
    {
      "id": "uuid-del-fiscal",
      "name": "Carlos López",
      "role": "FISCAL",
      "personId": 12345678,
      "filterYear": 2025,
      "group": {
        "name": "Grupo Norte",
        "coordinator": {
          "id": "uuid-coordinador",
          "name": "María García"
        }
      },
      "supervisor": {
        "name": "Pedro Martínez"
      }
    }
  ],
  "total": 20,
  "page": 1,
  "totalPages": 1,
  "limit": 50
}
```

> **Nota:** `filterYear` refleja el año usado como filtro (o `null` si no se especificó). El coordinador viene anidado dentro de `group` ya que pertenece al grupo, no directamente al fiscal.

---

### 1.3 Gestión de Usuarios

| Método | Endpoint | Descripción | Rol Requerido |
|--------|----------|-------------|---------------|
| PUT | `/user/update-by-name/:name` | Actualiza usuario por nombre | ADMIN |
| PATCH | `/user/update-password/:id` | Cambia contraseña de usuario | Usuario mismo |

#### PUT `/user/update-by-name/:name`

```json
// Request
{
  "name": "Juan Pérez",
  "personId": 12345678,
  "email": "juan.nuevo@ejemplo.com"
}
```

#### PATCH `/user/update-password/:id`

```json
// Request
{
  "password": "nuevaPasswordSegura123"
}
```

---

## 2. Rutas de Contribuyentes

**Archivo fuente:** [`src/taxpayer/taxpayer-routes.ts`](src/taxpayer/taxpayer-routes.ts)

Este es el módulo más extenso del sistema. Maneja toda la información y acciones relacionadas con los contribuyentes fiscales, incluyendo CRUD, eventos, pagos, reportes de impuestos y archivos.

### 2.1 Consulta de Contribuyentes

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/taxpayer` | Lista contribuyentes con paginación |
| GET | `/taxpayer/get-taxpayers` | Lista contribuyentes para eventos |
| GET | `/taxpayer/get-fiscal-taxpayers-for-stats/:id` | Contribuyentes de un fiscal |
| GET | `/taxpayer/:id` | Obtiene contribuyente por ID |
| GET | `/taxpayer/all/:id` | Contribuyentes de un usuario |
| GET | `/taxpayer/get-taxpayer-categories` | Lista categorías económicas |
| GET | `/taxpayer/get-parish-list` | Lista parroquias |
| GET | `/taxpayer/data/:id` | Datos adicionales de contribuyente |

#### GET `/taxpayer`

Lista contribuyentes con paginación y filtros opcionales. Además retorna conteos globales de la base de datos por tipo de contrato, útiles para el dashboard.

```
/taxpayer?page=1&limit=50&search=j-123&year=2025
```

**Parámetros de query:**
- `page` (opcional): Número de página (default: 1)
- `limit` (opcional): Items por página (default: 50)
- `search` (opcional): Búsqueda por RIF o nombre
- `year` (opcional): Filtrar por año de emisión

```json
// Response (200 OK)
{
  "data": [
    {
      "id": "uuid",
      "rif": "J-12345678-9",
      "name": "Empresa ejemplo C.A.",
      "process": "FP",
      "contract_type": "ORDINARY",
      "fase": "FASE_1",
      "user": { "id": "uuid", "name": "Fiscal Nombre" },
      "parish": { "id": "uuid", "name": "Parroquia Ejemplo" },
      "taxpayer_category": { "id": "uuid", "name": "Comercio" }
    }
  ],
  "total": 150,
  "page": 1,
  "totalPages": 3,
  "limit": 50,
  "totalSpecial": 45,
  "totalOrdinary": 105
}
```

> **Nota:** `totalSpecial` y `totalOrdinary` son conteos **globales** de toda la base de datos, independientes de los filtros `search` y `year` aplicados. Están pensados para los widgets del dashboard.

---

### 2.2 Creación de Contribuyentes

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/taxpayer` | Crea contribuyente con PDFs |
| POST | `/taxpayer/create-taxpayer` | Crea contribuyente desde datos |
| POST | `/taxpayer/create-taxpayer-category` | Crea categoría económica |

#### POST `/taxpayer`

Crea un nuevo contribuyente. Utiliza `multipart/form-data` para subir PDFs (hasta 20 archivos).

```
Content-Type: multipart/form-data

// Campos del formulario:
- providenceNum: string
- process: string (FP, AF, VDF, NA)
- name: string
- rif: string
- contract_type: string (ORDINARY, SPECIAL)
- officerName: string
- address: string
- emition_date: date
- parish: string
- category: string
- pdfs: File[] (hasta 20 PDFs)
```

```json
// Response (201 Created)
{
  "id": "uuid",
  "providenceNum": "2025-001234",
  "rif": "J-12345678-9",
  "name": "Empresa Ejemplo C.A.",
  "process": "FP",
  "status": true
}
```

---

### 2.3 Actualización de Contribuyentes

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| PUT | `/taxpayer/:id` | Actualiza contribuyente |
| PUT | `/taxpayer/update-taxpayer/:id` | Actualiza con validaciones de rol |
| PUT | `/taxpayer/update-fase/:id` | Actualiza fase del proceso |
| PUT | `/taxpayer/notify/:id` | Marca como notificado |
| PUT | `/taxpayer/update-culminated/:id` | Marca como culminado |

#### PUT `/taxpayer/update-fase/:id`

```json
// Request
{
  "fase": "FASE_2"  // FASE_1, FASE_2, FASE_3, FASE_4
}
```

---

### 2.4 Eliminación de Contribuyentes

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| DELETE | `/taxpayer/:id` | Elimina contribuyente |

---

### 2.5 Eventos Fiscales

Los eventos representan las acciones de fiscalización: multas, advertencias y compromisos de pago.

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/taxpayer/fine` | Crea una multa |
| POST | `/taxpayer/warning` | Crea una advertencia |
| POST | `/taxpayer/payment_compromise` | Crea compromiso de pago |
| GET | `/taxpayer/event/:id/:type?` | Obtiene eventos de contribuyente |
| PUT | `/taxpayer/fine/:eventId` | Actualiza multa |
| PUT | `/taxpayer/warning/:eventId` | Actualiza advertencia |
| PUT | `/taxpayer/payment_compromise/:eventId` | Actualiza compromiso |
| DELETE | `/taxpayer/event/:id` | Elimina evento (soft delete: `status=false`) |

#### Tipos de Eventos

| Tipo | Descripción | Campo amount |
|------|-------------|--------------|
| `FINE` | Multa por incumplimiento | Obligatorio |
| `WARNING` | Advertencia formal | 0 |
| `PAYMENT_COMPROMISE` | Acuerdo de pago | Obligatorio |

#### POST `/taxpayer/fine`

```json
// Request
{
  "date": "2025-02-08T00:00:00.000Z",
  "amount": 1500.50,
  "taxpayerId": "uuid-del-contribuyente",
  "description": "Multa por declaración extemporánea IVA enero 2025"
}
```

---

### 2.6 Pagos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/taxpayer/payment` | Registra un pago |
| GET | `/taxpayer/payment/:id` | Obtiene pagos de contribuyente |
| PUT | `/taxpayer/payment/:eventId` | Actualiza pago |
| DELETE | `/taxpayer/payment/:id` | Elimina pago |
| PUT | `/taxpayer/updatePayment/:id` | Actualiza estado |

#### POST `/taxpayer/payment`

```json
// Request
{
  "date": "2025-02-08T00:00:00.000Z",
  "amount": 1500.50,
  "eventId": "uuid-del-evento",
  "taxpayerId": "uuid-del-contribuyente",
  "debt": 0.00
}
```

---

### 2.7 Reportes de Impuestos

#### IVA (Impuesto al Valor Agregado)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/taxpayer/createIVA` | Crea reporte de IVA |
| GET | `/taxpayer/:id/iva-reports` | Obtiene reportes de IVA |
| PUT | `/taxpayer/updateIva/:ivaId` | Actualiza reporte |
| DELETE | `/taxpayer/delete-iva/:id` | Elimina reporte |

#### POST `/taxpayer/createIVA`

```json
// Request
{
  "taxpayerId": "uuid-del-contribuyente",
  "iva": 1200.00,
  "purchases": 5000.00,
  "sells": 8000.00,
  "excess": 300.00,
  "date": "2025-01-31",
  "paid": false
}
```

#### ISLR (Impuesto Sobre la Renta)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/taxpayer/create-islr-report` | Crea reporte de ISLR |
| GET | `/taxpayer/get-islr/:id` | Obtiene reportes de ISLR |
| PUT | `/taxpayer/update-islr/:id` | Actualiza reporte |
| DELETE | `/taxpayer/delete-islr/:id` | Elimina reporte |

#### POST `/taxpayer/create-islr-report`

```json
// Request
{
  "incomes": 50000.00,
  "costs": 30000.00,
  "expent": 5000.00,
  "emition_date": "2025-02-08",
  "taxpayerId": "uuid-del-contribuyente",
  "paid": false
}
```

---

### 2.8 Observaciones

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/taxpayer/observations` | Crea observación |
| GET | `/taxpayer/get-observations/:id` | Obtiene observaciones |
| PUT | `/taxpayer/modify-observations/:id` | Actualiza observación |
| DELETE | `/taxpayer/del-observation/:id` | Elimina observación |

#### POST `/taxpayer/observations`

```json
// Request
{
  "description": "Pendiente presentación de libros contables.",
  "date": "2025-02-08T00:00:00.000Z",
  "taxpayerId": "uuid-del-contribuyente"
}

// Response (201 Created)
{
  "id": "uuid-de-la-observacion",
  "description": "Pendiente presentación de libros contables.",
  "date": "2025-02-08T00:00:00.000Z",
  "taxpayerId": "uuid-del-contribuyente",
  "created_at": "2025-02-08T12:00:00.000Z"
}
```

#### GET `/taxpayer/get-observations/:id`

Obtiene todas las observaciones de un contribuyente. El parámetro `:id` corresponde al `taxpayerId`.

```
/taxpayer/get-observations/:id

// Ejemplo:
/taxpayer/get-observations/550e8400-e29b-41d4-a716-446655440000
```

```json
// Response (200 OK)
[
  {
    "id": "uuid-de-la-observacion-1",
    "description": "Pendiente presentación de libros contables.",
    "date": "2025-02-08T00:00:00.000Z",
    "taxpayerId": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-02-08T12:00:00.000Z"
  },
  {
    "id": "uuid-de-la-observacion-2",
    "description": "Documentación incompleta.",
    "date": "2025-02-10T00:00:00.000Z",
    "taxpayerId": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-02-10T14:30:00.000Z"
  }
]
```

#### PUT `/taxpayer/modify-observations/:id`

Actualiza la descripción de una observación existente. El parámetro `:id` corresponde al ID de la observación.

```
/taxpayer/modify-observations/:id

// Ejemplo:
/taxpayer/modify-observations/550e8400-e29b-41d4-a716-446655440001
```

```json
// Request
{
  "newDescription": "Documentación entregada y verificada."
}

// Response (200 OK)
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "description": "Documentación entregada y verificada.",
  "date": "2025-02-08T00:00:00.000Z",
  "taxpayerId": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2025-02-08T12:00:00.000Z",
  "updated_at": "2025-02-11T09:15:00.000Z"
}
```

#### DELETE `/taxpayer/del-observation/:id`

Elimina una observación. El parámetro `:id` corresponde al ID de la observación a eliminar.

```
/taxpayer/del-observation/:id

// Ejemplo:
/taxpayer/del-observation/550e8400-e29b-41d4-a716-446655440001
```

```json
// Response (200 OK)
{
  "message": "Observation deleted successfully"
}
```

---

### 2.9 Índice IVA

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/taxpayer/get-index-iva` | Obtiene el índice IVA activo |
| POST | `/taxpayer/create-index-iva` | Crea índice base de IVA |
| PUT | `/taxpayer/modify-individual-index-iva/:id` | Modifica índice de contribuyente |

```json
// GET /taxpayer/get-index-iva
// Response (200 OK)
[
  {
    "id": "uuid-del-indice",
    "contract_type": "ORDINARY",
    "base_amount": "16.000000000000000000000000000",
    "created_at": "2025-01-15T00:00:00.000Z",
    "expires_at": null,
    "updated_at": "2025-01-15T00:00:00.000Z"
  },
  {
    "id": "uuid-del-indice",
    "contract_type": "SPECIAL",
    "base_amount": "8.000000000000000000000000000",
    "created_at": "2025-01-15T00:00:00.000Z",
    "expires_at": null,
    "updated_at": "2025-01-15T00:00:00.000Z"
  }
]
```

```json
// POST /taxpayer/create-index-iva
{
  "specialAmount": 8.0,
  "ordinaryAmount": 16.0
}
```

---

### 2.10 Archivos (PDFs)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/taxpayer/repair-report/:id` | Sube acta de reparo |
| GET | `/taxpayer/download-repair-report/:key` | Descarga PDF de reparo |
| GET | `/taxpayer/download-investigation` | Descarga PDF de investigación |

---

### 2.11 Resúmenes y Estadísticas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/taxpayer/getTaxSummary/:id` | Resumen de impuestos |
| GET | `/taxpayer/event/all` | Lista todos los eventos |

---

## 3. Rutas de Censos

**Archivo fuente:** [`src/census/census-routes.ts`](src/census/census-routes.ts)

El módulo de censos maneja el registro de contribuyentes pendientes de inclusión en el sistema principal.

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/census` | Crea registro de censo |
| GET | `/census/getCensus` | Lista registros de censo |
| DELETE | `/census/delete-census/:id` | Elimina registro |

### 3.1 Estructura del Census

```json
// POST /census
{
  "number": 1001,
  "process": "FP",
  "name": "Comercial La Esperanza C.A.",
  "rif": "J-12345678-9",
  "type": "ORDINARY",
  "userId": "uuid-del-usuario",
  "address": "Av. Principal, Edificio Centro",
  "emition_date": "2025-02-08T00:00:00.000Z"
}
```

---

## 4. Rutas de Reportes

**Archivo fuente:** [`src/reports/reports-routes.ts`](src/reports/reports-routes.ts)

El módulo de reportes es el corazón de inteligencia de negocio. Proporciona KPIs, métricas de rendimiento y estadísticas para la toma de decisiones.

### 4.1 Errores y Reportes

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/reports/errors` | Reporta un error del sistema |
| GET | `/reports/debug-query` | Ruta de depuración |

#### POST `/reports/errors`

Permite reportar errores con imágenes adjuntas.

```
Content-Type: multipart/form-data

// Campos:
- images: File[] (hasta 10 imágenes)
- title: string (opcional)
- description: string (requerido)
- type: string (requerido)
- userId: string (requerido)
```

---

### 4.2 Reportes Globales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/reports/global-performance` | Rendimiento general |
| GET | `/reports/global-kpi` | KPIs organizacionales |
| GET | `/reports/global-taxpayer-performance` | Rendimiento de IVA por mes |
| GET | `/reports/get-monthly-growth` | Crecimiento mensual |
| GET | `/reports/get-taxpayers-compliance` | Tasa de cumplimiento |
| GET | `/reports/get-expected-amount` | Recaudación esperada |

**Parámetros comunes:**
```
?date=2025-02-01  // Opcional: filtra por fecha exacta (AAAA-MM-DD)
?date=2025        // Opcional: filtra por año (AAAA)
```

---

### 4.3 Reportes por Grupo

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/reports/fiscal-groups` | Información de grupos |
| GET | `/reports/group-performance` | Métricas por grupo |
| GET | `/reports/get-group-records` | Registros de grupo |

#### GET `/reports/fiscal-groups`

```
/reports/fiscal-groups?id=uuid&startDate=2025-01-01&endDate=2025-12-31
```

---

### 4.4 Rankings

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/reports/get-top-fiscals` | Top fiscales generales |
| GET | `/reports/get-top-coordinators` | Top coordinadores (rendimiento por grupo) |
| GET | `/reports/get-top-five-by-group` | Top 5 por grupo |
| GET | `/reports/get-best-supervisor-by-group` | Mejor supervisor |

#### GET `/reports/get-top-coordinators`

Retorna el ranking de coordinadores basado en el cumplimiento de sus grupos. Acepta el parámetro `date` para filtrar por año.

---

### 4.5 Reportes por Fiscal

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/reports/get-fiscal-info/:id` | Información del fiscal |
| GET | `/reports/get-fiscal-taxpayers/:id` | Contribuyentes del fiscal |
| GET | `/reports/get-fiscal-monthly-collect/:id` | Recaudación mensual |
| GET | `/reports/get-fiscal-monthly-performance/:id` | Rendimiento mensual |
| GET | `/reports/get-fiscal-compliance/:id` | Cumplimiento general |
| GET | `/reports/get-fiscal-compliance-by-process/:id` | Cumplimiento por proceso |
| GET | `/reports/get-fiscal-collect-analisis/:id` | Análisis de recaudación |

---

### 4.6 Reportes de Impuestos por Contribuyente

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/reports/individual-iva-report/:id` | Reporte IVA de contribuyente |

---

### 4.7 Historial de Eventos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/reports/fine/:id?` | Historial de multas |
| GET | `/reports/payments/:id?` | Historial de pagos |
| GET | `/reports/pending/:id?` | Pagos pendientes |

---

### 4.8 Reporte Completo

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/reports/get-complete-report` | Reporte flexible con múltiples filtros |

#### GET `/reports/get-complete-report`

```
/reports/get-complete-report?groupId=uuid&startDate=2025-01-01&endDate=2025-12-31&process=FP
```

---

## 5. Códigos de Respuesta HTTP

| Código | Significado |
|--------|-------------|
| 200 | OK - Solicitud exitosa |
| 201 | Created - Recurso creado |
| 400 | Bad Request - Datos inválidos |
| 401 | Unauthorized - No autenticado |
| 403 | Forbidden - No autorizado |
| 404 | Not Found - Recurso no encontrado |
| 500 | Internal Server Error - Error del servidor |

---

## 6. Formato de Respuestas

### Respuesta Exitosa

```json
{
  "success": true,
  "data": { ... }
}
```

### Respuesta de Error

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Descripción del error",
    "requestId": "uuid"
  }
}
```

---

## 7. Autenticación

Todas las rutas (excepto `/user/login` y `/user/sign-up`) requieren el header:

```
Authorization: Bearer <token_jwt>
```

El token se obtiene al iniciar sesión en `/user/login`.

---

## 8. Roles y Permisos

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| ADMIN | Administrador | Acceso completo |
| COORDINATOR | Coordinador de grupo | Su grupo |
| SUPERVISOR | Supervisor | Fiscales supervisados |
| FISCAL | Funcionario de campo | Sus contribuyentes |

---

*Documento actualizado el 9 de Marzo de 2026*
*Versión 2.2.0*
