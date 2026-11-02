# Registro automático de cotizaciones

Estado: integración preparada; no activada en producción.

Destino exclusivo: Seguimiento_Cotizaciones_COTYSSA.xlsx en la carpeta de OneDrive Seguimiento de cotizaciones COTYSSA. Tabla CotizacionesCotyssa. Conservar identidad, permisos y datos existentes. No reemplazar el archivo completo.

## Flujo de cliente

Una sola acción: generar y descargar el PDF. El servidor valida los datos y registra la cotización en Microsoft. El PDF debe descargarse después de la confirmación del registro; si falla, mostrar un error con opción de reintento, conservando los datos.

Todos los datos de cotización se capturan automáticamente. Solo el asesor y los campos de seguimiento se actualizan manualmente. Una descarga repetida conserva el mismo número y no sobreescribe el trabajo del asesor.

## Configuración de Microsoft

1. Guardar registrar-cotizacion.ts como Office Script en la cuenta corporativa autorizada.
2. Crear un flujo de Power Automate con Cuando se recibe una solicitud HTTP, Ejecutar script (Excel Online para empresas) y Respuesta HTTP.
3. Ejecutar el script sobre el archivo exacto y pasar string(triggerBody()) como quoteJson.
4. Responder HTTP 200 con el resultado del script solo después de que termine correctamente. Los errores deben devolver HTTP 500; no responder éxito anticipadamente.
5. Concurrencia del desencadenador: 1, para serializar escrituras de Excel. La referencia se comprueba antes de insertar.
6. El endpoint debe admitir la llamada del servidor sin inicio de sesión del cliente. Configurar el acceso previsto y conservar la URL firmada exclusivamente como secreto del servidor QUOTE_FLOW_URL. No publicarla en HTML, GitHub, documentos ni mensajes.

## Conexión del sitio

Usar quote-gateway.mjs en una ruta POST /api/quotes de un Worker. El catálogo que recibe createQuoteHandler debe ser DATA.P del cotizador original. El endpoint no permite leer el registro ni cambiar seguimiento.

Adaptar getPdfBlob para registrar primero; conservar una clave UUID por firma de cotización en localStorage. Al confirmar, asignar reference a S.ref, conservar sig() en S.refSig y guardar createdAt. Generar el PDF después. Calcular fileName() después de este paso. Interceptar WhatsApp/correo hasta completar el registro para usar la misma referencia. Conservar el diseño original.

No publicar como función activa hasta conectar el flujo y probar una cotización de principio a fin. Verificar: fila nueva, fecha/hora de Guatemala, cálculo, PDF original, mismo número en PDF/mensaje/Excel, reintento sin duplicado y conservación del asesor/seguimiento en reintentos.

## Permisos vigentes

Edición en la carpeta y el archivo: karoche@cotyssa.com, servicioalcliente@cotyssa.com, ventas@cotyssa.com, comercial@cotyssa.com, sgodinez@cotyssa.com. No publicar el control de seguimiento ni dar acceso a clientes.

Documentación: https://learn.microsoft.com/en-us/office/dev/scripts/develop/power-automate-integration
