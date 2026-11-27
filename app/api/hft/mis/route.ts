/** Issue 19 source boundary: no qualified management/BOM/stock adapter installed.
 * Do not enable this route using environment flags or return fixture data.
 */
export async function POST():Promise<Response>{
 return Response.json({state:'UNAVAILABLE',code:'MIS_AUTHORITATIVE_SOURCE_NOT_ADMITTED'},
  {status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
