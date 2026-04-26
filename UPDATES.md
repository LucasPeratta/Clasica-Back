# Actualizaciones - Sistema de Gestión de PDFs y Servicios

## Resumen General
Se han realizado los siguientes cambios para mejorar el sistema:

### 1. ✅ Soporte para PDFs en Pax y File
El sistema ahora soporta hasta **10 PDFs por Pax** y **10 PDFs por File**.

#### Nuevos Modelos de Base de Datos:
- **PaxPdf**: Almacena PDFs asociados a un Pax (ya existía)
- **FilePdf**: Almacena PDFs asociados a un File (ya existía)

#### Nuevos Endpoints:

**Para Pax:**
- `GET /pax/:id/pdfs` - Obtener todos los PDFs de un Pax
- `POST /pax/:id/pdfs` - Agregar PDFs a un Pax (máx 10)
- `DELETE /pax/:paxId/pdfs/:pdfId` - Eliminar un PDF específico

**Para File:**
- `GET /file/:id/pdfs` - Obtener todos los PDFs de un File
- `POST /file/:id/pdfs` - Agregar PDFs a un File (máx 10)
- `DELETE /file/:fileId/pdfs/:pdfId` - Eliminar un PDF específico

#### Archivos Modificados:
- `src/controllers/paxController.ts` - Agregadas funciones: `addPdfToPax`, `deletePdfFromPax`, `getPaxPdfs`
- `src/controllers/fileController.ts` - Agregadas funciones: `addPdfToFile`, `deletePdfFromFile`, `getFilePdfs`
- `src/routes/pax/index.ts` - Agregadas rutas para gestión de PDFs
- `src/routes/file/index.ts` - Agregadas rutas para gestión de PDFs

#### Características:
- Los PDFs se almacenan en Cloudinary (carpetas: `pax_pdfs` y `file_pdfs`)
- Máximo de 10 PDFs por entidad (validación en backend)
- Los PDFs se eliminan automáticamente de Cloudinary cuando se borran del sistema
- Los includes en queries ahora retornan los PDFs asociados

---

### 2. ✅ División de Servicios por Tipo
El modelo **Service** ahora tiene un campo `type` que categoriza los servicios.

#### Tipos de Servicio Disponibles:
```
- AEREO (Servicios aéreos)
- HOTEL (Alojamiento)
- EXCURSION (Excursiones)
- TRASLADO (Traslados/Transporte)
```

#### Archivos Modificados:
- `src/controllers/serviceController.ts` - `addService` y `updateService` ahora aceptan el campo `type`
- `prisma/seed.ts` - Actualizado con ejemplos de tipo de servicio
- `prisma/schema.prisma` - Enum `ServiceType` ya incluido

#### Ejemplo de Uso:
```json
{
  "nombre": "Aéreo Internacional",
  "provider": "ACME Travel",
  "precioNeto": "100.00",
  "tarifa": "150.00",
  "currency": "USD",
  "type": "AEREO"
}
```

---

### 3. ✅ Mejoras en Queries
Se han actualizado todas las queries para incluir PDFs:

- `getAllFile()` - ahora incluye `pdfs`
- `getFileById()` - ahora incluye `pdfs`
- `getAllPax()` - ahora incluye `pdfs`
- `getPaxById()` - ahora incluye `pdfs`
- Funciones de actualización retornan entidades con `pdfs` incluidos

---

## Validaciones Implementadas

### Para PDFs:
- ✅ Máximo 10 PDFs por Pax/File
- ✅ Validación de pertenencia (el PDF debe pertenecer a la entidad correcta)
- ✅ Eliminación en cascada de Cloudinary

### Para Servicios:
- ✅ El campo `type` es requerido al crear un servicio
- ✅ Solo acepta los valores del enum `ServiceType`

---

## Estructura de Respuestas

### Agregar PDF:
```json
{
  "msg": "PDFs added successfully",
  "data": [
    {
      "id": "pdf123",
      "url": "https://res.cloudinary.com/...",
      "filename": "pax_pdfs/abc123",
      "mimetype": "application/pdf",
      "size": 1024,
      "paxId": "pax123",
      "createdAt": "2026-04-26T10:00:00Z"
    }
  ]
}
```

### Error - Máximo de PDFs alcanzado:
```json
{
  "msg": "Cannot add more PDFs. Maximum 10 PDFs allowed. Currently has 8."
}
```

---

## Próximas Mejoras Sugeridas

1. **Filtros por tipo de servicio**
   - Endpoint GET `/service?type=AEREO` para filtrar servicios por tipo

2. **Descarga de múltiples PDFs**
   - Endpoint para descargar todos los PDFs de un Pax/File como ZIP

3. **Búsqueda avanzada**
   - Filtros por destino, fechas, tipos de servicio, etc.

4. **Auditoría**
   - Registrar quién subió/eliminó PDFs para auditoría

---

## Próximos Pasos
- Actualizar frontend para permitir subida de PDFs
- Implementar UI para gestión de PDFs
- Agregar validaciones de tipos MIME (solo PDF)
- Implementar límite de tamaño de archivo
