// TypeScript 6 validates unresolved side-effect imports more strictly.
// Next.js owns CSS module loading at build/runtime; this declaration keeps
// typechecking aligned with that framework behavior without changing runtime code.
declare module "*.css";
