/** Office Script para la tabla compartida. Ejecutar desde Power Automate con concurrencia = 1. */
interface Quote {
  reference: string;
  createdAt: string;
  name: string;
  company: string;
  project: string;
  phone: string;
  email: string;
  address: string;
  amount: number;
  pending: boolean;
  equipment: string;
  period: string;
  delivery: boolean;
  assembly: boolean;
  notes: string;
  nit: string;
  start: string;
  pdfUrl?: string;
}
function main(workbook: ExcelScript.Workbook, quoteJson: string): string {
  const q = JSON.parse(quoteJson) as Quote;
  if (!/^TR-[A-Z0-9-]{8,60}$/.test(q.reference) || !q.name || !q.phone || !Number.isFinite(q.amount)) {
    throw new Error('Cotización incompleta o inválida.');
  }
  const at = Date.parse(q.createdAt);
  if (!Number.isFinite(at)) throw new Error('Fecha de generación inválida.');
  const table = workbook.getTable('CotizacionesCotyssa');
  if (!table) throw new Error('No existe CotizacionesCotyssa en el archivo seleccionado.');
  const sheet = table.getWorksheet();
  const extras = ['Equipo solicitado','Período de renta','Flete solicitado','Montaje solicitado','Comentarios del cliente','NIT','Inicio estimado','Ubicación de la obra'];
  let headers = table.getHeaderRowRange().getTexts()[0];
  extras.forEach(name => { if (headers.indexOf(name) < 0) table.addColumn(-1, undefined, name); });
  headers = table.getHeaderRowRange().getTexts()[0];
  const refIndex = headers.indexOf('N.º de cotización');
  if (refIndex < 0) throw new Error('Falta la columna de referencia.');
  let body = table.getRangeBetweenHeaderAndTotal();
  const values = body.getValues();
  const existing = values.findIndex(row => String(row[refIndex]) === q.reference);
  // Una descarga repetida no modifica el asesor, el estado ni el seguimiento ya capturado.
  if (existing >= 0) return JSON.stringify({ok:true,reference:q.reference,existing:true});
  let free = values.findIndex(row => row.every(value => value === ''));
  // La columna Alerta contiene fórmulas vacías: buscar por referencia y datos de cliente.
  if (free < 0) free = values.findIndex(row => row[refIndex] === '' && row[headers.indexOf('Cliente')] === '');
  if (free < 0) { table.addRow(-1); body = table.getRangeBetweenHeaderAndTotal(); free = body.getRowCount() - 1; }
  const row = body.getRow(free);
  const safe = (text: string): string => /^[=+@-]/.test(String(text || '')) ? "'" + text : String(text || '');
  const put = (name: string, value: string | number | boolean) => {
    const col = headers.indexOf(name);
    if (col >= 0) row.getCell(0,col).setValue(typeof value === 'string' ? safe(value) : value);
  };
  // Guatemala es UTC-6. Fechas y horas se guardan como valores numéricos de Excel.
  const localSerial = (at - 6 * 3600000) / 86400000 + 25569;
  put('N.º de cotización',q.reference);
  put('Fecha de cotización',Math.floor(localSerial));
  put('Hora de cotización',localSerial - Math.floor(localSerial));
  put('Cliente',q.name);
  put('Empresa / proyecto',[q.company,q.project].filter(Boolean).join(' / '));
  put('Estado','Nueva');
  put('Monto referencial (Q)',q.amount);
  put('Teléfono / WhatsApp',q.phone);
  put('Correo del cliente',q.email);
  put('Canal de recepción','Cotizador web');
  put('Precio pendiente',q.pending ? 'Sí' : 'No');
  put('Actualizado por','Cotizador automático');
  put('Fecha y hora de actualización',localSerial);
  put('Enlace PDF / evidencia',q.pdfUrl || '');
  put('Equipo solicitado',q.equipment);
  put('Período de renta',q.period);
  put('Flete solicitado',q.delivery ? 'Sí' : 'No');
  put('Montaje solicitado',q.assembly ? 'Sí' : 'No');
  put('Comentarios del cliente',q.notes);
  put('NIT',q.nit);
  put('Inicio estimado',q.start);
  put('Ubicación de la obra',q.address);
  const excelRow = row.getRowIndex() + 1;
  const alertCol = headers.indexOf('Alerta de seguimiento');
  if (alertCol >= 0) row.getCell(0,alertCol).setFormula(`=IF(A${excelRow}="","",IF(OR(B${excelRow}="",C${excelRow}=""),"Falta fecha / hora",IF(F${excelRow}="","Sin asesor",IF(G${excelRow}="","Sin estado",IF(OR(G${excelRow}="Aceptada",G${excelRow}="No concretada",G${excelRow}="Cancelada"),"Cerrada",IF(J${excelRow}="","Sin próximo seguimiento",IF(J${excelRow}<NOW(),"Vencido","Programado")))))))`);
  row.getCell(0,headers.indexOf('Fecha de cotización')).setNumberFormat('dd/mm/yyyy');
  row.getCell(0,headers.indexOf('Hora de cotización')).setNumberFormat('hh:mm');
  row.getCell(0,headers.indexOf('Fecha y hora de actualización')).setNumberFormat('dd/mm/yyyy hh:mm');
  sheet.getRange('A4').setValue('Cotizaciones generadas en la web: registro automático. Asesor y seguimiento: actualización manual.');
  sheet.getRange('N11:N510').getDataValidation().setRule({list:{inCellDropDown:true,source:'Cotizador web,WhatsApp,Correo,Otro'}});
  workbook.getApplication().calculate(ExcelScript.CalculationType.full);
  return JSON.stringify({ok:true,reference:q.reference,existing:false});
}
