<p align="center">
  <img src="extension/icons/icon128.png" width="96" alt="P-Planner">
</p>

<h1 align="center">P-Planner</h1>

<p align="center">
  Extensión de navegador para contabilizar horas de trabajo por proyecto.<br>
  Cronómetros por proyecto, ajustes manuales y sincronización entre dispositivos con Brave/Chrome Sync.
</p>

---

## Características

- **Proyectos**: crea, renombra y borra proyectos desde el popup de la barra de herramientas.
- **Cronómetro por proyecto**: Start / Stop. Varios proyectos pueden correr a la vez.
- **Basado en timestamps**: el tiempo sigue contando aunque cierres el popup o el navegador.
- **Ajuste manual**: suma o resta horas/minutos en cualquier fecha para corregir olvidos.
- **Desglose**: total, hoy, semana actual (lunes–domingo) y últimos días.
- **Sincronización**: los datos viven en `chrome.storage.sync`; un cronómetro iniciado en un equipo se ve corriendo en el otro.
- **Badge**: el icono muestra cuántos cronómetros están en marcha.
- **Exportación**: CSV (compatible con Excel en español: `;` y coma decimal) y backup/restauración JSON.
- Modo claro/oscuro automático. Sin dependencias, sin servidores, sin telemetría.

## Instalación (Brave / Chrome)

### Desde una release (recomendado)

1. Descarga `P-Planner-vX.Y.zip` de la [última release](https://github.com/creep33/P-Planner/releases/latest).
2. Descomprímelo en una carpeta permanente (no la borres: el navegador carga la extensión desde ahí).
3. Abre `brave://extensions` (o `chrome://extensions`) y activa **Modo desarrollador**.
4. Pulsa **Cargar descomprimida** y selecciona la carpeta descomprimida (la que contiene `manifest.json`).
5. Fija el icono en la barra de herramientas.

Para actualizar: descomprime la nueva versión encima de la misma carpeta y pulsa ⟳ en la tarjeta de la extensión.
Los datos se conservan porque el ID no cambia.

### Desde el código

1. Clona el repositorio:
   ```bash
   git clone https://github.com/creep33/P-Planner.git
   ```
2. En `brave://extensions`, con **Modo desarrollador** activo, pulsa **Cargar descomprimida** y selecciona `extension/`.

El `manifest.json` incluye una clave pública (`key`) que fija el ID de la extensión a
`gbdmogficigldmeiigigomjamocipnej` en todos los equipos. Es imprescindible: `storage.sync` asocia los datos al ID,
así que cada dispositivo debe cargar esta misma carpeta sin modificar la clave.

## Sincronización entre dispositivos

1. En cada equipo: **Ajustes → Sincronización** de Brave, unirse a la misma cadena de sincronización.
2. En *Gestionar los datos sincronizados*, activa **Extensiones**.
3. Instala la extensión en cada equipo como se indica arriba (mismo ID).

Los cambios tardan normalmente unos segundos en propagarse. Si la sincronización no llegara a funcionar con la
extensión cargada sin empaquetar, usa **Backup JSON** en un equipo e **Importar** en el otro.

### Límites de `storage.sync`

| Límite | Valor | Cómo se gestiona |
| --- | --- | --- |
| Total | 100 KB | Cientos de proyectos con años de historial caben de sobra |
| Por elemento | 8 KB | El historial diario antiguo se agrupa por meses automáticamente (el total no cambia) |
| Escrituras | 120/min, 1800/h | Solo se escribe en acciones del usuario (start, stop, ajustes) |

Si dos equipos modifican el mismo proyecto a la vez sin conexión, prevalece la última escritura.

## Uso

| Acción | Cómo |
| --- | --- |
| Crear proyecto | Escribe el nombre y pulsa **Añadir** (o Enter) |
| Iniciar / parar | Botón ▶ / ■ en la lista, o **Start / Stop** en el detalle |
| Ver detalle | Click en el proyecto |
| Renombrar | Click en el nombre dentro del detalle |
| Añadir / restar tiempo | **Ajuste manual**: signo, horas, minutos y fecha |
| Borrar proyecto | **Borrar proyecto** y pulsar otra vez para confirmar |
| Exportar | **Exportar CSV** o **Backup JSON** en la lista |
| Restaurar | **Importar** (abre una pestaña; reemplaza todos los datos) |

## Modelo de datos

Una clave por proyecto en `chrome.storage.sync` para minimizar conflictos entre dispositivos:

```text
p:<id>  →  { id, name, createdAt, runningSince }      proyecto y estado del cronómetro
d:<id>  →  { "2026-10-14": ms, "2025-03": ms, ... }   tiempo cerrado por día (o por mes tras compactar)
```

Al parar un cronómetro, la sesión se reparte entre días locales si cruza la medianoche.

## Desarrollo

Requiere Node.js ≥ 22.2 solo para tests y para regenerar iconos; la extensión no tiene paso de build.

```bash
npm test         # tests de la lógica de tiempo y almacenamiento (node:test)
npm run icons    # regenera extension/icons/*.png
```

```text
extension/
  manifest.json   Manifest V3
  store.js        Almacenamiento + lógica de tiempo (compartido)
  popup.html/css/js
  background.js   Badge del icono
  icons/
scripts/
  make-icons.mjs  Genera los iconos PNG sin dependencias
tests/
  store.test.mjs
```

Tras editar archivos, pulsa ⟳ en la tarjeta de la extensión en `brave://extensions`.

### Publicar una versión

Crea una release en GitHub con un tag tipo `v1.0` o `v1.0.1`. El workflow
[`release.yml`](.github/workflows/release.yml) ejecuta los tests, pone la versión del tag en `manifest.json`,
empaqueta `extension/` en `P-Planner-vX.Y.zip` (con su `.sha256`) y lo adjunta a la release.

```bash
gh release create v1.0 --generate-notes
```

## Licencia

[MIT](LICENSE)
