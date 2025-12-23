# Guía de Uso - Subida de Fotos para PAX

## Configuración Inicial

### 1. Configurar Cloudinary

1. Crea una cuenta en [Cloudinary](https://cloudinary.com/)
2. Obtén tus credenciales del Dashboard
3. Actualiza el archivo `.env` con tus credenciales:

```env
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
```

## Endpoints Disponibles

### 1. Crear PAX con Fotos

**POST** `/api/pax/create`

**Content-Type:** `multipart/form-data`

**Campos:**

- `firstname` (string)
- `lastname` (string)
- `dni` (string, opcional)
- `passport` (string, opcional)
- `dob` (date, opcional)
- `adress` (string, opcional)
- `email` (string, opcional)
- `phoneNumber` (string, opcional)
- `obs` (string, opcional)
- `photos` (files[], máximo 10 imágenes)

**Ejemplo con JavaScript/Fetch:**

```javascript
const formData = new FormData();
formData.append("firstname", "Juan");
formData.append("lastname", "Pérez");
formData.append("email", "juan@example.com");

// Agregar múltiples fotos
const photos = document.querySelector("#photoInput").files;
for (let i = 0; i < photos.length; i++) {
  formData.append("photos", photos[i]);
}

const response = await fetch("http://localhost:3000/api/pax/create", {
  method: "POST",
  body: formData,
});
```

### 2. Actualizar PAX con Nuevas Fotos

**PUT** `/api/pax/update/:id`

**Content-Type:** `multipart/form-data`

Mismos campos que crear PAX. Las fotos nuevas se agregan a las existentes.

### 3. Agregar Fotos a un PAX Existente

**POST** `/api/pax/:id/photos`

**Content-Type:** `multipart/form-data`

**Campo:**

- `photos` (files[], máximo 10 imágenes)

**Ejemplo:**

```javascript
const formData = new FormData();
const photos = document.querySelector("#photoInput").files;
for (let i = 0; i < photos.length; i++) {
  formData.append("photos", photos[i]);
}

const response = await fetch("http://localhost:3000/api/pax/123/photos", {
  method: "POST",
  body: formData,
});
```

### 4. Obtener Fotos de un PAX

**GET** `/api/pax/:id/photos`

**Respuesta:**

```json
{
  "data": [
    {
      "id": "photo_id",
      "url": "https://res.cloudinary.com/...",
      "filename": "pax_photos/...",
      "mimetype": "image/jpeg",
      "size": 123456,
      "paxId": "pax_id",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 5. Eliminar una Foto Específica

**DELETE** `/api/pax/:paxId/photos/:photoId`

**Ejemplo:**

```javascript
const response = await fetch("http://localhost:3000/api/pax/123/photos/456", {
  method: "DELETE",
});
```

### 6. Obtener PAX con sus Fotos

**GET** `/api/pax/:id`

Devuelve el PAX con todas sus fotos incluidas.

**GET** `/api/pax`

Devuelve todos los PAX con sus fotos.

## Ejemplo Completo con React

```jsx
import { useState } from "react";

function CreatePaxForm() {
  const [formData, setFormData] = useState({
    firstname: "",
    lastname: "",
    email: "",
  });
  const [photos, setPhotos] = useState([]);

  const handlePhotoChange = (e) => {
    setPhotos(Array.from(e.target.files));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const data = new FormData();
    data.append("firstname", formData.firstname);
    data.append("lastname", formData.lastname);
    data.append("email", formData.email);

    // Agregar todas las fotos
    photos.forEach((photo) => {
      data.append("photos", photo);
    });

    try {
      const response = await fetch("http://localhost:3000/api/pax/create", {
        method: "POST",
        body: data,
      });

      const result = await response.json();
      console.log("PAX creado:", result);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={formData.firstname}
        onChange={(e) =>
          setFormData({ ...formData, firstname: e.target.value })
        }
        placeholder="Nombre"
      />
      <input
        type="text"
        value={formData.lastname}
        onChange={(e) => setFormData({ ...formData, lastname: e.target.value })}
        placeholder="Apellido"
      />
      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        placeholder="Email"
      />
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handlePhotoChange}
      />
      <button type="submit">Crear PAX</button>
    </form>
  );
}
```

## Limitaciones

- Tamaño máximo por archivo: **5MB**
- Máximo de fotos por request: **10**
- Solo se aceptan archivos de tipo imagen (image/\*)
- Las fotos se almacenan en Cloudinary en la carpeta `pax_photos`

## Notas Importantes

1. Al eliminar un PAX, todas sus fotos se eliminan automáticamente de Cloudinary y la base de datos.
2. Las fotos están relacionadas con el PAX mediante `onDelete: Cascade` en el schema de Prisma.
3. Los campos `size` y `mimetype` son opcionales pero se guardan para referencia.
4. Cada foto tiene su propio ID único y puede ser eliminada individualmente.

## Troubleshooting

**Error: "Only image files are allowed!"**

- Asegúrate de que solo estés subiendo archivos de tipo imagen.

**Error de Cloudinary**

- Verifica que las credenciales en `.env` sean correctas.
- Asegúrate de que tu cuenta de Cloudinary esté activa.

**Error: "File too large"**

- Reduce el tamaño de la imagen a menos de 5MB.
