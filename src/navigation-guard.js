const guards=new Set();
export function registerPageGuard(guard){guards.add(guard);return()=>guards.delete(guard);}
export function pageLeaveProblem(){for(const guard of guards){const reason=guard();if(reason)return reason;}return '';}
