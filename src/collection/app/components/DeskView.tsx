import { Reading, ReadReveal } from '../../../ScanMotion.jsx';
import { flyData } from '../../../data-flight.js';
import { copyText } from '../../../data-flight.js';
/* Hallmark · component: search + setup dialog · genre: modern-minimal
 * states: default · hover · focus · active · disabled · loading · error · success
 * pre-emit critique: P5 H5 E4 S5 R5 V4
 */
'use client';

import { memo, useCallback, useState, useEffect, useRef, useMemo, type DragEvent, type MouseEvent } from 'react';
import { motion, AnimatePresence, styleOf } from '../../motion';
import { useDialogFocus } from '../../useDialogFocus';
import { PageHeading, ScrollFade } from '../../../components.jsx';
import { AgentSprite, useReducedMotion } from '../../../v14.jsx';
import { characterOf } from '../../../characters.js';
import {
  X,
  Heart,
  Loader2,
  Plus,
  Pencil,
  Check,
  BookMarked,
  Trash2,
  Search,
  Puzzle,
  Bot,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Play,
} from 'lucide-react';
import { Note } from '../types/xiaohongshu';
import { useNotes, useApp } from '../lib/store';
import {
  formatNumber,
  connectLocalAgent,
  deleteStoredNote,
  formatDate,
  getDeskWorkspace,
  getLocalServiceHealth,
  getLocalSetupInfo,
  importSharedNote,
  openBrowserExtensionSetup,
  saveDeskWorkspace,
  updateNoteCategories,
  pairExtension,
  revokeExtension,
  adoptRecycleRevision,
  getRecycle,
  organizeRecycle,
  openRecycleFolder,
} from '../lib/xhs-client';
import type { AgentClient, LocalServiceHealth, LocalSetupInfo } from '../lib/xhs-client';
import {
  acceptsExternalNoteDrag,
  parseDraggedCardInput,
  selectDraggedNoteInput,
} from '../lib/drag-import.mjs';
import {
  CARD_H,
  CARD_IMAGE_H,
  CARD_TITLE_LINES,
  CARD_W,
  EXPANDED_GRID_GAP_X,
  EXPANDED_GRID_GAP_Y,
  getDragAutoScrollVelocity,
  getDeskGroupColumnCount,
  getExpandedGridCenterX,
} from '../lib/desk-card-metrics.mjs';
import { shouldUseLightweightCanvas } from '../lib/desk-performance.mjs';
import {
  formatMediaTime,
  paginatePlainText,
  paginateTimedSegments,
} from '../lib/video-transcript.mjs';
import { stripDuplicateTagSuffix } from '../lib/note-content.mjs';
import { filterNotesByQuery } from '../../scripts/lib/note-search.mjs';
import {
  applyNoteCategoryUpdates,
  categoryForGroup,
  createDeskGroup,
  deskWorkspaceHasContent,
  ensureDeskState,
  getNotesInGroup,
  LOOSE_GROUP_ID,
  moveNoteToGroup,
  moveNotesToGroup,
  renameDeskGroup,
  reorderDeskGroups,
} from '../lib/desk-workspace.mjs';

// ── Constants ─────────────────────────────────────────────────────────────────
const DRAG_PAYLOAD_PREFIX = 'KANKAN_NOTE:';
const GROUP_TAG_H = 44;
const GROUP_TAG_GAP = 8;

type ImportPhase = 'idle' | 'dragging' | 'recognized' | 'processing' | 'complete' | 'error';

type ImportFeedback = {
  phase: ImportPhase;
  title: string;
  message: string;
};

const IDLE_IMPORT_FEEDBACK: ImportFeedback = { phase: 'idle', title: '', message: '' };

function getDraggedNoteTitle(input: string): string {
  const card = parseDraggedCardInput(input);
  if (card?.title) return card.title;

  const markerIndex = input.indexOf(DRAG_PAYLOAD_PREFIX);
  if (markerIndex === -1) return '这条笔记';

  try {
    const payload = JSON.parse(input.slice(markerIndex + DRAG_PAYLOAD_PREFIX.length));
    return typeof payload?.title === 'string' && payload.title.trim()
      ? payload.title.trim().slice(0, 52)
      : '这条笔记';
  } catch {
    return '这条笔记';
  }
}

// ── Category colors ───────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  工作方法: '#829987', 设计美学: '#6B8799', 学习方法: '#B89A52',
  身心健康: '#CC8C73', 食物科学: '#8BA882', 阅读思考: '#9B8EA0',
  摄影:     '#7A95A8', 生活哲学: '#C4A882', 咖啡科学: '#A67C52',
  植物:     '#6E9478', 空间美学: '#8B9AB5', 茶文化:   '#7B8F6E',
  艺术:     '#B5849B', 创作:     '#B07856', 户外:     '#6E8E7A',
  AI工具:   '#6B8799', 编程开发: '#5E7FA3', 旅行户外: '#6E8E7A',
  美食餐饮: '#A67C52', 影像创作: '#B07856', 方法论:   '#829987',
  生活方式: '#8BA882',
};
const catColor = (c: string) => CAT_COLORS[c] ?? '#829987';

// ── Seeded random ─────────────────────────────────────────────────────────────
function sr(seed: number): number {
  return ((seed * 9301 + 49297) % 233280) / 233280;
}

type Pos = { x: number; y: number; rot: number; z: number; breathOffset: number };
type DeskGroup = {
  id: string;
  name: string;
  kind: 'auto' | 'custom';
  sourceCategory?: string;
};
type DeskState = {
  groups: DeskGroup[];
  noteGroupMap: Record<string, string>;
  knownNoteIds?: string[];
};
type GroupLabel = {
  groupId: string;
  name: string;
  y: number;
  // 铭牌上沿：位于本组纸堆或展开网格的实际底沿下方。
  tagTop: number;
  x: number;
  color: string;
  kind: DeskGroup['kind'];
  noteCount: number;
};
const DESK_WORKSPACE_STORAGE_KEY = 'digital-world:collection-draft:v2';
type DeskDraft = { baseRevision:number; workspace:DeskState };

function readLocalDeskWorkspace(): DeskDraft | null {
  try {
    const saved = window.localStorage.getItem(DESK_WORKSPACE_STORAGE_KEY);
    const draft=saved ? JSON.parse(saved) : null;
    return Number.isInteger(draft?.baseRevision)&&Array.isArray(draft?.workspace?.groups)&&draft?.workspace?.noteGroupMap ? draft : null;
  } catch {
    return null;
  }
}

function setElementDragImage(event: DragEvent<HTMLElement>, element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  // The native drag preview is appended outside the page; preserve only its rendered appearance.
  const appearance = window.getComputedStyle(element);
  clone.classList.add('collection-module');
  for (const key of ['width','height','padding','border','borderRadius','background','color','boxShadow','display','gap','alignItems'] as const) clone.style[key] = appearance[key];
  clone.style.position = 'absolute';
  clone.style.top = '-2000px';
  clone.style.left = '0';
  clone.style.margin = '0';
  clone.style.transform = 'none';
  clone.style.opacity = '0.92';
  clone.style.pointerEvents = 'none';
  clone.style.zIndex = '-1';
  document.body.appendChild(clone);
  event.dataTransfer.setDragImage(clone, Math.min(element.offsetWidth / 2, 78), 22);
  return clone;
}

// ── Organized layout (cards grouped by category clusters) ─────────────────────
type OrgResult = {
  positions: Record<string, Pos>;
  labels: GroupLabel[];
};

function buildOrganized(
  notes: Note[],
  groups: DeskGroup[],
  noteGroupMap: Record<string, string>,
  w: number,
  activeGroupId: string | null,
  hideEmptyGroups = false,
): OrgResult {
  const looseNotes = getNotesInGroup(notes, noteGroupMap, LOOSE_GROUP_ID);
  const visibleGroups = groups.filter((group) => {
    const noteCount = getNotesInGroup(notes, noteGroupMap, group.id).length;
    if (hideEmptyGroups) return noteCount > 0;
    if (group.kind === 'auto') return noteCount > 0;
    return true;
  });
  const grouped: Record<string, Note[]> = {};
  visibleGroups.forEach((group) => {
    grouped[group.id] = getNotesInGroup(notes, noteGroupMap, group.id);
  });

  const clusterCols = getDeskGroupColumnCount(w);
  const clusterPadX = w >= 1280 ? 42 : 60;
  const clusterH = 340;
  const availableW = w - clusterPadX * 2;
  const clusterW = availableW / clusterCols;
  const looseCols = Math.max(1, Math.min(looseNotes.length, w > 900 ? 5 : 3, 1 + Math.floor(Math.max(0,w-48-CARD_W)/(CARD_W+28))));
  const looseRows = looseNotes.length > 0 ? Math.ceil(looseNotes.length / looseCols) : 0;
  const looseAreaH = looseRows > 0 ? looseRows * (CARD_H + 34) + 44 : 0;

  const positions: Record<string, Pos> = {};
  const labels: OrgResult['labels'] = [];
  let currentRow = 0, rowShift = 0, rowBottom = 0;

  visibleGroups.forEach((group, ci) => {
    const col = ci % clusterCols;
    const row = Math.floor(ci / clusterCols);

    const cx = clusterPadX + col * clusterW + clusterW / 2;
    const baseY = 20 + looseAreaH + row * clusterH + clusterH / 2;
    if (row > currentRow) {
      // 展开的多行卡片与铭牌占用空间后，下一行从其下方继续。
      rowShift = Math.max(rowShift, rowBottom + 24 - (baseY - CARD_H / 2 - 40));
      currentRow = row;
    }
    const cy = baseY + rowShift;

    const labelX = cx;
    const groupColor = group.kind === 'auto'
      ? catColor(group.sourceCategory || group.name)
      : '#829987';
    labels.push({
      groupId: group.id,
      name: group.name,
      y: cy - 155,
      tagTop: cy + CARD_H / 2 + GROUP_TAG_GAP,
      x: labelX,
      color: groupColor,
      kind: group.kind,
      noteCount: grouped[group.id].length,
    });

    const catNotes = grouped[group.id];
    const isExpanded = group.id === activeGroupId;

    let stackBottom = -Infinity;
    catNotes.forEach((note, i) => {
      // 保留原有纸堆位置与倾斜。
      const stackAngle = (i * 1.618) % (Math.PI * 2);
      const stackRadius = Math.min(i * 3, 25) + (sr(i * 3 + ci) - 0.5) * 20;
      const stackY = cy + Math.sin(stackAngle) * stackRadius * 0.6 + (sr(i * 11 + ci) - 0.5) * 15;
      const stackRot = (sr(i * 13 + ci * 3 + 2) - 0.5) * 28;
      if (isExpanded) {
        // 展开状态：以纸堆中心向下进行网格平铺
        const cols = Math.max(1,Math.min(w > 600 ? 3 : 2,1+Math.floor(Math.max(0,w-48-CARD_W)/EXPANDED_GRID_GAP_X)));
        const gapX = EXPANDED_GRID_GAP_X;
        const gapY = EXPANDED_GRID_GAP_Y;
        const gridCol = i % cols;
        const gridRow = Math.floor(i / cols);
        const gridCenterX = getExpandedGridCenterX(cx, w, catNotes.length, cols);
        labels[labels.length - 1].x = gridCenterX;

        const totalWidth = (Math.min(catNotes.length, cols) - 1) * gapX;
        const offsetX = gridCol * gapX - totalWidth / 2;
        const offsetY = gridRow * gapY;

        positions[note.id] = {
          x: gridCenterX + offsetX,
          y: cy + 30 + offsetY,
          rot: 0,
          z: 300 + i,
          breathOffset: 0
        };
      } else {
        // 折叠状态：原本的自然凌乱堆叠
        const offsetX = Math.cos(stackAngle) * stackRadius + (sr(i * 7 + ci) - 0.5) * 20;

        positions[note.id] = {
          x: cx + offsetX,
          y: stackY,
          rot: stackRot,
          z: Math.floor(sr(i * 17 + ci * 2 + 3) * 20) + ci * 15,
          breathOffset: sr(i * 19 + ci) * 3
        };
      }
      const placed = positions[note.id], tilt = Math.abs(placed.rot) * Math.PI / 180;
      stackBottom = Math.max(stackBottom, placed.y + (CARD_H / 2) * Math.cos(tilt) + (CARD_W / 2) * Math.sin(tilt));
    });
    const label = labels[labels.length - 1];
    if (Number.isFinite(stackBottom)) label.tagTop = stackBottom + GROUP_TAG_GAP;
    rowBottom = Math.max(rowBottom, label.tagTop + GROUP_TAG_H);
  });

  looseNotes.forEach((note, i) => {
    const row = Math.floor(i / looseCols);
    const col = i % looseCols;
    const rowStart = row * looseCols;
    const itemsInRow = Math.min(looseCols, looseNotes.length - rowStart);
    const gapX = Math.min(230, Math.max(CARD_W + 28, (w - 180) / Math.max(itemsInRow, 1)));
    const rowWidth = (itemsInRow - 1) * gapX;
    const jitterX = (sr(i * 23 + 5) - 0.5) * 30;
    const jitterY = (sr(i * 29 + 7) - 0.5) * 20;

    positions[note.id] = {
      x: w / 2 - rowWidth / 2 + col * gapX + jitterX,
      y: 128 + row * (CARD_H + 34) + jitterY,
      rot: (sr(i * 31 + 11) - 0.5) * 16,
      z: 500 + i,
      breathOffset: sr(i * 37 + 13) * 3,
    };
  });

  return { positions, labels };
}

// ── Expanded note reader ──────────────────────────────────────────────────────
function ExpandedCard({
  note,
  onClose,
  onDelete,
  isDeleting,
}: {
  note: Note;
  onClose: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const dialogRef = useDialogFocus(onClose);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const rawContent = stripDuplicateTagSuffix(note.rawContent || '', note.tags);
  const ocrText = (note.ocrText || '').trim();
  const [readerPage, setReaderPage] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceImageUrls = Array.from(new Set(
    note.imageUrls?.length ? note.imageUrls : (note.coverUrl ? [note.coverUrl] : []),
  ));
  const imageUrls = sourceImageUrls.filter(imageUrl => !failedImageUrls.has(imageUrl));
  const resolvedImageIndex = Math.min(activeImageIndex, Math.max(imageUrls.length - 1, 0));
  const activeImageUrl = imageUrls[resolvedImageIndex];
  const isVideo = note.type === 'video' && Boolean(note.videoUrl);
  const notePages = useMemo(
    () => paginatePlainText(rawContent || '这条笔记没有可见正文。') as string[],
    [rawContent],
  );
  const transcriptPages = useMemo(
    () => paginateTimedSegments(note.transcriptSegments || []) as Array<Array<{
      start: number;
      duration: number;
      text: string;
    }>>,
    [note.transcriptSegments],
  );
  const [readerTab, setReaderTab] = useState<'note' | 'transcript' | 'ocr'>(
    note.type === 'video' && transcriptPages.length ? 'transcript'
      : rawContent ? 'note' : ocrText ? 'ocr' : note.type === 'video' ? 'transcript' : 'note',
  );
  const readerPages = readerTab === 'transcript'
    ? transcriptPages
    : notePages;
  const resolvedReaderPage = Math.min(readerPage, Math.max(readerPages.length - 1, 0));

  const changeReaderTab = (tab: 'note' | 'transcript' | 'ocr') => {
    setReaderTab(tab);
    setReaderPage(0);
  };

  const seekVideo = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, time);
    void videoRef.current.play();
  };

  const markImageFailed = (imageUrl: string) => {
    setFailedImageUrls(current => {
      if (current.has(imageUrl)) return current;
      const next = new Set(current);
      next.add(imageUrl);
      return next;
    });
  };

  return (
    <motion.div className="collection-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div ref={dialogRef} className="collection-reader" role="dialog" aria-modal="true" aria-label={note.title} tabIndex={-1}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className="collection-gallery">
          {!isVideo && imageUrls.length > 0 && <span className="collection-image-page">{String(resolvedImageIndex + 1).padStart(2, '0')} / {String(imageUrls.length).padStart(2, '0')}</span>}
          <div className="collection-media-stage">
            {isVideo ? <video ref={videoRef} src={note.videoUrl} poster={note.coverUrl || undefined} controls playsInline preload="metadata" />
              : activeImageUrl ? <img src={activeImageUrl} alt={note.title} draggable={false} onError={() => markImageFailed(activeImageUrl)} />
              : <div className="collection-media-fallback">{note.title.slice(0, 1)}</div>}
          </div>
          {!isVideo && imageUrls.length > 1 && <div className="collection-thumbnails" aria-label="图片列表">
            {imageUrls.map((imageUrl, index) => <button key={imageUrl} type="button" onClick={() => setActiveImageIndex(index)}
              className="collection-thumbnail" aria-label={`查看第 ${index + 1} 张图片`} aria-pressed={index === resolvedImageIndex}>
              <img src={imageUrl} alt="" draggable={false} onError={() => markImageFailed(imageUrl)} />
            </button>)}
          </div>}
        </div>
        <div className="collection-reader-info">
          <div className="collection-reader-bar">
            <span className="collection-reader-category" title={note.category}>{note.category}</span>
            {/^https?:\/\//i.test(note.sourceUrl||'') && <a className="collection-key collection-original-link" href={note.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="查看原帖"><ExternalLink size={14}/>原帖</a>}
            {confirmingDelete ? <div className="collection-delete-confirm">
              <button type="button" className="collection-key" onClick={() => setConfirmingDelete(false)} disabled={isDeleting}>取消</button>
              <button type="button" className="collection-key collection-danger" onClick={onDelete} disabled={isDeleting}>
                {isDeleting ? <Reading mini label="处理收藏操作"/> : <Trash2 size={14}/>}{isDeleting ? '删除中' : '确认删除'}
              </button>
            </div> : <button type="button" className="collection-key collection-danger" onClick={() => setConfirmingDelete(true)}><Trash2 size={14}/>删除</button>}
            <button type="button" className="collection-key collection-icon" onClick={onClose} aria-label="关闭"><X size={16}/></button>
          </div>
          <h2 className="collection-reader-title">{note.title}</h2>
          <div className="collection-reader-meta"><span>@{note.author.name}</span><span>{formatDate(note.savedAt)}</span>
            <span><Heart size={13}/> {formatNumber(note.likes)}</span><span><BookMarked size={13}/> {formatNumber(note.collects)}</span>
          </div>
          <div className="collection-reader-tabs" role="radiogroup" aria-label="阅读内容" onKeyDown={event => {
            const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
            if (!keys.includes(event.key)) return;
            const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
            const current = radios.indexOf(event.target as HTMLButtonElement);
            if (current < 0) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? radios.length - 1
              : (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + radios.length) % radios.length;
            radios[next].focus();
            radios[next].click();
          }}>
            {rawContent && <button className="collection-key" role="radio" aria-checked={readerTab === 'note'} tabIndex={readerTab === 'note' ? 0 : -1} onClick={() => changeReaderTab('note')}>{note.type === 'video' ? '笔记正文' : '正文'}</button>}
            {ocrText && <button className="collection-key" role="radio" aria-checked={readerTab === 'ocr'} tabIndex={readerTab === 'ocr' ? 0 : -1} onClick={() => changeReaderTab('ocr')}>图片文字</button>}
            {transcriptPages.length > 0 && <button className="collection-key" role="radio" aria-checked={readerTab === 'transcript'} tabIndex={readerTab === 'transcript' ? 0 : -1} onClick={() => changeReaderTab('transcript')}>视频文稿</button>}
          </div>
          {readerTab === 'note' && <p className="collection-reader-body">{notePages[resolvedReaderPage] || '这条笔记没有可见正文。'}</p>}
          {readerTab === 'ocr' && <p className="collection-reader-body">{ocrText}</p>}
          {readerTab === 'transcript' && (transcriptPages.length > 0 ? <div className="collection-transcript">
            {transcriptPages[resolvedReaderPage]?.map((segment, index) => <div key={`${segment.start}-${index}`} className="collection-transcript-segment">
              <button type="button" className="collection-key collection-timestamp" onClick={() => seekVideo(segment.start)}>{formatMediaTime(segment.start)}</button><p className="collection-reader-body">{segment.text}</p>
            </div>)}
          </div> : <p className="collection-notice">{note.videoError || '这条视频没有识别到可转写的语音。'}</p>)}
          {readerTab !== 'ocr' && readerPages.length > 1 && <div className="collection-reader-pagination">
            <button type="button" className="collection-key collection-icon" aria-label="上一页" onClick={() => setReaderPage(page => Math.max(0, page - 1))} disabled={resolvedReaderPage === 0}><ChevronLeft size={14}/></button>
            <span>{resolvedReaderPage + 1} / {readerPages.length}</span>
            <button type="button" className="collection-key collection-icon" aria-label="下一页" onClick={() => setReaderPage(page => Math.min(readerPages.length - 1, page + 1))} disabled={resolvedReaderPage >= readerPages.length - 1}><ChevronRight size={14}/></button>
          </div>}
          {readerTab === 'note' && Array.isArray(note.tags) && note.tags.length > 0 && <div className="collection-reader-tags">{note.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>}
          {note.mediaStatus === 'partial' && <p className="collection-notice">{note.mediaError || '部分图片或文字未能完整保存。'}</p>}
          {note.videoStatus === 'partial' && note.videoError && readerTab !== 'transcript' && <p className="collection-notice">{note.videoError}</p>}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Individual card ───────────────────────────────────────────────────────────
const DeskCard = memo(function DeskCard({
  note, pos, isDimmed, lightweight, isSelected, selectedCount, claimEntrance, entranceReady, entranceIndex, newArrival,
  showCategory = true, onClick, onDragStart, onDragEnd
}: {
  note: Note;
  pos: Pos;
  isDimmed?: boolean;
  lightweight?: boolean;
  isSelected?: boolean;
  selectedCount?: number;
  claimEntrance: (id: string) => boolean;
  entranceReady: boolean;
  entranceIndex: number;
  newArrival: boolean;
  showCategory?: boolean;
  onClick: (note: Note, event: MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (noteId: string, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  const reduced = useReducedMotion();
  const [arriving,setArriving] = useState(false);
  const [hovered,setHovered] = useState(false);
  const entranceTimer = useRef<number|null>(null);
  useEffect(() => () => {if(entranceTimer.current !== null)window.clearTimeout(entranceTimer.current);}, []);
  useEffect(() => {if(!entranceReady || !claimEntrance(note.id) || reduced)return;setArriving(true);entranceTimer.current=window.setTimeout(() => {setArriving(false);entranceTimer.current=null;},600);}, [claimEntrance,entranceReady,note.id]);
  useEffect(() => {if(reduced){setArriving(false);if(entranceTimer.current !== null)window.clearTimeout(entranceTimer.current);entranceTimer.current=null;}}, [reduced]);
  return (
    <motion.div
      className="collection-card-position"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      aria-hidden={isDimmed || undefined}
      inert={isDimmed || undefined}
      tabIndex={isDimmed ? -1 : 0}
      aria-label={`阅读收藏：${note.title}`}
      aria-pressed={!!isSelected}
      data-note-id={note.id}
      onKeyDown={event=>{if(!isDimmed && (event.key==='Enter' || event.key===' ')){event.preventDefault();onClick(note,event as any);}}}
      initial={false}
      animate={{
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        rotate: pos.rot,
        zIndex: isDimmed ? 0 : pos.z,
        opacity: isDimmed ? 0.35 : 1,
        scale: isDimmed ? 0.75 : 1,
      }}
      transition={{ duration: 0.24, delay: Math.min(entranceIndex * 0.03, 0.15), ease: 'easeOut' }}
      whileHover={isDimmed ? undefined : { y: Math.round(pos.y) - 4, zIndex: pos.z + 100, transition: { duration: 0.15 } }}
      onClick={isDimmed ? undefined : (event) => onClick(note, event)}
      data-desk-interactive="true"
      style={styleOf({
        position: 'absolute',
        width: CARD_W,
        left: -CARD_W / 2,
        top: -CARD_H / 2,
        cursor: isDimmed ? 'default' : 'grab',
        pointerEvents: isDimmed ? 'none' : 'auto',
        transformOrigin: 'center center',
      })}
    >
      <div
        className={`desk-native-drag collection-card-arrival${arriving ? " is-arriving" : ""}${newArrival ? " is-new" : ""}`}
        data-arriving={arriving || undefined}
        draggable={!isDimmed}
        onMouseDown={() => window.getSelection()?.removeAllRanges()}
        onDragStartCapture={(event) => onDragStart?.(note.id, event)}
        onDragEndCapture={() => onDragEnd?.()}
        style={styleOf({ '--arrival-delay': `${Math.min(entranceIndex * 40, 200)}ms` })}
      >
      <motion.div
        className="collection-card-breathe"
        animate={lightweight || arriving || hovered ? { y: 0 } : { y: [0, -2, 0] }}
        transition={lightweight || arriving || hovered ? { duration: 0 } : { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: pos.breathOffset }}
        style={styleOf({ width: '100%', height: '100%' })}
      >
        {/* Keep the original float without continuously scaling the text raster. */}
        <div className="collection-paper" data-selected={isSelected || undefined}>
          {isSelected && <span className="collection-selected-mark"><Check size={13} strokeWidth={2.5}/></span>}
          {isSelected && (selectedCount || 0) > 1 && (
            <span className="collection-selected-count">
              {selectedCount}
            </span>
          )}
          <div className="collection-cover">
            {note.coverUrl ? (
              <>
                {/* External note images cannot use Next Image without a stable host allowlist. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={note.coverUrl}
                  alt={note.title}
                  draggable={false}
                  decoding="async"
                  className="collection-cover-image"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                />
              </>
            ) : (
              <div className="collection-cover-fallback">
                {note.title.slice(0, 1)}
              </div>
            )}
            {note.type === 'video' && (
              <span className="collection-video-mark">
                <Play size={10} fill="currentColor" strokeWidth={1.5}  />
              </span>
            )}
          </div>

          <div className="collection-card-copy" >
            {showCategory && <span className="collection-card-category" >
              {note.category}
            </span>}
            <p className="collection-card-title" >
              {note.title}
            </p>
          </div>
        </div>
      </motion.div>
      </div>
    </motion.div>
  );
});

type SetupPanel = 'extension' | 'agent';

function SetupDialog({
  panel,
  info,
  loading,
  message,
  connectingClient,
  connectedClients,
  onClose,
  onOpenExtension,
  onConnectAgent,
}: {
  panel: SetupPanel;
  info: LocalSetupInfo | null;
  loading: boolean;
  message: string;
  connectingClient: AgentClient | null;
  connectedClients: Set<AgentClient>;
  onClose: () => void;
  onOpenExtension: () => void;
  onConnectAgent: (client: AgentClient) => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  const [pairingToken,setPairingToken]=useState('');
  const [pairError,setPairError]=useState('');
  const [pairFailed,setPairFailed]=useState(false);
  return (
    <motion.div className="collection-overlay collection-setup-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div ref={dialogRef} className="collection-setup" role="dialog" aria-modal="true" aria-label={panel === 'extension' ? '浏览器插件' : '连接 Agent'} tabIndex={-1}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <header className="collection-dialog-heading"><div><span className="collection-eyebrow">{panel === 'extension' ? 'EXTENSION' : 'MCP · READ ONLY'}</span><h2>{panel === 'extension' ? '浏览器插件' : '让 Agent 读你的收藏'}</h2></div>
          <button type="button" className="collection-key collection-icon" onClick={onClose} aria-label="关闭"><X size={16}/></button>
        </header>
        <div className="collection-dialog-body">
          <ReadReveal pending={loading} ready={!!info}/>
          {loading ? <div className="collection-loading" role="status" aria-label="读取本地配置"><Reading label="读取本地配置"/></div>
            : panel === 'extension' ? <>
              <div className="collection-setup-state" role="status"><span className="collection-state-dot"/>{info ? (info.extension.available ? '插件文件夹已就绪' : '未找到插件文件夹') : '插件状态未读取'}{info?.extension.version && <span>v{info.extension.version}</span>}</div>
              <div className="collection-step"><span className="collection-step-number">1</span><div><h3>安装插件</h3><p>在 Chrome 扩展页开启开发者模式，加载下面这个文件夹。</p>
                <p className="collection-path" title={info?.extension.path}>{info?.extension.path || '路径未读取'}</p>
                <div className="collection-action-row"><button type="button" className="collection-key" disabled={!info?.extension.path} onClick={() => copyText(info!.extension.path).then(() => {setPairError('路径已复制');setPairFailed(false);}).catch(() => {setPairError('复制失败，请手动选择路径');setPairFailed(true);})}>复制路径</button>
                  <button type="button" className="collection-key" onClick={onOpenExtension} disabled={!info?.extension.available}><ExternalLink size={15}/>配置 Chrome 插件</button></div>
              </div></div>
              <div className="collection-step"><span className="collection-step-number">2</span><div><h3>配对</h3><p>生成一次性配对码，粘贴到插件里并保存。</p>
                <button type="button" className="collection-key collection-pair" onClick={async () => {try {const result = await pairExtension();setPairingToken(result.token);setPairError('');setPairFailed(false);} catch(error) {setPairError(error instanceof Error ? error.message : '配对失败');setPairFailed(true);}}}>生成插件配对码</button>
                {pairingToken && <div className="collection-pair-label"><label htmlFor="collection-pair-token">配对码</label><input id="collection-pair-token" readOnly value={pairingToken} aria-label="插件配对码" onFocus={event => event.currentTarget.select()}/><button type="button" className="collection-key" onClick={() => copyText(pairingToken).then(() => {setPairError('配对码已复制');setPairFailed(false);}).catch(() => {setPairError('复制失败，请手动选择配对码');setPairFailed(true);})}>复制配对码</button></div>}
              </div></div>
              <div className="collection-step"><span className="collection-step-number">3</span><div><h3>在小红书点「收藏」</h3><p>帖子会落到这张桌上；也可以把帖子卡片直接拖进来。</p></div></div>
              <div className="collection-danger-zone"><p>不想再让这个浏览器收录？</p><button type="button" className="collection-key collection-danger collection-revoke" onClick={async () => {try {await revokeExtension();setPairingToken('');setPairError('配对已撤销');setPairFailed(false);} catch(error) {setPairError(error instanceof Error ? error.message : '撤销失败');setPairFailed(true);}}}>撤销插件配对</button></div>
              {pairError && <p className={`collection-notice${pairFailed ? ' is-error' : ''}`} role={pairFailed ? 'alert' : 'status'}>{pairError}</p>}
            </> : <>
              <p className="collection-agent-intro">复制配置后，粘贴进该 Agent 的 MCP 设置。它只能搜索和阅读收藏，不能修改或删除。</p>
              <div className="collection-tools"><span>search_saved_notes</span><span>read_saved_note</span></div>
              {([['claude', 'Claude Code'], ['codex', 'Codex']] as const).map(([client, label]) => {
                const detected = info?.agent.clients[client].available, copied = connectedClients.has(client), copying = connectingClient === client;
                return <div className="collection-agent-row" key={client}><div className="collection-agent-portrait"><AgentSprite agent={client} mode="body" fit={52}/></div><div className="collection-agent-name"><strong>{label}</strong><small>{characterOf(client)?.name}</small></div>
                  <button type="button" className="collection-key" onClick={() => onConnectAgent(client)} disabled={!detected || copying}>
                    {copying ? <Reading mini label="处理收藏操作"/> : copied ? <Check size={14}/> : <Bot size={14}/>}{copying ? '准备中' : copied ? '已复制' : detected ? '复制配置' : '不可用'}
                  </button>
                </div>;
              })}
            </>}
          {message && <p className="collection-notice" role="status">{message}</p>}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function DeskView() {
  const { notes, setNotes } = useNotes();
  const { state, dispatch } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const deskStateHydratedRef = useRef(false);
  const dragScrollFrameRef = useRef<number | null>(null);
  const dragScrollVelocityRef = useRef(0);
  const draggedNoteIdsRef = useRef<string[]>([]);
  const draggedGroupIdRef = useRef<string | null>(null);
  const dragImageRef = useRef<HTMLElement | null>(null);

  const [deskState, setDeskState] = useState<DeskState>({ groups: [], noteGroupMap: {}, knownNoteIds: [] });
  const [deskReady,setDeskReady]=useState(false);
  const [deskError,setDeskError]=useState('');
  const [deskSaving,setDeskSaving]=useState(false);
  const savedDeskRef=useRef('');
  const savedRevisionRef=useRef(0);
  const [recoverableDraft,setRecoverableDraft]=useState<DeskDraft|null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Note | null>(null);
  const [dims, setDims] = useState({ w: 1200, h: 800 });
  const [serviceHealth, setServiceHealth] = useState<LocalServiceHealth>({ ok: false, source: 'sidecar' });
  const [importFeedback, setImportFeedback] = useState<ImportFeedback>(IDLE_IMPORT_FEEDBACK);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [draggedNoteIds, setDraggedNoteIds] = useState<string[]>([]);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
  const [groupDropTargetId, setGroupDropTargetId] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const reducedMotion = useReducedMotion();
  const [helpOpen, setHelpOpen] = useState(false);
  const entranceIds = useRef(new Set<string>());
  const entrancePool = useRef<Set<string>|null>(null);
  if(deskReady && !state.isLoading && entrancePool.current === null)entrancePool.current=new Set(notes.map(note => note.id));
  const entranceClosed = useRef(false);
  const claimEntrance = useCallback((id: string) => {if(entranceClosed.current || !entrancePool.current?.has(id) || entranceIds.current.has(id))return false;entranceIds.current.add(id);return true;}, []);
  useEffect(() => {if(!deskReady || state.isLoading || entranceClosed.current)return;const timer=window.setTimeout(() => {entranceClosed.current=true;},600);return () => window.clearTimeout(timer);}, [deskReady,state.isLoading]);
  const [newArrivalIds,setNewArrivalIds]=useState<Set<string>>(() => new Set());
  const seenArrivalIds = useRef<Set<string>|null>(null);
  const arrivalTimer = useRef<number|null>(null);
  useEffect(() => () => {if(arrivalTimer.current !== null)window.clearTimeout(arrivalTimer.current);}, []);
  const [importWarning,setImportWarning]=useState('');
  useEffect(() => {if(reducedMotion)setNewArrivalIds(new Set());}, [reducedMotion]);
  useEffect(() => {
    if(!deskReady || state.isLoading)return;
    if(!seenArrivalIds.current){seenArrivalIds.current=new Set(notes.map(note => note.id));return;}
    const fresh=notes.filter(note => !seenArrivalIds.current!.has(note.id));
    notes.forEach(note => seenArrivalIds.current!.add(note.id));
    const ready=fresh.filter(note => note.mediaStatus !== 'partial' && note.videoStatus !== 'partial');
    if(!ready.length)return;
    flyData();
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    setNewArrivalIds(new Set(ready.map(note => note.id)));
    if(arrivalTimer.current !== null)window.clearTimeout(arrivalTimer.current);
    arrivalTimer.current=window.setTimeout(() => {setNewArrivalIds(new Set());arrivalTimer.current=null;},600);
  }, [notes,deskReady,state.isLoading]);
  const [setupPanel, setSetupPanel] = useState<SetupPanel | null>(null);
  const [localDeleteBusy,setLocalDeleteBusy]=useState(false);
  const [localDeleteFeedback,setLocalDeleteFeedback]=useState({message:'',error:false});
  const localDeleteInFlight=useRef(false);
  const localDeleteMounted=useRef(true);
  const localDeleteButton=useRef<HTMLButtonElement>(null);
  const recycleContext=useRef({deskState,recoverableDraft});
  recycleContext.current={deskState,recoverableDraft};
  useEffect(()=>{localDeleteMounted.current=true;return()=>{localDeleteMounted.current=false;};},[]);
  const [setupInfo, setSetupInfo] = useState<LocalSetupInfo | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMessage, setSetupMessage] = useState('');
  const [connectingClient, setConnectingClient] = useState<AgentClient | null>(null);
  const [connectedClients, setConnectedClients] = useState<Set<AgentClient>>(() => new Set());

  const loadLocalStatus = async () => {
    setServiceHealth(await getLocalServiceHealth());
  };

  const openSetupPanel = async (panel: SetupPanel) => {
    setSetupPanel(panel);
    setSetupMessage('');
    setSetupLoading(true);
    try {
      setSetupInfo(await getLocalSetupInfo());
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : '本地配置服务未连接');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleOpenExtensionSetup = async () => {
    setSetupMessage('');
    try {
      const result = await openBrowserExtensionSetup();
      setSetupMessage(result.message);
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : '没有打开插件配置');
    }
  };

  const handleConnectAgent = async (client: AgentClient) => {
    setConnectingClient(client);
    setSetupMessage('');
    try {
      const result = await connectLocalAgent(client);
      setConnectedClients((current) => new Set(current).add(client));
      setSetupMessage(result.message);
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : 'Agent 连接失败');
    } finally {
      setConnectingClient(null);
    }
  };

  const dismissImportFeedback = (phase: ImportPhase, delay = 2800) => {
    window.setTimeout(() => {
      setImportFeedback((current) => current.phase === phase ? IDLE_IMPORT_FEEDBACK : current);
    }, delay);
  };

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDims({
          w: containerRef.current.offsetWidth,
          h: containerRef.current.offsetHeight,
        });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const loadInitialStatus = async () => {
      setServiceHealth(await getLocalServiceHealth());
    };

    void loadInitialStatus();

    const intervalId = window.setInterval(() => void loadInitialStatus(), 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || state.isLoading) {
      return;
    }
    if (state.error && notes.length === 0) {
      return;
    }

    if (deskStateHydratedRef.current && JSON.stringify(deskState)!==savedDeskRef.current) {
      setDeskState((current) => ensureDeskState(current, notes) as DeskState);
      return;
    }

    let cancelled = false;
    void getDeskWorkspace()
      .then((remote) => {
        if (cancelled) return;
        const next=ensureDeskState(remote,notes) as DeskState;
        savedDeskRef.current=JSON.stringify(next);
        savedRevisionRef.current=remote.revision;
        deskStateHydratedRef.current=true;
        setDeskState(next);setDeskReady(true);setDeskError('');
        const draft=readLocalDeskWorkspace();
        if(draft&&JSON.stringify(ensureDeskState(draft.workspace,notes))!==savedDeskRef.current)setRecoverableDraft(draft);
        else {window.localStorage.removeItem(DESK_WORKSPACE_STORAGE_KEY);setRecoverableDraft(null);}
      })
      .catch((error)=>{if(!cancelled)setDeskError(error instanceof Error?error.message:'分组读取失败');});

    return () => {
      cancelled = true;
    };
  }, [notes, state.isLoading, state.error]);

  useEffect(() => {
    if (typeof window === 'undefined' || !deskReady) {
      return;
    }
    const raw=JSON.stringify(deskState);
    if(raw===savedDeskRef.current){setDeskSaving(false);return;}
    setDeskSaving(true);
    try {window.localStorage.setItem(DESK_WORKSPACE_STORAGE_KEY, JSON.stringify({baseRevision:savedRevisionRef.current,workspace:deskState}));}catch{setDeskError('浏览器不能保存草稿，请保持本页打开直到分组保存成功');}
    let sent=false;
    const timeoutId = window.setTimeout(() => {
      sent=true;
      void saveDeskWorkspace(deskState).then(result=>{savedDeskRef.current=raw;savedRevisionRef.current=result.revision;setDeskError('');const draft=readLocalDeskWorkspace();if(draft&&JSON.stringify(draft.workspace)===raw)window.localStorage.removeItem(DESK_WORKSPACE_STORAGE_KEY);else if(draft)window.localStorage.setItem(DESK_WORKSPACE_STORAGE_KEY,JSON.stringify({...draft,baseRevision:result.revision}));}).catch(error=>setDeskError(error instanceof Error?error.message:'分组保存失败，草稿已保留')).finally(()=>setDeskSaving(false));
    }, 250);
    return () => {window.clearTimeout(timeoutId);if(!sent)setDeskSaving(false);};
  }, [deskState,deskReady]);

  const retryDeskSave=async()=>{
    try{const raw=JSON.stringify(deskState);const result=await saveDeskWorkspace(deskState,savedRevisionRef.current);savedDeskRef.current=raw;savedRevisionRef.current=result.revision;window.localStorage.removeItem(DESK_WORKSPACE_STORAGE_KEY);setDeskError('');}
    catch(error){setDeskError(error instanceof Error?error.message:'保存未完成，草稿仍保留');}
  };
  const reloadDesk=async()=>{
    if((recoverableDraft||JSON.stringify(deskState)!==savedDeskRef.current)&&!window.confirm('丢弃未保存的分组草稿，重新读取已保存分组？'))return;
    try{const remote=await getDeskWorkspace();const next=ensureDeskState(remote,notes) as DeskState;savedDeskRef.current=JSON.stringify(next);savedRevisionRef.current=remote.revision;deskStateHydratedRef.current=true;window.localStorage.removeItem(DESK_WORKSPACE_STORAGE_KEY);setRecoverableDraft(null);setDeskState(next);setDeskReady(true);setDeskError('');}
    catch(error){setDeskError(error instanceof Error?error.message:'读取未完成');}
  };
  const restoreDraft=()=>{
    if(!recoverableDraft)return;
    if(recoverableDraft.baseRevision!==savedRevisionRef.current){setDeskError('已保存分组在草稿之后发生变化，不能覆盖。草稿仍保留，请先核对或明确丢弃。');return;}
    setDeskState(ensureDeskState(recoverableDraft.workspace,notes) as DeskState);setRecoverableDraft(null);
  };

  useEffect(() => {
    const validNoteIds = new Set(notes.map((note) => note.id));
    setSelectedNoteIds((current) => {
      const next = new Set(Array.from(current).filter((noteId) => validNoteIds.has(noteId)));
      return next.size === current.size ? current : next;
    });
  }, [notes]);

  useEffect(() => {
    setSelectedNoteIds(new Set());
  }, [activeCategory]);

  const groupNameById = useMemo(
    () => new Map(deskState.groups.map((group) => [group.id, group.name])),
    [deskState.groups],
  );
  const visibleNotes = useMemo(
    () => filterNotesByQuery(
      notes,
      searchQuery,
      (note: Note) => groupNameById.get(deskState.noteGroupMap?.[note.id] || LOOSE_GROUP_ID) || '',
    ) as Note[],
    [notes, searchQuery, groupNameById, deskState.noteGroupMap],
  );
  const hasActiveSearch = searchQuery.trim().length > 0;
  const org = useMemo(
    () => buildOrganized(
      visibleNotes,
      deskState.groups,
      deskState.noteGroupMap || {},
      dims.w,
      activeCategory,
      hasActiveSearch,
    ),
    [visibleNotes, deskState.groups, deskState.noteGroupMap, dims.w, activeCategory, hasActiveSearch],
  );

  const positions = org.positions;
  const labels = org.labels;
  const clusterColumns = getDeskGroupColumnCount(dims.w);
  const groupDropZoneWidth = Math.max((dims.w - 120) / clusterColumns - 20, 220);
  const draggedNoteId = draggedNoteIds[0] || null;
  const lightweightCanvas = useMemo(() => shouldUseLightweightCanvas(visibleNotes.length), [visibleNotes.length]);

  // Calculate total height for scrolling
  const allY = Object.values(positions).map(p => p.y);
  const maxY = allY.length > 0 ? Math.max(...allY) : 0;
  const minH = Math.ceil(Math.max(labels.length, 1) / getDeskGroupColumnCount(dims.w)) * 340 + 160;
  const maxLabelY = labels.length ? Math.max(...labels.map(label => label.tagTop + GROUP_TAG_H)) : 0;
  const containerH = Math.max(maxY + CARD_H + 100, maxLabelY + 80, minH);

  const runImport = async (value: string) => {
    const input = value.trim();
    if (!input || state.isLoading) return;

    if (!canUseLocalService) {
      setImportFeedback({
        phase: 'error',
        title: '本地服务未连接',
        message: '请重新连接数码世界后再试',
      });
      dismissImportFeedback('error');
      return;
    }

    setImportWarning('');
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setImportFeedback({
      phase: 'processing',
      title: getDraggedNoteTitle(input),
      message: '正在解析…',
    });

    try {
      const result = await importSharedNote(input);
      savedDeskRef.current=JSON.stringify(ensureDeskState(result.workspace,result.notes));savedRevisionRef.current=result.workspace.revision;
      setDeskState(moveNoteToGroup(
        ensureDeskState(result.workspace, result.notes),
        result.note.id,
        LOOSE_GROUP_ID,
      ) as DeskState);
      setNotes(result.notes);
      if(result.note.mediaStatus === 'partial' || result.note.videoStatus === 'partial')setImportWarning(`${result.note.title}：${result.note.mediaError || result.note.videoError || '部分内容未能完整保存，请打开收藏核对。'}`);
      setImportFeedback(IDLE_IMPORT_FEEDBACK);
      await loadLocalStatus();
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : '导入失败，请检查链接后重试';
      setImportFeedback({
        phase: 'error',
        title: '没有收录成功',
        message,
      });
      dismissImportFeedback('error', 3600);
      dispatch({ type: 'SET_ERROR', payload: message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleExternalDrop = (event: DragEvent<HTMLDivElement>) => {
    if (draggedNoteIdsRef.current.length || draggedGroupIdRef.current) {
      event.preventDefault();
      stopDragAutoScroll();
      return;
    }
    stopDragAutoScroll();
    event.preventDefault();
    event.stopPropagation();
    const input = selectDraggedNoteInput({
      custom: event.dataTransfer.getData('application/x-kankan-note')
        || event.dataTransfer.getData('application/x-kankan-card'),
      plain: event.dataTransfer.getData('text/plain'),
      uriList: event.dataTransfer.getData('text/uri-list'),
      mozUrl: event.dataTransfer.getData('text/x-moz-url'),
    });
    if (input.trim()) {
      void runImport(input);
    } else {
      setImportFeedback({
        phase: 'error',
        title: '没有识别到笔记',
        message: '请直接拖动小红书搜索结果里的笔记卡片或封面',
      });
      dismissImportFeedback('error');
    }
  };

  useEffect(() => {if(editingGroupId)scrollToGroup(editingGroupId, true);}, [editingGroupId]);

  const handleCreateGroup = () => {
    setDeskState((prev) => {
      const next = createDeskGroup(prev, '新分组') as DeskState;
      const created = next.groups.find((group) => !prev.groups?.some((current) => current.id === group.id) && group.kind === 'custom');
      if (created) {
        setActiveCategory(created.id);
        setEditingGroupId(created.id);
        setEditingGroupName(created.name);
      }
      return next;
    });
  };

  const handleStartRename = (groupId: string, currentName: string) => {
    setEditingGroupId(groupId);
    setEditingGroupName(currentName);
  };

  const handleCommitRename = () => {
    if (!editingGroupId) {
      return;
    }

    setDeskState((prev) => renameDeskGroup(prev, editingGroupId, editingGroupName) as DeskState);
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  const handleMoveNotesToGroup = (noteIds: string[], groupId: string) => {
    const nextDesk = moveNotesToGroup(deskState, noteIds, groupId) as DeskState;
    const nextCategory = categoryForGroup(nextDesk, groupId);
    setDeskState(nextDesk);
    setSelectedNoteIds(new Set());
    setDropTargetGroupId(null);
    stopDragAutoScroll();
    if (!nextCategory) return;

    const updates = Object.fromEntries(noteIds.map((noteId) => [noteId, nextCategory]));
    setNotes(applyNoteCategoryUpdates(notes, updates) as Note[]);
  };

  const handleDeleteNote = async (note: Note) => {
    if (deletingNoteId) return;
    setDeletingNoteId(note.id);
    try {
      const result = await deleteStoredNote(note.id);
      setExpanded(null);
      savedDeskRef.current=JSON.stringify(ensureDeskState(result.workspace,result.notes));savedRevisionRef.current=result.workspace.revision;
      setDeskState(ensureDeskState(result.workspace,result.notes) as DeskState);
      setNotes(result.notes);
      setImportFeedback({
        phase: 'complete',
        title: note.title,
        message: '笔记已移除，本地文件暂保留',
      });
      dismissImportFeedback('complete', 1800);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : '删除失败，请重试';
      setImportFeedback({ phase: 'error', title: '没有删除成功', message });
      dismissImportFeedback('error', 3200);
    } finally {
      setDeletingNoteId(null);
    }
  };

  const adoptRecycleResult = (result:any) => {
    const current=recycleContext.current;
    if(!localDeleteMounted.current || current.recoverableDraft || JSON.stringify(current.deskState)!==savedDeskRef.current)return false;
    const next=ensureDeskState(result.workspace,result.notes) as DeskState;
    savedDeskRef.current=JSON.stringify(next);savedRevisionRef.current=result.workspace.revision;
    adoptRecycleRevision(result.workspace.revision);
    setDeskState(next);setNotes(result.notes);setDeskError('');setDeskSaving(false);
    return true;
  };

  const localDeleteBlocked=!deskReady || deskSaving || !!recoverableDraft || JSON.stringify(deskState)!==savedDeskRef.current || !!deletingNoteId || importFeedback.phase==='processing';
  const handleLocalDelete=async()=>{
    if(localDeleteInFlight.current || localDeleteBlocked)return;
    localDeleteInFlight.current=true;setLocalDeleteBusy(true);
    setLocalDeleteFeedback({message:'正在整理…',error:false});
    let prepared=false,preparedMessage='',preparedWarnings='';
    try {
      // Every explicit attempt first reads the current state; lost writes are never replayed automatically.
      const current=await getRecycle();
      if(!adoptRecycleResult(current))throw new Error('分组状态已变化，请先保存或核对');
      const result=await organizeRecycle();prepared=true;
      const issues=result.errors.map((item:any)=>`${item.title}：${item.error}`);
      preparedMessage=result.organizedCount?`已整理 ${result.organizedCount} 条`:'已核对整理记录';
      preparedWarnings=issues.length?`；${issues.length} 条未整理：${issues.join('；')}`:'';
      if(!adoptRecycleResult(result))throw new Error('整理已完成，分组状态需核对');
      if(!localDeleteMounted.current)return;
      await openRecycleFolder();
      const message=result.organizedCount?`已整理 ${result.organizedCount} 条，已请求在访达打开`:'已请求在访达打开';
      if(localDeleteMounted.current)setLocalDeleteFeedback({message:issues.length?message+preparedWarnings:'',error:!!issues.length});
    } catch(error) {
      let checked=false;
      try {checked=adoptRecycleResult(await getRecycle());}catch{}
      if(localDeleteMounted.current)setLocalDeleteFeedback({message:`${prepared?`${preparedMessage}${preparedWarnings}；访达未确认打开`:'整理未确认完成'}：${error instanceof Error?error.message:'连接中断'}${checked?'。已核对本地记录，未自动重复操作':'。请恢复连接后再点击核对'}`,error:true});
    } finally {
      localDeleteInFlight.current=false;
      if(localDeleteMounted.current){setLocalDeleteBusy(false);window.setTimeout(()=>{if(document.activeElement===document.body)localDeleteButton.current?.focus();},0);}
    }
  };

  const handleCardClick = useCallback((note: Note, event: MouseEvent<HTMLDivElement>) => {
    const noteGroupId = deskState.noteGroupMap?.[note.id] || LOOSE_GROUP_ID;
    if (event.altKey && activeCategory === noteGroupId) {
      event.preventDefault();
      setSelectedNoteIds((current) => {
        const next = new Set(current);
        if (next.has(note.id)) next.delete(note.id);
        else next.add(note.id);
        return next;
      });
      return;
    }
    setSelectedNoteIds(new Set());
    setExpanded(note);
  }, [activeCategory, deskState.noteGroupMap]);

  const stopDragAutoScroll = useCallback(() => {
    dragScrollVelocityRef.current = 0;
    if (dragScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragScrollFrameRef.current);
      dragScrollFrameRef.current = null;
    }
  }, []);

  const updateDragAutoScroll = useCallback((clientY: number) => {
    const velocity = getDragAutoScrollVelocity(clientY, window.innerHeight);
    dragScrollVelocityRef.current = velocity;

    if (!velocity) {
      stopDragAutoScroll();
      return;
    }
    if (dragScrollFrameRef.current !== null) return;

    const scrollFrame = () => {
      const nextVelocity = dragScrollVelocityRef.current;
      if (!nextVelocity) {
        dragScrollFrameRef.current = null;
        return;
      }
      window.scrollBy(0, nextVelocity);
      dragScrollFrameRef.current = window.requestAnimationFrame(scrollFrame);
    };
    dragScrollFrameRef.current = window.requestAnimationFrame(scrollFrame);
  }, [stopDragAutoScroll]);

  useEffect(() => () => stopDragAutoScroll(), [stopDragAutoScroll]);

  const clearDragImage = useCallback(() => {
    dragImageRef.current?.remove();
    dragImageRef.current = null;
  }, []);

  const handleDragStart = useCallback((noteId: string, event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-kankan-desk-card', noteId);
    event.dataTransfer.setData('text/plain', `kankan-desk:${noteId}`);
    clearDragImage();
    dragImageRef.current = setElementDragImage(event, event.currentTarget);
    const noteIds = selectedNoteIds.has(noteId) ? Array.from(selectedNoteIds) : [noteId];
    if (!selectedNoteIds.has(noteId)) setSelectedNoteIds(new Set());
    draggedNoteIdsRef.current = noteIds;
    setDraggedNoteIds(noteIds);
  }, [clearDragImage, selectedNoteIds]);

  const handleGroupDragStart = useCallback((groupId: string, event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-kankan-group', groupId);
    event.dataTransfer.setData('text/plain', `kankan-group:${groupId}`);
    clearDragImage();
    dragImageRef.current = setElementDragImage(event, event.currentTarget);
    draggedGroupIdRef.current = groupId;
    setDraggedGroupId(groupId);
    setGroupDropTargetId(null);
  }, [clearDragImage]);

  const handleGroupDrop = useCallback((targetGroupId: string) => {
    if (!draggedGroupId || draggedGroupId === targetGroupId) return;
    setDeskState((current) => reorderDeskGroups(current, draggedGroupId, targetGroupId) as DeskState);
    draggedGroupIdRef.current = null;
    setDraggedGroupId(null);
    setGroupDropTargetId(null);
    stopDragAutoScroll();
  }, [draggedGroupId, stopDragAutoScroll]);

  const handleDragEnd = useCallback(() => {
    draggedNoteIdsRef.current = [];
    draggedGroupIdRef.current = null;
    clearDragImage();
    setDraggedNoteIds([]);
    setDraggedGroupId(null);
    setDropTargetGroupId(null);
    setGroupDropTargetId(null);
    stopDragAutoScroll();
  }, [clearDragImage, stopDragAutoScroll]);

  const canUseLocalService = serviceHealth.source === 'sidecar' && serviceHealth.ok;

  const isEmpty = notes.length === 0;
  const hasNoSearchResults = !isEmpty && hasActiveSearch && visibleNotes.length === 0;

  const scrollToGroup = (groupId: string, focusLabel = false) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const label = containerRef.current?.querySelector(`[data-group-id="${CSS.escape(groupId)}"]`);
      const firstNote = getNotesInGroup(visibleNotes, deskState.noteGroupMap || {}, groupId)[0];
      const selector = firstNote ? `[data-note-id="${CSS.escape(firstNote.id)}"]` : `[data-empty-group-id="${CSS.escape(groupId)}"]`;
      const target = focusLabel ? label : containerRef.current?.querySelector(selector) || label;
      target?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    }));
  };
  return (
    <>
    <PageHeading page="learning" help={<button type="button" className="page-help" aria-label="这页怎么用" onClick={() => setHelpOpen(true)}>?</button>}
      action={<button type="button" className="collection-key collection-primary" disabled={localDeleteBusy} onClick={() => void openSetupPanel('extension')}><Puzzle size={16}/>插件</button>}/>
    {helpOpen && <CollectionHelp onClose={() => setHelpOpen(false)}/>}
    <div
      className="collection-desk"
      ref={containerRef}
      onClickCapture={(event)=>{if(localDeleteInFlight.current && !(event.target as Element).closest('.collection-recycle-entry')){event.preventDefault();event.stopPropagation();}}}
      onDragEnter={(event) => {
        if(localDeleteInFlight.current){event.preventDefault();event.stopPropagation();return;}
        if (draggedNoteIdsRef.current.length || draggedGroupIdRef.current) {
          event.preventDefault();
          updateDragAutoScroll(event.clientY);
          return;
        }
        if (acceptsExternalNoteDrag(event.dataTransfer.types)) {
          event.preventDefault();
          setImportFeedback({
            phase: 'dragging',
            title: '松手收录',
            message: '',
          });
        }
      }}
      onDragOver={(event) => {
        if(localDeleteInFlight.current){event.preventDefault();event.dataTransfer.dropEffect='none';return;}
        if (draggedNoteIdsRef.current.length || draggedGroupIdRef.current) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          updateDragAutoScroll(event.clientY);
          return;
        }
        if (acceptsExternalNoteDrag(event.dataTransfer.types)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          if (importFeedback.phase === 'idle') {
            setImportFeedback({
              phase: 'dragging',
              title: '松手收录',
              message: '',
            });
          }
        }
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        stopDragAutoScroll();
        if (draggedNoteIdsRef.current.length || draggedGroupIdRef.current) return;
        setImportFeedback(IDLE_IMPORT_FEEDBACK);
      }}
      onDrop={(event)=>{if(localDeleteInFlight.current){event.preventDefault();event.stopPropagation();return;}handleExternalDrop(event);}}

    >
      {recoverableDraft&&<div className="collection-error" role="status">有未保存的分组草稿<button onClick={restoreDraft}>恢复草稿</button><button onClick={reloadDesk}>丢弃草稿并读取</button></div>}
      {deskError&&<div className="collection-error" role="alert">{deskError}{deskReady&&<button onClick={retryDeskSave}>重试保存分组</button>}<button onClick={reloadDesk}>重新读取分组</button></div>}

      <AnimatePresence>
        {importFeedback.phase !== 'idle' && !draggedNoteId && !draggedGroupId && (
          <motion.div
            className="collection-import-feedback"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={handleExternalDrop}
            data-phase={importFeedback.phase}
          >
            {importFeedback.phase === 'dragging' ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}

                className="collection-drag-prompt"
              >
                <div className="collection-drag-symbol">
                  <BookMarked size={25} strokeWidth={1.7} />
                </div>
                <span className="collection-drag-title">松手收录</span>
              </motion.div>
            ) : (
              <motion.div
                layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
                className="collection-feedback-message"
              >
                <motion.span
                  className="collection-feedback-dot"
                />
                <div className="collection-feedback-copy">
                  {importFeedback.phase === 'processing'
                    ? importFeedback.message
                    : importFeedback.phase === 'complete'
                      ? importFeedback.message
                      : importFeedback.phase === 'recognized'
                        ? '已接收'
                        : `${importFeedback.title}${importFeedback.message ? ` · ${importFeedback.message}` : ''}`}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <header className="collection-toolbar">
        <ScrollFade className="collection-scroll"><div className="collection-chips" role="group" aria-label="收藏分组">
          <button type="button" className="collection-key collection-chip" aria-pressed={!activeCategory} disabled={localDeleteBusy} onClick={() => setActiveCategory(null)}>全部 <b>{notes.length}</b></button>
          {labels.map(group => <button type="button" key={group.groupId} className="collection-key collection-chip" aria-pressed={activeCategory === group.groupId} disabled={localDeleteBusy}
            onClick={() => {setActiveCategory(current => current === group.groupId ? null : group.groupId);scrollToGroup(group.groupId);}} title={group.name}><span>{group.name}</span><b>{group.noteCount}</b></button>)}
          <button type="button" className="collection-key collection-chip collection-add-group" aria-label="新建分组" disabled={!deskReady || localDeleteBusy} onClick={handleCreateGroup}><Plus size={14}/>分组</button>
        </div></ScrollFade>
        <div className="collection-search"><Search size={14}/><input disabled={localDeleteBusy} value={searchQuery} onChange={event => {setSearchQuery(event.target.value);setActiveCategory(null);}}
          onKeyDown={event => {if(event.key === 'Escape')setSearchQuery('');}} placeholder={`搜索 ${notes.length} 条收藏`} aria-label="搜索收藏"/>
          {hasActiveSearch && <span className="collection-search-count" role="status">找到 {visibleNotes.length} 条</span>}
        </div>
        <div className="collection-toolbar-tools">
          <button type="button" className="collection-key collection-tool" disabled={localDeleteBusy} title="Agent" aria-label="Agent" onClick={() => void openSetupPanel('agent')}><Bot size={16}/><span>Agent</span></button>
          <button ref={localDeleteButton} type="button" className={`collection-key collection-tool collection-recycle-entry${selectedNoteIds.size ? " collection-danger" : ""}`} disabled={localDeleteBusy || localDeleteBlocked} aria-label="本地删除" aria-busy={localDeleteBusy} onClick={() => void handleLocalDelete()} title={localDeleteBlocked ? '分组保存或当前收藏操作完成后可用' : '本地删除'}>{localDeleteBusy ? <Reading mini label="处理本地删除"/> : <Trash2 size={16}/>}<span>本地删除</span></button>
        </div>
      </header>

      {importWarning && <p className="collection-import-warning" role="status">{importWarning}<button className="collection-key collection-icon" aria-label="关闭部分收录提示" onClick={() => setImportWarning('')}><X size={14}/></button></p>}
      {localDeleteFeedback.message && <p className="collection-local-delete-feedback" role={localDeleteFeedback.error?'alert':'status'}>{localDeleteFeedback.message}</p>}

      <AnimatePresence>
        {setupPanel && (
          <SetupDialog
            panel={setupPanel}
            info={setupInfo}
            loading={setupLoading}
            message={setupMessage}
            connectingClient={connectingClient}
            connectedClients={connectedClients}
            onClose={() => setSetupPanel(null)}
            onOpenExtension={() => void handleOpenExtensionSetup()}
            onConnectAgent={(client) => void handleConnectAgent(client)}
          />
        )}
      </AnimatePresence>

      {/* ── Desk canvas ── */}
      <div
        className="collection-canvas"
        inert={localDeleteBusy}
        onClick={(event) => {
          if (event.target === event.currentTarget && activeCategory) {
            setActiveCategory(null);
          }
        }}
        style={styleOf({
        position: 'relative',
        width: '100%',
        minHeight: isEmpty || hasNoSearchResults ? 520 : containerH,
        zIndex: 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      })}>
        <ReadReveal pending={(state.isLoading||(!deskReady&&!deskError))&&!state.error} ready={deskReady&&!state.error&&!deskError}/>
        {(state.isLoading||(!deskReady&&!deskError))&&!state.error && <div className="collection-loading"><Reading label="读取收藏画布"/></div>}
        {isEmpty && !state.isLoading && !state.error && <div className="collection-empty">
          <div className="collection-empty-frames" aria-hidden="true"><i/><i/></div><h2>暂无收藏</h2><p>在小红书帖子上点收藏，就会落到这里</p>
          <button type="button" className="collection-key" onClick={() => void openSetupPanel('extension')}>配置插件</button>
        </div>}
        {state.error && <div className="collection-error collection-load-error" role="alert">{state.error}</div>}
        {hasNoSearchResults && <div className="collection-empty"><div className="collection-empty-frames" aria-hidden="true"><i/><i/></div><h2>没找到「{searchQuery.trim()}」</h2><p>试试作者、标签或图片里的字</p><button type="button" className="collection-key" onClick={() => setSearchQuery('')}>清除搜索</button></div>}
        <AnimatePresence>
          {draggedNoteId && labels
            .filter(({ groupId, noteCount }) => noteCount > 0 && !draggedNoteIds.every((noteId) =>
              (deskState.noteGroupMap?.[noteId] || LOOSE_GROUP_ID) === groupId
            ))
            .map(({ groupId, x, y, color }) => {
              const isDropTarget = dropTargetGroupId === groupId;
              return (
                <motion.div
                  key={`drop-zone-${groupId}`}
                  className={`collection-drop-zone${isDropTarget ? ' is-drop-target' : ''}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDropTargetGroupId(groupId);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    if (dropTargetGroupId !== groupId) setDropTargetGroupId(groupId);
                  }}
                  onDragLeave={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                    if (dropTargetGroupId === groupId) setDropTargetGroupId(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleMoveNotesToGroup(draggedNoteIds, groupId);
                    setDraggedNoteIds([]);
                  }}
                  style={styleOf({
                    position: 'absolute',
                    left: x - groupDropZoneWidth / 2,
                    top: y - 14,
                    width: groupDropZoneWidth,
                    height: 330,
                    zIndex: 550,
                  })}
                />
              );
            })}
        </AnimatePresence>
        <AnimatePresence>
          {labels.map(({ groupId, name, x, tagTop, color, noteCount }) => {
            const isExpanded = activeCategory === groupId;
            const isEditing = editingGroupId === groupId;
            const isDropTarget = dropTargetGroupId === groupId;
            const isGroupDropTarget = groupDropTargetId === groupId;
            const handleLabelDragOver = (event: DragEvent<HTMLElement>) => {
              if (!draggedGroupId && !draggedNoteId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (draggedGroupId) setGroupDropTargetId(groupId);
              else setDropTargetGroupId(groupId);
            };
            const handleLabelDragLeave = (event: DragEvent<HTMLElement>) => {
              if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
              if (groupDropTargetId === groupId) setGroupDropTargetId(null);
              if (dropTargetGroupId === groupId) setDropTargetGroupId(null);
            };
            const handleLabelDrop = (event: DragEvent<HTMLElement>) => {
              if (!draggedGroupId && !draggedNoteIds.length) return;
              event.preventDefault();event.stopPropagation();
              if (draggedGroupId) {handleGroupDrop(groupId);return;}
              if (draggedNoteIds.length) handleMoveNotesToGroup(draggedNoteIds, groupId);
              setDraggedNoteIds([]);
            };
            return (
              <motion.div
                key={`lbl-${groupId}`}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.3 }}
                data-desk-interactive="true"
                style={styleOf({
                  position: 'absolute',
                  left: x,
                  top: tagTop,
                  x: '-50%',
                  zIndex: isExpanded || isGroupDropTarget ? 600 : (activeCategory === null ? 400 : 100),
                })}
              >
                {noteCount === 0 && <div
                  className={`collection-empty-group${isDropTarget || isGroupDropTarget ? ' is-drop-target' : ''}`}
                  data-empty-group-id={groupId}
                  onDragEnter={handleLabelDragOver}
                  onDragOver={handleLabelDragOver}
                  onDragLeave={handleLabelDragLeave}
                  onDrop={handleLabelDrop}
                >拖卡片到这里</div>}
                <div className="collection-group-controls">
                  <motion.div
                    className={`desk-native-drag collection-group${isExpanded ? " is-expanded" : ""}${isDropTarget || isGroupDropTarget ? " is-drop-target" : ""}`}
                    role={isEditing ? undefined : 'button'}
                    tabIndex={isEditing ? -1 : 0}
                    aria-label={`分组：${name}，${noteCount} 条收藏`}
                    aria-expanded={isExpanded}
                    data-group-id={groupId}
                    onKeyDown={event=>{if(!isEditing && (event.key==='Enter' || event.key===' ')){event.preventDefault();setActiveCategory(prev=>prev===groupId?null:groupId);}}}
                    draggable={!isEditing}
                    title={isEditing ? undefined : `${name} · ${noteCount} 条笔记；点击展开，拖动排序`}
                    onMouseDown={() => window.getSelection()?.removeAllRanges()}
                    onDragStartCapture={(event) => handleGroupDragStart(groupId, event)}
                    onDragEndCapture={handleDragEnd}
                    onClick={() => {
                      if (isEditing) return;
                      setActiveCategory((prev) => (prev === groupId ? null : groupId));
                    }}
                    onDragOver={handleLabelDragOver}
                    onDragLeave={handleLabelDragLeave}
                    onDrop={handleLabelDrop}
                  >
                    {isEditing ? (
                      <>
                        <input
                          aria-label="分组名称"
                          maxLength={80}
                          value={editingGroupName}
                          onChange={(event) => setEditingGroupName(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleCommitRename();
                            }
                            if (event.key === 'Escape') {
                              setEditingGroupId(null);
                              setEditingGroupName('');
                            }
                          }}
                          autoFocus
                          className="collection-group-input"
                        />
                        <button
                          aria-label="保存分组名称"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCommitRename();
                          }}
                          className="collection-key collection-icon collection-rename"
                        >
                          <Check size={13} strokeWidth={2.2} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="collection-group-copy"><div className="collection-group-name" title={name}>{name}</div><div className="collection-group-count">{noteCount}</div></div>
                      </>
                    )}
                  </motion.div>

                  <AnimatePresence>
                    {isExpanded && !isEditing && (
                      <>
                        <motion.button
                          aria-label={`重命名分组：${name}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStartRename(groupId, name);
                          }}
                          className="collection-key collection-icon collection-rename"


                        >
                          <Pencil size={14} strokeWidth={1.8} />
                        </motion.button>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Cards */}
        {visibleNotes.map((note, index) => {
          const pos = positions[note.id];
          if (!pos) return null;
          const noteGroupId = deskState.noteGroupMap?.[note.id] || LOOSE_GROUP_ID;
          const isDimmed = activeCategory !== null && noteGroupId !== activeCategory;
          const isSelected = selectedNoteIds.has(note.id);
          return (
            <DeskCard
              key={note.id}
              note={note}
              pos={pos}
              claimEntrance={claimEntrance}
              entranceReady={deskReady && !state.isLoading}
              entranceIndex={index}
              newArrival={newArrivalIds.has(note.id)}
              isDimmed={isDimmed}
              lightweight={lightweightCanvas}
              isSelected={isSelected}
              selectedCount={draggedNoteId === note.id ? draggedNoteIds.length : 0}
              showCategory={hasActiveSearch || noteGroupId === LOOSE_GROUP_ID}
              onClick={handleCardClick}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          );
        })}
      </div>

      {/* ── Expanded overlay ── */}
      <AnimatePresence>
        {expanded && (
          <ExpandedCard
            key={expanded.id}
            note={expanded}
            onClose={() => setExpanded(null)}
            onDelete={() => void handleDeleteNote(expanded)}
            isDeleting={deletingNoteId === expanded.id}
          />
        )}
      </AnimatePresence>

    </div>
    </>
  );
}

function CollectionHelp({onClose}: {onClose: () => void}) {
  const ref = useDialogFocus(onClose);
  return <div className="collection-overlay collection-setup-overlay" onMouseDown={event => {if(event.target === event.currentTarget)onClose();}}><div className="collection-setup" ref={ref} role="dialog" aria-modal="true" aria-label="收藏怎么用" tabIndex={-1}>
    <header className="collection-dialog-heading"><h2>收藏怎么用</h2><button className="collection-key collection-icon" aria-label="关闭" onClick={onClose}><X size={16}/></button></header>
    <div className="collection-dialog-body collection-help-body"><p>收进来：安装并配对 Chrome 插件，在小红书帖子上点收藏；也可以把帖子拖入画布。</p><p>本地删除：整理已经删除的记录，并请求在访达打开本地文件夹。</p><p>Agent：只复制收藏的只读 MCP 配置。粘贴进该 Agent 设置后可搜索和阅读，不能修改或删除。</p></div>
  </div></div>;
}
