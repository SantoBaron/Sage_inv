Inventario Sage X3 – Web Inventory Capture
Descripción

Este repositorio contiene los archivos de referencia y ejemplos necesarios para desarrollar una aplicación web de captura de inventario compatible con Sage X3.

El objetivo del proyecto es construir una herramienta ligera que permita realizar conteos de inventario desde navegador 
(PC o lector con escáner) y generar un archivo CSV compatible con el modelo de importación de inventarios de Sage X3.

La aplicación deberá:

importar una sesión de inventario exportada desde Sage

permitir capturar conteos mediante lectura de código o entrada manual

actualizar o crear líneas de inventario

generar un CSV final reimportable en Sage X3

Estructura del inventario en Sage X3

El modelo de importación/exportación utiliza una estructura jerárquica basada en tres tipos de registro:

Tipo	Tabla Sage	Descripción
E	CUNSESSION	Cabecera de sesión de inventario
L	CUNLISTE	Listas de inventario
S	CUNLISDET	Líneas de inventario

La aplicación debe mantener esta estructura sin alterarla.

Las modificaciones se realizan exclusivamente en las líneas S.

Campo clave del inventario

El campo principal que se actualizará es:

QTYPCUNEW

Este campo representa:

Stock UE contado

La aplicación deberá actualizar este valor con la cantidad capturada durante el conteo.

Flujo funcional de la aplicación

El proceso esperado es el siguiente:

1 Importación de sesión

El usuario carga el archivo:

modeloSesInv.csv

Este archivo contiene una sesión de inventario exportada desde Sage.

La aplicación debe:

leer el archivo

identificar la sesión de inventario

cargar las líneas existentes

2 Captura de inventario

Durante el conteo el operario puede:

escanear un código

introducir artículo manualmente

indicar cantidad

indicar ubicación si procede

La aplicación deberá:

buscar si ya existe una línea para ese artículo

actualizar la línea existente
o

crear una nueva línea al final del archivo

3 Generación del export

Una vez finalizado el conteo se genera:

EXPORT_INV.csv

Este archivo debe:

mantener la estructura E/L/S original

contener las líneas actualizadas

ser compatible con el modelo de importación de Sage

Archivos incluidos en el repositorio
modeloSesInv.csv

Ejemplo de sesión de inventario exportada desde Sage X3.

Se utiliza como archivo base de entrada para la aplicación.

Permite:

identificar sesión

identificar listas

identificar líneas existentes

MODELOIMPORT_EXPORT_INV_SAGE.xml

Exportación del modelo de importación/exportación de inventarios de Sage X3.

Define:

objeto: SNX

función: GESSNX

script de importación: IMPSNXS

También define:

estructura del archivo

tablas utilizadas

campos válidos

orden de campos

Este archivo es la referencia técnica del modelo de datos.

MAPA.csv

Archivo de ejemplo que representa el mapa de ubicaciones del almacén.

Se utilizará para:

validar ubicaciones introducidas

evitar registros en ubicaciones no válidas

En la versión inicial solo se utilizará el campo de ubicación.

GS1.txt

Ejemplo de lectura de código GS1/DataMatrix procedente de un escáner.

Estos códigos pueden contener múltiples datos:

AI	Significado
02	Identificador de artículo
10	Lote
04	Cantidad
21	Número de serie

La aplicación deberá interpretar estos códigos y extraer los datos relevantes.

EXPORT_INV.csv

Ejemplo del archivo final esperado tras el inventario.

Sirve como referencia para validar que la aplicación genera un archivo compatible con Sage.

Reglas de generación de líneas

Cuando la aplicación necesite crear una nueva línea de inventario deberá:

copiar la estructura de una línea existente

modificar los campos necesarios

Principalmente:

ITMREF
LOC
QTYPCUNEW

Las líneas de inventario utilizan numeración incremental.

Objetivo técnico

Construir una aplicación web ligera que permita realizar inventarios de forma rápida utilizando:

navegador

lector de códigos

teclado

Y que genere directamente un archivo compatible con:

Sage X3 – Importación de inventarios
