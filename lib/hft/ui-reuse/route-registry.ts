/** C050 HFT-native route inventory; donor interaction patterns, no donor code.
 * Navigation visibility is NOT HTTP, IAM or PostgreSQL authorization.
 * Registered page routes are derived from the frozen C047 Next.js tree.
 */
export type UiScope=Readonly<{legalEntityId:string;siteId:string;warehouseId:string}>;
export type FacilityRoute=Readonly<{
 id:string;path:string;name:string;application:'CORE'|'STORES'|'MASTERS'|'MIS';
 viewPermission:string;state:'SOURCE_ONLY'|'REPORTING_UNAVAILABLE';
}>;
export const C047_EXISTING_ROUTES:readonly FacilityRoute[]=Object.freeze([
 {id:'operations.home',path:'/',name:'Operations Dashboard',application:'CORE',viewPermission:'dashboard.view',state:'REPORTING_UNAVAILABLE'},
 {id:'stores.workspace',path:'/stores',name:'Stores',application:'STORES',viewPermission:'stores.workspace.view',state:'SOURCE_ONLY'},
 {id:'stores.operations',path:'/stores/operations',name:'IN / OUT / COUNT / TRANSFER',application:'STORES',viewPermission:'stores.operations.view',state:'SOURCE_ONLY'},
 {id:'masters.workspace',path:'/stores/masters',name:'Employee & Stores Masters',application:'MASTERS',viewPermission:'masters.workspace.view',state:'SOURCE_ONLY'},
 {id:'masters.employee.approvals',path:'/stores/masters/approvals',name:'Independent Employee Approvals',application:'MASTERS',viewPermission:'masters.employee.approvals.view',state:'SOURCE_ONLY'},
 {id:'items.versions',path:'/stores/items/[itemCode]',name:'Item Version Gallery',application:'STORES',viewPermission:'items.versions.view',state:'SOURCE_ONLY'},
 {id:'mis.workspace',path:'/mis',name:'MIS Readiness',application:'MIS',viewPermission:'mis.workspace.view',state:'REPORTING_UNAVAILABLE'},
]);
export type UiPrincipal=Readonly<{
 subject:string;active:boolean;systemRoles:readonly string[];
 viewPermissions:readonly string[];
 /** Synthetic proposal inputs ONLY. No current trusted IAM issuer exists. */
 grantableScopes?:readonly UiScope[];
 policyGeneration?:number;
}>;
/** Presentation only. SERVER + DB policy must be evaluated independently. */
export function mayDisplayRoute(principal:UiPrincipal|null,path:string):boolean{
 if(!principal?.active||!principal.subject.trim())return false;
 const route=C047_EXISTING_ROUTES.find(x=>x.path===path);
 if(!route)return false;
 return principal.systemRoles.includes('OWNER_SUPERADMIN')||
  principal.viewPermissions.includes(route.viewPermission);
}
export function mayPerformProtectedOperation(principal:UiPrincipal,operation:string):false{
 void principal;void operation;
 return false;
}
