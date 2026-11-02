# Tarifario COTYSSA

Diseño original del artefacto proporcionado por Karen Aroche, recuperado el 2 de noviembre de 2026.

- Se conservan los estilos, logo, imágenes, fichas técnicas, catálogo y generador PDF originales.
- La única adaptación del HTML es cargar jsPDF 2.5.1 desde vendor/jspdf.umd.min.js.
- El PDF conserva el mismo formato, imagen de logo, condiciones y pie del original.
- WhatsApp: +502 5579-3749. Correo: servicioalcliente@cotyssa.com.
- Las tarifas sin confirmar permanecen como Consultar. Disponibilidad sujeta a confirmación.
- WhatsApp y correo preparan el mensaje y descargan el PDF para adjuntarlo manualmente. Compartir archivos depende del navegador.
- El borrador se conserva localmente en el navegador mediante localStorage, como en el original.

## Publicación

La aplicación está en dist/index.html y utiliza dist/vendor/jspdf.umd.min.js. Puede alojarse como un sitio estático.
En el repositorio KARENAROCHE26/tarifario, index.html y vendor se ubican en la raíz para GitHub Pages.

## Verificación

Se comparó la igualdad del CSS y de la función buildPdf con el original. Se probaron selección, PDF descargado en navegador y generación de PDFs con una y varias páginas.
