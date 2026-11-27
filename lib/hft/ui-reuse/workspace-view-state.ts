/** Persist only a whitelisted, non-sensitive view selector. No record/search/session data. */
export function workspaceView<T extends string>(url:string,key:string,allowed:readonly T[],fallback:T):T{
 const values=new URL(url).searchParams.getAll(key);
 return values.length===1&&allowed.includes(values[0] as T)?values[0] as T:fallback;
}
export function workspaceViewUrl<T extends string>(url:string,key:string,view:T,allowed:readonly T[]):string{
 if(!allowed.includes(view))throw Error('WORKSPACE_VIEW_INVALID');
 const u=new URL(url);u.searchParams.set(key,view);
 return u.pathname+u.search+u.hash;
}
