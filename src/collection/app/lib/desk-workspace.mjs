export const LOOSE_GROUP_ID = 'loose';

function sanitizeGroupName(name) {
  const trimmed = String(name || '').trim();
  return trimmed || '新分组';
}

function createGroupId() {
  return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAutoGroupId(category) {
  return `auto:${String(category || '未分类').trim() || '未分类'}`;
}

function normalizeDeskGroups(rawGroups) {
  return (Array.isArray(rawGroups) ? rawGroups : [])
    .filter((group) => group && typeof group.id === 'string' && group.id.trim() && !['inbox', LOOSE_GROUP_ID].includes(group.id))
    .map((group) => ({
      id: group.id.trim(),
      name: sanitizeGroupName(group.name),
      kind: group.kind === 'custom' ? 'custom' : 'auto',
      sourceCategory: typeof group.sourceCategory === 'string' ? group.sourceCategory.trim() : '',
    }));
}

function workspaceHasAssignments(rawState) {
  const groups = Array.isArray(rawState?.groups) ? rawState.groups : [];
  const noteGroupMap = rawState?.noteGroupMap && typeof rawState.noteGroupMap === 'object'
    ? rawState.noteGroupMap
    : {};
  const knownNoteIds = Array.isArray(rawState?.knownNoteIds) ? rawState.knownNoteIds : [];
  return groups.length > 0 || Object.keys(noteGroupMap).length > 0 || knownNoteIds.length > 0;
}

export function ensureDeskState(rawState, notes) {
  const safeNotes = Array.isArray(notes) ? notes : [];
  if (safeNotes.length === 0 && workspaceHasAssignments(rawState)) {
    const noteGroupMap = rawState?.noteGroupMap && typeof rawState.noteGroupMap === 'object'
      ? { ...rawState.noteGroupMap }
      : {};
    return {
      groups: normalizeDeskGroups(rawState?.groups),
      noteGroupMap,
      knownNoteIds: Array.isArray(rawState?.knownNoteIds)
        ? rawState.knownNoteIds.filter((noteId) => typeof noteId === 'string' && noteId.trim())
        : [],
    };
  }

  const noteIds = new Set(safeNotes.map((note) => note.id).filter(Boolean));
  const knownNoteIds = new Set(
    Array.isArray(rawState?.knownNoteIds)
      ? rawState.knownNoteIds.filter((noteId) => typeof noteId === 'string' && noteId.trim())
      : []
  );
  const categories = Array.from(
    new Set(
      safeNotes
        .map((note) => String(note?.category || '').trim())
        .filter(Boolean)
    )
  );
  const normalizedGroups = normalizeDeskGroups(rawState?.groups);

  const missingAutoGroups = categories.flatMap((category) => {
    const existing = normalizedGroups.find(
      (group) => group.kind === 'auto' && (group.sourceCategory === category || group.id === createAutoGroupId(category))
    );

    return existing ? [] : [{
      id: createAutoGroupId(category),
      name: category,
      kind: 'auto',
      sourceCategory: category,
    }];
  });

  const groups = [...normalizedGroups, ...missingAutoGroups];
  const validGroupIds = new Set(groups.map((group) => group.id));
  const rawMap = rawState?.noteGroupMap && typeof rawState.noteGroupMap === 'object' ? rawState.noteGroupMap : {};
  const noteGroupMap = {};

  for (const note of safeNotes) {
    const rawGroupId = typeof rawMap[note.id] === 'string' ? rawMap[note.id] : '';
    const nextGroupId = rawGroupId === 'inbox' ? LOOSE_GROUP_ID : rawGroupId;
    if (nextGroupId === LOOSE_GROUP_ID) {
      noteGroupMap[note.id] = LOOSE_GROUP_ID;
      continue;
    }
    if (validGroupIds.has(nextGroupId)) {
      noteGroupMap[note.id] = nextGroupId;
      continue;
    }

    const category = String(note?.category || '').trim();
    const autoGroup = groups.find((group) => group.kind === 'auto' && group.sourceCategory === category);
    const isKnownNote = knownNoteIds.has(note.id);
    noteGroupMap[note.id] = isKnownNote
      ? (autoGroup?.id || LOOSE_GROUP_ID)
      : (knownNoteIds.size > 0 ? LOOSE_GROUP_ID : (autoGroup?.id || LOOSE_GROUP_ID));
  }

  for (const noteId of Object.keys(noteGroupMap)) {
    if (!noteIds.has(noteId)) {
      delete noteGroupMap[noteId];
    }
  }

  const assignedGroupIds = new Set(Object.values(noteGroupMap));
  const populatedGroups = groups.filter(
    (group) => group.kind !== 'auto' || assignedGroupIds.has(group.id)
  );

  return {
    groups: populatedGroups,
    noteGroupMap,
    knownNoteIds: Array.from(noteIds),
  };
}

export function createDeskGroup(state, name) {
  const groups = Array.isArray(state?.groups)
    ? state.groups.filter((group) => !['inbox', LOOSE_GROUP_ID].includes(group.id))
    : [];

  return {
    ...state,
    groups: [
      ...groups,
      {
        id: createGroupId(),
        name: sanitizeGroupName(name),
        kind: 'custom',
        sourceCategory: '',
      },
    ],
  };
}

export function renameDeskGroup(state, groupId, name) {
  if (groupId === LOOSE_GROUP_ID || groupId === 'inbox') {
    return state;
  }

  return {
    ...state,
    groups: (state.groups || []).map((group) =>
      group.id === groupId
        ? { ...group, name: sanitizeGroupName(name) }
        : group
    ),
  };
}

export function moveNoteToGroup(state, noteId, groupId) {
  return moveNotesToGroup(state, [noteId], groupId);
}

export function moveNotesToGroup(state, noteIds, groupId) {
  const validGroupIds = new Set((state.groups || []).map((group) => group.id));
  const nextGroupId = validGroupIds.has(groupId) ? groupId : LOOSE_GROUP_ID;
  const nextMap = { ...(state.noteGroupMap || {}) };

  for (const noteId of Array.isArray(noteIds) ? noteIds : []) {
    if (typeof noteId === 'string' && noteId.trim()) {
      nextMap[noteId] = nextGroupId;
    }
  }

  return {
    ...state,
    noteGroupMap: nextMap,
  };
}

export function reorderDeskGroups(state, sourceGroupId, targetGroupId) {
  const groups = Array.isArray(state?.groups) ? [...state.groups] : [];
  const sourceIndex = groups.findIndex((group) => group.id === sourceGroupId);
  const targetIndex = groups.findIndex((group) => group.id === targetGroupId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state;

  const [sourceGroup] = groups.splice(sourceIndex, 1);
  const insertionIndex = groups.findIndex((group) => group.id === targetGroupId);
  groups.splice(insertionIndex, 0, sourceGroup);
  return { ...state, groups };
}

export function getNotesInGroup(notes, noteGroupMap, groupId) {
  return (Array.isArray(notes) ? notes : []).filter((note) => {
    const assignedGroupId = noteGroupMap?.[note.id];
    const normalizedGroupId = assignedGroupId === 'inbox'
      ? LOOSE_GROUP_ID
      : (assignedGroupId || LOOSE_GROUP_ID);
    return normalizedGroupId === groupId;
  });
}

export function deskWorkspaceHasContent(rawState) {
  return workspaceHasAssignments(rawState);
}

export function categoryForGroup(state, groupId) {
  if (!groupId || groupId === LOOSE_GROUP_ID || groupId === 'inbox') {
    return '';
  }

  const group = (state?.groups || []).find((item) => item.id === groupId);
  if (!group) return '';

  const category = group.kind === 'auto'
    ? (group.sourceCategory || group.name)
    : group.name;
  return sanitizeGroupName(category);
}

export function applyNoteCategoryUpdates(notes, updates) {
  const categoryById = updates instanceof Map
    ? updates
    : new Map(Object.entries(updates && typeof updates === 'object' && !Array.isArray(updates) ? updates : {}));

  return (Array.isArray(notes) ? notes : []).map((note) => {
    const nextCategory = String(categoryById.get(note.id) || '').trim();
    if (!nextCategory || nextCategory === note.category) return note;
    return { ...note, category: nextCategory };
  });
}
