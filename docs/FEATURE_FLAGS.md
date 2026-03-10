# Feature Flags del Backend SAC

## 1. Introducción

Los **Feature Flags** (Banderas de Funcionalidades) son una técnica de desarrollo de software que permite habilitar o deshabilitar funcionalidades específicas sin necesidad de realizar un nuevo deployment. Este documento describe todos los feature flags implementados en el proyecto SAC Backend, su propósito, y las decisiones arquitectónicas que los sustentan.

### 1.1 Propósito de los Feature Flags

Los feature flags en este proyecto se utilizan para:

1. **Rollout Gradual**: Activar nuevas funcionalidades progresivamente
2. **Rollback Rápido**: Desactivar funcionalidades problemáticas sin deployment
3. **Testing en Producción**: Probar nuevas funcionalidades con tráfico real
4. **Transiciones Migratorias**: Mantener compatibilidad hacia atrás durante refactorizaciones
5. **Desarrollo Iterativo**: Entregar valor en incrementos pequeños

### 1.2 Cómo Configurar los Feature Flags

Los feature flags se configuran mediante **variables de entorno** en el archivo `.env`:

```bash
# Activar un feature flag
FF_NOMBRE_DEL_FLAG=true

# Desactivar (valor por defecto)
FF_NOMBRE_DEL_FLAG=false
```

O mediante el Panel de Control de **Render** en producción (Environment Variables):

1. Ve a tu Web Service en Render
2. Pestaña **Environment**
3. Añade los Feature Flags como variables de entorno:
   - Key: `FF_NEW_ERROR_HIERARCHY`, Value: `true`
   - Key: `FF_STRATEGY_PATTERN`, Value: `true`
4. Guarda los cambios (Render reiniciará el servicio automáticamente)


### 1.3 API de Feature Flags

El módulo [`features-flags.ts`](src/config/features-flags.ts) proporciona dos funciones principales:

```typescript
import { featureFlags } from './config/features-flags';

// Verificar si un flag está activo
const isActive = featureFlags.isEnabled('FF_NEW_ERROR_HIERARCHY');

// Verificar si un flag está activo para un rol específico
const hasAccess = featureFlags.isEnabledForRole('FF_KPI_SERVICE', userRole, ['ADMIN', 'SUPERVISOR']);
```

---

## 2. Feature Flags del Nucleo (Fase 1)

Estos flags controlan funcionalidades fundamentales del sistema que fueron implementadas en la primera fase de refactorización.

### 2.1 FF_NEW_ERROR_HIERARCHY

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 1.1 |
| **Propósito** | Habilitar la nueva jerarquía de errores basada en `BaseError` |

#### Descripción

Este flag controla si el sistema utiliza la nueva jerarquía de errores o los errores tradicionales de JavaScript.

**Cuando está `false` (comportamiento legacy)**:
```typescript
// Lanza errores simples
throw new Error('Usuario no encontrado');
throw new Error('Las credenciales no son correctas');
```

**Cuando está `true` (nueva implementación)**:
```typescript
// Lanza errores tipados con códigos HTTP correctos
throw new NotFoundError('Usuario no encontrado', { personId });
throw new UnauthorizedError('Las credenciales no son correctas.');
throw new BadRequestError('Contraseña debe ser mínimo de 8 caracteres');
```

#### Beneficios

- **Códigos HTTP correctos**: Los errores automáticamente tienen el código de estado apropiado
- **Mensajes estructurados**: Permiteadjuntar detalles adicionales
- **Manejo centralizado**: El middleware de errores sabe cómo handlearlos

#### Ubicaciones donde se usa

- [`src/users/user-services.ts`](src/users/user-services.ts) - Múltiples puntos de validación
- [`src/core/errors/`](src/core/errors/) - Definición de errores

#### Recomendación

Mantener `false` en producción hasta que todos los servicios implementen la nueva jerarquía.

---

### 2.2 FF_ZOD_ENV_VALIDATION

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 1.2 |
| **Propósito** | Validar variables de entorno con Zod de forma obligatoria |

#### Descripción

Controla si la validación de variables de entorno es **obligatoria** o **solo emitirá advertencias**.

**Cuando está `false`**:
```typescript
// Solo emite warnings en consola
console.error('❌ Error de validación en variables de entorno:');
// El servidor continúa arrancando con valores por defecto
```

**Cuando está `true`**:
```typescript
// El proceso se cierra si hay errores de validación
if (!parsed.success) {
  process.exit(1); // Fatal error
}
```

#### Beneficios

- **Seguridad**: Previenearranque con configuración incorrecta
- **Feedback claro**: Mensajes de error específicos sobre qué variable falta
- **Prevención de errores**: Detecta problemas antes de que afecten a producción

#### Ubicaciones donde se usa

- [`src/config/env-config.ts:87`](src/config/env-config.ts:87) - Lógica de validación

#### Recomendación

Activar (`true`) en **staging** y **production** para máxima seguridad.

---

### 2.3 FF_BIGINT_MIDDLEWARE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 1.3 |
| **Propósito** | Habilitar el serializador de BigInt en respuestas JSON |

#### Descripción

MySQL/Prisma retorna valores `BigInt` para ciertos campos (como `providenceNum`), pero JavaScript no puede serializarlos automáticamente en JSON.

**Cuando está `false`**:
```json
// Error: Do not know how to serialize a BigInt
{
  "providenceNum": 12345678901234567890
}
```

**Cuando está `true`**:
```json
// Serializa BigInt como string
{
  "providenceNum": "12345678901234567890"
}
```

#### Implementación

El middleware está implementado en [`src/utils/bigint-serializer.ts`](src/utils/bigint-serializer.ts) y se aplica en [`src/app.ts:120`](src/app.ts:120):

```typescript
// Serialización segura de BigInt
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    return originalJson(serializeForJson(body));
  };
  next();
});
```

#### Recomendación

Activar (`true`) en todos los entornos ya que es necesario para el funcionamiento correcto del API.

---

### 2.4 FF_DI_CONTAINER

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 1.4 |
| **Propósito** | Habilitar el contenedor de inyección de dependencias con tsyringe |

#### Descripción

Controla si el sistema utiliza inyección de dependencias formalizada con **tsyringe**.

**Cuando está `false`**:
```typescript
// Inyección manual (legacy)
const service = new TaxpayerService();
```

**Cuando está `true`**:
```typescript
// Inyección con tsyringe
@injectable()
export class TaxpayerController {
  constructor(
    @inject(TaxpayerService) private taxpayerService: TaxpayerService
  ) {}
}
```

#### Beneficios

- **Testabilidad**: Facilita hacer mocks de dependencias
- **Código limpio**: Elimina código repetitivo de instanciación
- **Ciclo de vida controlado**: Manejo de singletons y transients

#### Ubicaciones donde se usa

- [`src/utils/container.ts`](src/utils/container.ts) - Configuración del contenedor
- [`src/app.ts:22`](src/app.ts:22) - Inicialización

#### Recomendación

Activar (`true`) ya que es la forma recomendada de desarrollar nuevos servicios.

---

## 3. Feature Flags de Contribuyentes (Fase 2-4)

Estos flags controlan funcionalidades relacionadas con el módulo de contribuyentes.

### 3.1 FF_TAXPAYER_DTOS

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 2.2 |
| **Propósito** | Habilitar el uso de DTOs (Data Transfer Objects) para contribuyentes |

#### Descripción

Los DTOs proporcionan una capa de validación y transformación de datos de entrada.

**Cuando está `false`**:
```typescript
// Uso directo de tipos de Prisma
async createTaxpayer(data: any) { ... }
```

**Cuando está `true`**:
```typescript
// Uso de DTOs validados
import { CreateTaxpayerDto } from './dto/taxpayer-dto';

async createTaxpayer(@Body() dto: CreateTaxpayerDto) { ... }
```

#### Ubicaciones donde se usa

- [`src/taxpayer/dto/`](src/taxpayer/dto/) - Definición de DTOs

#### Recomendación

Activar (`true`) para nuevos desarrollos que requieran validación de entrada.

---

### 3.2 FF_NEW_TAXPAYER_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 3.2 |
| **Propósito** | Habilitar el servicio de contribuyentes refactorizado |

#### Descripción

Este flag controla si se usa el servicio de contribuyentes原来的 (legacy) o el nuevo servicio modular.

**Cuando está `false`**:
```typescript
// Servicio legacy monolítico
import { TaxpayerService } from './TaxpayerService';
```

**Cuando está `true`**:
```typescript
// Nuevos servicios modulares
import { TaxpayerCrudService, EventService } from './services';
```

#### Recomendación

Mantener `false` hasta que todos los consumidores migren a los nuevos servicios.

---

### 3.3 FF_NEW_TAXPAYER_REPOSITORY

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 4.1 |
| **Propósito** | Habilitar el patrón Repository con interfaz para contribuyentes |

#### Descripción

Implementa el patrón Repository que permite abstraer el acceso a datos.

**Cuando está `false`**:
```typescript
// Acceso directo a Prisma
const taxpayer = await db.taxpayer.findUnique({ where: { id } });
```

**Cuando está `true`**:
```typescript
// Acceso via repositorio
const taxpayer = await taxpayerRepository.findById(id);
```

#### Beneficios

- **Testabilidad**: Permite hacer mocks del repositorio
- **Abstracción**: La lógica de negocio no conoce Prisma
- **Flexibilidad**: Fácil cambiar la implementación de datos

#### Ubicaciones donde se usa

- [`src/taxpayer/interfaces/ITaxpayerRepository.ts`](src/taxpayer/interfaces/ITaxpayerRepository.ts)
- [`src/taxpayer/repository/taxpayer-repository.ts`](src/taxpayer/repository/taxpayer-repository.ts)

#### Recomendación

Activar (`true`) ya que es la arquitectura recomendada.

---

### 3.4 FF_STRATEGY_PATTERN

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 4.2 |
| **Propósito** | Habilitar el patrón Strategy para control de acceso basado en roles |

#### Descripción

Implementa el Control de Acceso Basado en Roles (RBAC) usando el Patrón Strategy, permitiendo que cada rol defina sus propias reglas de visibilidad y permisos.

**Cuando está `false`**:
```typescript
// Lógica condicional en servicios
if (user.role === 'ADMIN') {
  // ver todos
} else if (user.role === 'FISCAL') {
  // ver solo los propios
}
```

**Cuando está `true`**:
```typescript
// Strategy pattern
const strategy = getRoleStrategy(user.role);
const where = await strategy.getTaxpayerVisibilityWhere(db, user.id);
```

#### Estrategias Implementadas

| Rol | Estrategia | Comportamiento |
|-----|------------|----------------|
| `ADMIN` | `AdminStrategy` | Acceso completo a todos los contribuyentes |
| `FISCAL` | `FiscalStrategy` | Solo contribuyentes asignados |
| `COORDINATOR` | `CoordinatorStrategy` | Contribuyentes de su grupo de fiscales |
| `SUPERVISOR` | `SupervisorStrategy` | Contribuyentes de fiscales supervisados |

#### Ubicaciones donde se usa

- [`src/users/role-strategies/`](src/users/role-strategies/) - Estrategias
- [`src/users/role-strategies/types.ts`](src/users/role-strategies/types.ts) - Interfaz

#### Recomendación

Activar (`true`) ya que proporciona mejor mantenibilidad y seguridad.

---

## 4. Feature Flags de Servicios Refactorizados (Fase 5)

Estos flags controlan servicios específicos que fueron refactorizados para seguir el principio de responsabilidad única (SRP).

### 4.1 FF_TAXPAYER_CRUD_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de operaciones CRUD de contribuyentes |

#### Descripción

El `TaxpayerCrudService` maneja todas las operaciones Create, Read, Update, Delete de contribuyentes.

**Servicios incluidos**:
- `create()` - Crear contribuyente
- `update()` - Actualizar contribuyente
- `delete()` - Eliminar contribuyente
- `getAll()` - Listar contribuyentes con paginación
- `getById()` - Obtener contribuyente por ID
- `getByUserId()` - Obtener contribuyentes de un usuario
- `getMyCurrentYearTaxpayers()` - Contribuyentes del año actual

#### Ubicaciones donde se usa

- [`src/taxpayer/services/taxpayer-crud.service.ts`](src/taxpayer/services/taxpayer-crud.service.ts)

---

### 4.2 FF_EVENT_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de eventos fiscales |

#### Descripción

El `EventService` maneja la creación y gestión de eventos fiscales (multas, advertencias, compromisos de pago).

**Funcionalidades**:
- `create()` - Crear evento (FINE | WARNING | PAYMENT_COMPROMISE)
- `update()` - Actualizar evento existente (spread del `data`)
- `delete()` - Eliminar evento (**soft delete**: `status=false`)
- `getEventsbyTaxpayer()` - Obtener eventos/pagos por contribuyente y/o tipo (respuesta unificada)
- `getPendingPayments()` - Obtener pagos pendientes (eventos sin pago asociado)

**Reglas de negocio relevantes**:
- **`PAYMENT_COMPROMISE`**: exige `fineEventId` y valida que `amount <= debt` del evento de multa referenciado (si no, lanza `BadRequestError`).
- **`expires_at`**: si no viene, se calcula automáticamente como \(date + 15\) días.

#### Ubicaciones donde se usa

- [`src/taxpayer/services/event.service.ts`](src/taxpayer/services/event.service.ts)

---

### 4.3 FF_PAYMENT_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de pagos |

#### Descripción

El `PaymentService` gestiona los pagos realizados por los contribuyentes.

**Funcionalidades**:
- `create()` - Registrar pago (**transaccional**: crea pago + decrementa `event.debt`)
- `update()` - Cambiar estado de pago de multa (`paid`/`not_paid`) (**transaccional**: restaura/aplica deuda según transición)
- `delete()` - Eliminar pago (**soft delete**: `status=false`, transaccional: restaura deuda)

---

### 4.4 FF_IVA_REPORT_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de reportes de IVA |

#### Descripción

El `IvaReportService` maneja la generación y gestión de reportes de Impuesto al Valor Agregado.

---

### 4.5 FF_ISLR_REPORT_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de reportes de ISLR |

#### Descripción

El `IslrReportService` maneja la generación y gestión de reportes de Impuesto Sobre la Renta.

---

### 4.6 FF_INDEX_IVA_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de índices IVA |

#### Descripción

El `IndexIvaService` gestiona los índices base de IVA para contribuyentes.

---

### 4.7 FF_NOTIFICATION_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de notificaciones |

#### Descripción

El `NotificationService` maneja el envío de notificaciones a contribuyentes (emails, alertas).

---

### 4.8 FF_PDF_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de PDFs |

#### Descripción

El `PdfService` gestiona la generación y almacenamiento de documentos PDF (actas de reparo, investigaciones).

---

### 4.9 FF_OBSERVATION_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de observaciones |

#### Descripción

El `ObservationService` maneja las observaciones realizadas a los contribuyentes.

---

### 4.10 FF_KPI_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de KPIs |

#### Descripción

El `KpiService` genera indicadores clave de rendimiento para fiscales y administradores.

---

### 4.11 FF_PERFORMANCE_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de rendimiento fiscal |

#### Descripción

El `PerformanceService` calcula métricas de rendimiento de los fiscales.

---

### 4.12 FF_COMPLIANCE_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de cumplimiento |

#### Descripción

El `ComplianceService` genera reportes de cumplimiento fiscal.

---

### 4.13 FF_FISCAL_ANALYTICS_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de análisis fiscal |

#### Descripción

El `FiscalAnalyticsService` proporciona análisis detallados de la actividad fiscal.

---

### 4.14 FF_GROUP_PERFORMANCE_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 5 |
| **Propósito** | Habilitar el servicio de rendimiento de grupos |

#### Descripción

El `GroupPerformanceService` calcula métricas de rendimiento a nivel de grupos de fiscales.

---

## 5. Feature Flags de Reportes

### 5.1 FF_NEW_REPORTS_SERVICE

| Aspecto | Detalle |
|---------|---------|
| **Valor por defecto** | `false` |
| **Fase** | Fase 3.3 |
| **Propósito** | Habilitar el servicio de reportes refactorizado |

#### Descripción

Controla si se usa el nuevo sistema modular de reportes o el servicio tradicional.

---

## 6. Matriz de Feature Flags

| Flag | Fase | Default | Recomendado Prod | Dependencias |
|------|------|---------|------------------|---------------|
| `FF_NEW_ERROR_HIERARCHY` | 1.1 | false | **true** | Ninguna |
| `FF_ZOD_ENV_VALIDATION` | 1.2 | false | **true** | Ninguna |
| `FF_BIGINT_MIDDLEWARE` | 1.3 | false | **true** | Ninguna |
| `FF_DI_CONTAINER` | 1.4 | false | **true** | Ninguna |
| `FF_TAXPAYER_DTOS` | 2.2 | false | false | Ninguna |
| `FF_NEW_TAXPAYER_SERVICE` | 3.2 | false | false | FF_DI_CONTAINER |
| `FF_NEW_TAXPAYER_REPOSITORY` | 4.1 | false | **true** | FF_DI_CONTAINER |
| `FF_STRATEGY_PATTERN` | 4.2 | false | **true** | FF_NEW_TAXPAYER_REPOSITORY |
| `FF_NEW_REPORTS_SERVICE` | 3.3 | false | false | FF_DI_CONTAINER |
| `FF_TAXPAYER_CRUD_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_EVENT_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_PAYMENT_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_IVA_REPORT_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_ISLR_REPORT_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_INDEX_IVA_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_NOTIFICATION_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_PDF_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_OBSERVATION_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_KPI_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_PERFORMANCE_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_COMPLIANCE_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_FISCAL_ANALYTICS_SERVICE` | 5 | false | false | FF_DI_CONTAINER |
| `FF_GROUP_PERFORMANCE_SERVICE` | 5 | false | false | FF_DI_CONTAINER |

---

## 7. Guía de Migración

### 7.1 Pasos para Activar un Feature Flag

1. **Desarrollar la funcionalidad**: Implementar la nueva funcionalidad manteniendo compatibilidad hacia atrás
2. **Escribir tests**: Asegurar que la funcionalidad pasa todos los tests
3. **Activar en desarrollo**: Configurar `FF_*=true` en `.env` local
4. **Probar en staging**: Activar en entorno de staging
5. **Monitorear**: Observar métricas y logs
6. **Activar en producción**: Una vez satisfecho, activar en producción
7. **Eliminar código legacy**: Después de un período de estabilidad, remover el código anterior

### 7.2 Rollback

Si una funcionalidad causaproblemas:

1. Cambiar el flag a `false` en el panel de Render o en el `.env` correspondiente
2. Render aplicará los cambios y reiniciará el servicio automáticamente.

3. Verificar que el sistema vuelve a funcionar
4. Investigar y corregir el problema
5. Repetir el proceso de activación

---

## 8. Monitoreo de Feature Flags

### 8.1 Logs

Cuando un feature flag cambia de estado, se registra en los logs:

```typescript
// Ejemplo de log
logger.info('[FEATURE_FLAG] FF_NEW_ERROR_HIERARCHY activado', {
  previousValue: false,
  newValue: true,
  timestamp: new Date().toISOString()
});
```

### 8.2 Métricas de Health Check

El endpoint `/health` incluye información sobre el estado de los feature flags críticos:

```bash
GET /health
```

```json
{
  "status": "ok",
  "featureFlags": {
    "FF_NEW_ERROR_HIERARCHY": true,
    "FF_BIGINT_MIDDLEWARE": true,
    "FF_DI_CONTAINER": true
  }
}
```

---

## 9. Mejores Prácticas

### 9.1 Naming Convention

- Usar prefijo `FF_` seguido de nombre descriptivo
- Usar mayúsculas y guiones bajos: `FF_NOMBRE_DESCRIPTIVO`
- Incluir la fase de implementación en comentarios

### 9.2 Valores por Defecto

- Usar `false` como valor por defecto para nuevos flags
- Solo usar `true` cuando la funcionalidad está completamente probada

### 9.3 Documentación

- Documentar cada flag en este archivo
- Incluir el propósito, dependencias y fecha de activación

### 9.4 Limpieza

- Revisar flags legacy trimestralmente
- Eliminar código asociado una vez que el flag esté activo por suficiente tiempo

---

## 10. Referencia Rápida

### Activar en Desarrollo

```bash
# .env.development
FF_NEW_ERROR_HIERARCHY=true
FF_BIGINT_MIDDLEWARE=true
FF_DI_CONTAINER=true
FF_STRATEGY_PATTERN=true
```

### Activar en Producción (Render)

En el panel de Render, añade las siguientes variables de entorno:

| Key | Value |
|-----|-------|
| `FF_NEW_ERROR_HIERARCHY` | `true` |
| `FF_BIGINT_MIDDLEWARE` | `true` |
| `FF_ZOD_ENV_VALIDATION` | `true` |


---

*Documento generado para el equipo de desarrollo SAC*
*Versión: 1.0.0*
*Fecha: Marzo 2026*
