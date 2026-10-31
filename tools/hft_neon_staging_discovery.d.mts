/** Types for the Node.js build-time Neon discovery tool. */
export type PreviewConfig=Readonly<{host:string;db:string;login:string;password:string}>;
export interface ReadonlyClient {
 query(sql:string):Promise<{rows:Record<string,unknown>[]}>
 release():void
}
export interface ReadonlyPool {
 connect():Promise<ReadonlyClient>
 end():Promise<void>
}
export function previewConfig(env:Record<string,string|undefined>):PreviewConfig|null;
export function inspectReadOnly(pool:ReadonlyPool,
 config:PreviewConfig):Promise<Readonly<Record<string,unknown>>>;
export function discover(env:Record<string,string|undefined>,
 createPool:(config:Record<string,unknown>)=>Promise<ReadonlyPool>):Promise<Readonly<Record<string,unknown>>>;

