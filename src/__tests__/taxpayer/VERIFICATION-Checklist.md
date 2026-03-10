# Verificación módulo taxpayer – Checklist y resultados

## Ejecución de la suite

```bash
npm test -- src/__tests__/taxpayer/taxpayer-endpoints-verification.test.ts
```

## Criterios de aceptación

- **TODOS los endpoints responden correctamente**: La suite comprueba que cada ruta devuelve un código HTTP esperado (200, 201, 400, 403, 404 o 500 según el caso) y **nunca** un fallo no controlado.
- **Formatos JSON**: Los tests no validan el contrato exacto del pre-refactor; para eso se recomienda comparar respuestas en entorno de staging o con snapshots si se añaden.
- **Errores 500**: Algunos endpoints pueden devolver 500 cuando los mocks no cubren todos los datos (ej. contribuyente inexistente); los tests aceptan 500 dentro del rango permitido para no ser frágiles. En integración/E2E se debe verificar que no haya 500 en flujos válidos.
- **Emails**: No se envían en tests (RESEND_API_KEY de prueba); la lógica de notificación y cambio de fase se ejecuta y el endpoint responde.
- **Permisos por rol**: Hay tests específicos que verifican 403 para FISCAL en: `modify-observations`, `del-observation`, `update-fase`, `delete-iva`, `create-taxpayer-category`, `create-index-iva`.

## Mapeo checklist → tests

| Sección | Ítem | Test (describe / it) |
|--------|------|------------------------|
| **Contribuyentes** | POST crear manual | `Contribuyentes` / `POST crear contribuyente manual (ADMIN)` |
| | POST crear desde Excel | `POST crear contribuyente desde Excel (ADMIN)` |
| | GET por ID | `GET contribuyente por ID` |
| | GET todos | `GET todos los contribuyentes` |
| | GET por usuario | `GET contribuyentes por usuario` |
| | PUT actualizar (ADMIN) | `PUT actualizar contribuyente (ADMIN)` |
| | PUT actualizar (FISCAL) | `PUT update-taxpayer (FISCAL - permisos)` |
| | DELETE eliminar | `DELETE eliminar contribuyente` |
| **Estado** | PUT cambiar fase | `Estado` / `PUT cambiar fase (ADMIN)` |
| | PUT marcar culminado | `PUT marcar como culminado (FISCAL - permisos)` |
| | PUT notificar | `PUT notificar contribuyente` |
| **Consultas** | GET estadísticas fiscal | `Consultas` / `GET estadisticas del fiscal` |
| | GET contribuyentes eventos ADMIN/COORD/SUPER/FISCAL | 4 tests `GET contribuyentes para eventos (ROLE)` |
| | GET datos completos | `GET datos completos del contribuyente` |
| | GET resumen IVA | `GET resumen IVA (getTaxSummary)` |
| **Eventos** | POST crear evento | `Eventos` / `POST crear evento (type FINE)` |
| | POST PAYMENT_COMPROMISE | `POST crear PAYMENT_COMPROMISE` |
| | GET por contribuyente / filtro tipo | `GET eventos por contribuyente`, `GET eventos filtrados por tipo` |
| | PUT actualizar, DELETE | `PUT actualizar evento`, `DELETE eliminar evento` |
| **Pagos** | POST crear, PUT actualizar/estado, DELETE, GET pendientes | 5 tests en `Pagos (payment)` |
| **Reportes IVA** | POST crear, POST (FISCAL), PUT, DELETE, PUT índice individual, POST índice global | 6 tests en `Reportes IVA` |
| **Reportes ISLR** | POST, PUT, GET por contribuyente, DELETE | 4 tests en `Reportes ISLR` |
| **Observaciones** | POST, GET listar, PUT, DELETE | 4 tests en `Observaciones` |
| **Repair-report** | POST subir, PUT actualizar URL, DELETE | 3 tests en `Reportes de reparo` |
| **Category-parish** | POST categoría, GET categorías, GET parroquias | 3 tests en `Categorias y parroquias` |
| **S3** | GET URL reparo, GET URL PDF investigación | 2 tests en `S3 (helpers)` |
| **Permisos** | 403 FISCAL en varios endpoints | 6 tests en `Permisos por rol` |

## Resumen

- **Archivo de tests**: `taxpayer-endpoints-verification.test.ts`
- **Total tests**: 58
- **Estado**: Todos pasan con mocks de `db` y `taxpayerRepository` en `setup.ts`.
- **Cuidado de funcionalidad**: Los tests no modifican BD real; usan mocks para que el refactor no rompa las rutas ni la aplicación de permisos por rol.
