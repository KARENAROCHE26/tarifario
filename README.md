# Cotizador COTYSSA

Herramienta web estática para preparar solicitudes de renta de equipo, generar un PDF y abrir un resumen por WhatsApp o correo.

## Uso
Abra index.html en un navegador o publíquelo mediante GitHub Pages (rama main, carpeta raíz). No requiere instalación, base de datos ni claves. La publicación en GitHub Pages se debe activar en Settings > Pages del repositorio.

- Catálogo: 91 artículos del ejemplo proporcionado el 2 de noviembre de 2026.
- Períodos: 7, 14 y 30 días; puede indicar varios períodos.
- Cálculo: cantidad × tarifa por período × cantidad de períodos.
- IVA incluido: total × 12 / 112 (no se agrega otra vez).
- Las tarifas null se muestran como Por cotizar y se excluyen del subtotal. No se extrapolan ni se inventan precios.
- Las tarifas provienen del ejemplo del usuario y requieren validación comercial antes de compartir con clientes.
- WhatsApp: +502 5579-3749.
- Correo: servicioalcliente@cotyssa.com.

## PDF y envío
El PDF se genera localmente, sin enviar datos a un servidor. WhatsApp y mailto abren un borrador con el resumen y requieren que el cliente confirme el envío. No adjuntan automáticamente el PDF. El botón Compartir PDF usa Web Share cuando el navegador admite archivos; de lo contrario descarga el PDF para adjuntarlo manualmente. Se requiere un cliente de correo configurado para mailto. Los datos y la selección no persisten tras recargar.

## Editar el catálogo
En index.html, bloque quote-core: las llamadas add contienen [precio 1 semana, precio 2 semanas, precio 1 mes]. MULTI y PANELS contienen tarifas de 2 semanas y 1 mes; la tarifa semanal es null. Utilice null para precios sin confirmar. No coloque credenciales ni información de clientes en el repositorio.

## Validación
Se verificaron los cálculos con períodos múltiples, IVA incluido, precios pendientes, búsqueda y selección en navegador, sintaxis de JavaScript y PDFs de una y seis páginas. La apertura de aplicaciones externas y el menú de compartir dependen del dispositivo del cliente.
