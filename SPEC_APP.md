SPEC_APP.md
Aplicación Web de Captura de Inventario compatible con Sage X3
1. Objetivo

Desarrollar una aplicación web ligera para captura de inventario que permita a operarios de almacén registrar conteos desde un navegador (PC o terminal con escáner) y generar un archivo CSV compatible con el modelo de importación de inventarios de Sage X3.

La aplicación debe funcionar sin necesidad de instalar software adicional, utilizando únicamente un navegador web.

2. Flujo funcional del sistema

El flujo general de la aplicación es:

Importar sesión de inventario
        ↓
Leer estructura E/L/S
        ↓
Crear tabla de trabajo
        ↓
Captura de conteo (escáner o manual)
        ↓
Actualizar o crear líneas
        ↓
Generar CSV final compatible con Sage
3. Modelo de datos Sage X3

El modelo de inventario utiliza tres tipos de registros.

Tipo	Tabla Sage	Descripción
E	CUNSESSION	Cabecera de sesión
L	CUNLISTE	Lista de inventario
S	CUNLISDET	Línea de inventario

La aplicación solo modificará registros tipo S.

4. Campo principal de actualización

El campo clave que se modificará es:

QTYPCUNEW

Este campo representa la cantidad contada en el inventario.

5. Archivos de entrada
5.1 modeloSesInv.csv

Archivo exportado desde Sage que contiene la sesión de inventario.

La aplicación debe:

leer el archivo

identificar la sesión (CUNSSSNUM)

identificar las listas (CUNLISNUM)

cargar todas las líneas de inventario existentes

5.2 MAPA.csv

Archivo que contiene el mapa de ubicaciones del almacén.

Uso:

validar ubicaciones introducidas

evitar ubicaciones inexistentes

En la primera versión solo se usará el campo:

LOC
5.3 GS1.txt

Ejemplo de lectura de código GS1/DataMatrix.

La aplicación deberá ser capaz de interpretar códigos que incluyan:

AI	Campo
02	artículo
10	lote
04	cantidad
21	serie
6. Tabla de trabajo interna

Una vez importado el CSV la aplicación creará una tabla de trabajo en memoria.

Cada registro deberá contener:

sesion
lista
linea
articulo
lote
ubicacion
cantidad
estado
unidad

Esta tabla será la base para:

búsquedas rápidas

actualizaciones

creación de nuevas líneas

7. Captura de inventario

El operario podrá registrar inventario mediante:

Escaneo

Entrada desde lector de códigos.

La aplicación deberá:

detectar el código

interpretar el formato GS1

extraer artículo, lote y cantidad

Entrada manual

El usuario podrá introducir:

artículo

ubicación

cantidad

8. Lógica de actualización

Cuando se capture un registro:

Caso 1: línea existente

Si existe una línea con:

mismo artículo
misma ubicación
mismo lote (si aplica)

Se actualizará:

QTYPCUNEW
Caso 2: línea nueva

Si no existe línea compatible:

se duplicará una estructura de línea existente

se generará una nueva línea

Campos a modificar:

ITMREF
LOC
QTYPCUNEW
9. Numeración de líneas

Las líneas utilizan numeración incremental.

Ejemplo:

1000
2000
3000

Las nuevas líneas deben utilizar el siguiente valor disponible.

10. Exportación final

Al finalizar el conteo la aplicación generará:

EXPORT_INV.csv

Este archivo debe:

mantener estructura E/L/S

contener las líneas actualizadas

incluir nuevas líneas si se han creado

Debe ser compatible con la importación de Sage X3.

11. Interfaz de usuario

La aplicación deberá incluir al menos tres pantallas.

Pantalla 1 – Importación

Funciones:

cargar modeloSesInv.csv

mostrar información de sesión

validar archivo

Pantalla 2 – Conteo

Campos principales:

Artículo
Ubicación
Cantidad

Funciones:

lectura de escáner

validación de ubicación

actualización automática de líneas

registro de nuevas líneas

Pantalla 3 – Exportación

Funciones:

visualizar resumen del inventario

descargar EXPORT_INV.csv

12. Arquitectura técnica sugerida

Aplicación web estática.

Tecnologías recomendadas:

HTML
CSS
JavaScript

No requiere backend.

Puede alojarse en:

GitHub Pages

servidor interno

intranet corporativa

13. Requisitos clave

La aplicación debe:

funcionar sin instalación

soportar escáner USB

generar CSV compatible con Sage

permitir inventario rápido en almacén

14. Evoluciones futuras

Posibles mejoras futuras:

soporte multiusuario

sincronización en red

control de duplicados

gestión de sesiones múltiples

estadísticas de inventario

integración directa con API Sage
