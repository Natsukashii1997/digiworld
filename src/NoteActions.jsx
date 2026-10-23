import React from 'react';
import {Trash2} from 'lucide-react';
import {NoteCopyButton} from './NoteCopyButton.jsx';
export function NoteActions({getDoc,onDelete,disabled=false,deleteLabel='删除便签'}){
 return <span className="sn-corner-actions"><NoteCopyButton getDoc={getDoc}/><button type="button" className="sn-ico delete" aria-label={deleteLabel} title={disabled?'保存后可删除':'删除便签'} disabled={disabled} onPointerDown={e=>{e.preventDefault();e.stopPropagation();}} onClick={onDelete}><Trash2 size={14}/></button></span>;
}
