export function projectStatusKey(state){
 const c=state?.connections||{};
 return JSON.stringify({projects:(c.projects||[]).filter(p=>p.active).map(p=>({id:p.id,name:p.name,repoKey:p.repoKey,localPaths:p.localPaths,locations:p.locations,relationVersion:p.relationVersion,identityConflict:p.identityConflict})),roots:c.roots,catalog:c.projectCatalog,bindings:c.contextBindings,scanned:c.projectScannedAt,stallDays:c.projectStallDays});
}
export function projectLaunchSignature(item){
 return JSON.stringify([item?.projectId,item?.root,item?.current?.path,item?.current?.state,item?.current?.fields,item?.current?.outline]);
}
