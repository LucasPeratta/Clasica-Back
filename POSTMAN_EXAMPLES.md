# Ejemplos de Uso con Postman

## 1. Crear PAX con Fotos

**Método:** POST  
**URL:** `http://localhost:3000/api/pax/create`

### Body (form-data):

```
firstname: Juan
lastname: Pérez
email: juan@example.com
dni: 12345678
phoneNumber: +54 11 1234-5678
obs: Cliente VIP
photos: [Seleccionar archivo 1]
photos: [Seleccionar archivo 2]
photos: [Seleccionar archivo 3]
```

**Nota:** En Postman, selecciona "form-data" y para cada archivo:

1. Agrega una key llamada `photos`
2. Cambia el tipo de "Text" a "File"
3. Selecciona el archivo
4. Repite para cada foto adicional (todas con el mismo nombre de key: `photos`)

---

## 2. Actualizar PAX y Agregar Más Fotos

**Método:** PUT  
**URL:** `http://localhost:3000/api/pax/update/{paxId}`

### Body (form-data):

```
firstname: Juan Carlos
lastname: Pérez García
email: juan.perez@example.com
photos: [Seleccionar archivo nuevo]
```

---

## 3. Solo Agregar Fotos a un PAX Existente

**Método:** POST  
**URL:** `http://localhost:3000/api/pax/{paxId}/photos`

### Body (form-data):

```
photos: [Seleccionar archivo 1]
photos: [Seleccionar archivo 2]
```

---

## 4. Obtener PAX con sus Fotos

**Método:** GET  
**URL:** `http://localhost:3000/api/pax/{paxId}`

### Respuesta Esperada:

```json
{
  "msg": "pax retrieved SUCCESSFULLY",
  "data": {
    "id": "clxxx123",
    "firstname": "Juan",
    "lastname": "Pérez",
    "email": "juan@example.com",
    "dni": "12345678",
    "passport": null,
    "dob": null,
    "adress": null,
    "phoneNumber": "+54 11 1234-5678",
    "obs": "Cliente VIP",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "photos": [
      {
        "id": "photo_id_1",
        "url": "https://res.cloudinary.com/.../image1.jpg",
        "filename": "pax_photos/abc123",
        "mimetype": "image/jpeg",
        "size": 245678,
        "paxId": "clxxx123",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      },
      {
        "id": "photo_id_2",
        "url": "https://res.cloudinary.com/.../image2.jpg",
        "filename": "pax_photos/def456",
        "mimetype": "image/png",
        "size": 189234,
        "paxId": "clxxx123",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

---

## 5. Obtener Solo las Fotos de un PAX

**Método:** GET  
**URL:** `http://localhost:3000/api/pax/{paxId}/photos`

### Respuesta Esperada:

```json
{
  "data": [
    {
      "id": "photo_id_1",
      "url": "https://res.cloudinary.com/.../image1.jpg",
      "filename": "pax_photos/abc123",
      "mimetype": "image/jpeg",
      "size": 245678,
      "paxId": "clxxx123",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## 6. Eliminar una Foto Específica

**Método:** DELETE  
**URL:** `http://localhost:3000/api/pax/{paxId}/photos/{photoId}`

### Respuesta Esperada:

```json
{
  "msg": "Photo deleted successfully"
}
```

---

## 7. Obtener Todos los PAX con sus Fotos

**Método:** GET  
**URL:** `http://localhost:3000/api/pax`

### Respuesta Esperada:

```json
{
  "paxs": [
    {
      "id": "clxxx123",
      "firstname": "Juan",
      "lastname": "Pérez",
      "email": "juan@example.com",
      "photos": [...]
    },
    {
      "id": "clxxx456",
      "firstname": "María",
      "lastname": "González",
      "email": "maria@example.com",
      "photos": [...]
    }
  ]
}
```

---

## 8. Eliminar PAX (y todas sus fotos)

**Método:** DELETE  
**URL:** `http://localhost:3000/api/pax/{paxId}`

**Nota:** Esto eliminará automáticamente:

- El registro del PAX en la base de datos
- Todas las fotos asociadas en la base de datos
- Todas las fotos en Cloudinary

### Respuesta Esperada:

```json
{
  "msg": "pax deleted SUCCESSFULLY"
}
```

---

## Colección de Postman

Puedes importar esta colección JSON en Postman:

```json
{
  "info": {
    "name": "Clasica Backend - PAX Photos",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Create PAX with Photos",
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "formdata",
          "formdata": [
            { "key": "firstname", "value": "Juan", "type": "text" },
            { "key": "lastname", "value": "Pérez", "type": "text" },
            { "key": "email", "value": "juan@example.com", "type": "text" },
            { "key": "photos", "type": "file", "src": "" },
            { "key": "photos", "type": "file", "src": "" }
          ]
        },
        "url": {
          "raw": "http://localhost:3000/api/pax/create",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "pax", "create"]
        }
      }
    },
    {
      "name": "Get All PAX",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:3000/api/pax",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "pax"]
        }
      }
    },
    {
      "name": "Get PAX by ID",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:3000/api/pax/:id",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "pax", ":id"]
        }
      }
    },
    {
      "name": "Add Photos to PAX",
      "request": {
        "method": "POST",
        "body": {
          "mode": "formdata",
          "formdata": [
            { "key": "photos", "type": "file", "src": "" },
            { "key": "photos", "type": "file", "src": "" }
          ]
        },
        "url": {
          "raw": "http://localhost:3000/api/pax/:id/photos",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "pax", ":id", "photos"]
        }
      }
    },
    {
      "name": "Delete Photo",
      "request": {
        "method": "DELETE",
        "url": {
          "raw": "http://localhost:3000/api/pax/:paxId/photos/:photoId",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "pax", ":paxId", "photos", ":photoId"]
        }
      }
    }
  ]
}
```
