/** Edge-safe qualification-only boundary. Never admits application data routes. */
type Env=Readonly<Record<string,string|undefined>>;
export function identityProofModeAdmitted(env:Env):boolean{
 return env.HFT_LIVE_R1_IDENTITY_PROOF_MODE==='qualification-only'&&
  env.HFT_ENVIRONMENT==='production-qualification'&&env.VERCEL_ENV==='preview'&&
  env.NODE_ENV==='production'&&env.HFT_LIVE_POSTING_ENABLED==='false'&&
  env.HFT_AUTH_SOURCE==='verified'&&
  env.HFT_LIVE_R1_PROFILE===undefined&&env.HFT_LIVE_R1_PASSWORD===undefined&&
  env.HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON===undefined&&
  env.HFT_DRAFT_RUNTIME_PROFILE===undefined&&env.HFT_STORES_RUNTIME_PROFILE===undefined&&
  env.HFT_MASTERS_RUNTIME_PROFILE===undefined&&env.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE===undefined;
}
export function identityProofPathAdmitted(path:string,env:Env):boolean{
 return identityProofModeAdmitted(env)&&
  (path==='/api/hft/live-masters/auth/start'||path==='/api/hft/live-masters/auth/callback');
}
