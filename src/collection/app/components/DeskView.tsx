/* Hallmark · component: search + setup dialog · genre: modern-minimal
 * states: default · hover · focus · active · disabled · loading · error · success
 * pre-emit critique: P5 H5 E4 S5 R5 V4
 */
'use client';

import { memo, useCallback, useState, useEffect, useRef, useMemo, type DragEvent, type MouseEvent } from 'react';
import { motion, AnimatePresence, styleOf } from '../../motion';
import { useDialogFocus } from '../../useDialogFocus';
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
const TITLEBAR_SAFE_TOP = 0;
const TITLEBAR_SAFE_LEFT = 12;
const DRAG_PAYLOAD_PREFIX = 'KANKAN_NOTE:';

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

  visibleGroups.forEach((group, ci) => {
    const col = ci % clusterCols;
    const row = Math.floor(ci / clusterCols);

    const cx = clusterPadX + col * clusterW + clusterW / 2;
    const cy = 20 + looseAreaH + row * clusterH + clusterH / 2;

    const labelX = cx;
    const groupColor = group.kind === 'auto'
      ? catColor(group.sourceCategory || group.name)
      : '#829987';
    labels.push({
      groupId: group.id,
      name: group.name,
      y: cy - 155,
      x: labelX,
      color: groupColor,
      kind: group.kind,
      noteCount: grouped[group.id].length,
    });

    const catNotes = grouped[group.id];
    const isExpanded = group.id === activeGroupId;

    catNotes.forEach((note, i) => {
      if (isExpanded) {
        // 展开状态：以标签为中心向下进行网格平铺
        const cols = Math.max(1,Math.min(w > 600 ? 3 : 2,1+Math.floor(Math.max(0,w-48-CARD_W)/EXPANDED_GRID_GAP_X)));
        const gapX = EXPANDED_GRID_GAP_X;
        const gapY = EXPANDED_GRID_GAP_Y;
        const gridCol = i % cols;
        const gridRow = Math.floor(i / cols);
        const gridCenterX = getExpandedGridCenterX(cx, w, catNotes.length, cols);

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
        const angle = (i * 1.618) % (Math.PI * 2);
        const radius = Math.min(i * 3, 25) + (sr(i * 3 + ci) - 0.5) * 20;
        const offsetX = Math.cos(angle) * radius + (sr(i * 7 + ci) - 0.5) * 20;
        const offsetY = Math.sin(angle) * radius * 0.6 + (sr(i * 11 + ci) - 0.5) * 15;

        positions[note.id] = {
          x: cx + offsetX,
          y: cy + offsetY,
          rot: (sr(i * 13 + ci * 3 + 2) - 0.5) * 28,
          z: Math.floor(sr(i * 17 + ci * 2 + 3) * 20) + ci * 15,
          breathOffset: sr(i * 19 + ci) * 3
        };
      }
    });
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
  const color = catColor(note.category);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [readerTab, setReaderTab] = useState<'note' | 'transcript'>(
    note.type === 'video' ? 'transcript' : 'note',
  );
  const [readerPage, setReaderPage] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceImageUrls = Array.from(new Set(
    note.imageUrls?.length ? note.imageUrls : (note.coverUrl ? [note.coverUrl] : []),
  ));
  const imageUrls = sourceImageUrls.filter(imageUrl => !failedImageUrls.has(imageUrl));
  const resolvedImageIndex = Math.min(activeImageIndex, Math.max(imageUrls.length - 1, 0));
  const activeImageUrl = imageUrls[resolvedImageIndex];
  const rawContent = stripDuplicateTagSuffix(note.rawContent || '', note.tags);
  const ocrText = (note.ocrText || '').trim();
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
  const readerPages = readerTab === 'transcript'
    ? transcriptPages
    : notePages;
  const resolvedReaderPage = Math.min(readerPage, Math.max(readerPages.length - 1, 0));

  const changeReaderTab = (tab: 'note' | 'transcript') => {
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
      style={styleOf({
        position: 'fixed', inset: 0, zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(225,221,214,0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: 24,
      })}
    >
      <motion.div
        ref={dialogRef}
        className="collection-reader"
        role="dialog"
        aria-modal="true"
        aria-label={note.title}
        tabIndex={-1}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        onClick={e => e.stopPropagation()}
        style={styleOf({
          background: '#FDFCFA',
          borderRadius: 22,
          width: '100%',
          maxWidth: 1080,
          height: 'min(86vh, 820px)',
          overflow: 'hidden',
          boxShadow: '0 32px 100px rgba(55,45,25,0.28), 0 12px 32px rgba(55,45,25,0.15)',
          display: 'flex',
        })}
      >
        {/* Visual gallery */}
        <div style={styleOf({
          flex: '0 0 58%',
          display: 'flex',
          borderRight: '1px solid rgba(0,0,0,0.06)',
          background: '#EAE7E0',
          minWidth: 0,
          position: 'relative',
        })}>
          {!isVideo && imageUrls.length > 1 && (
            <div style={styleOf({
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              overflowY: 'auto',
              padding: '18px 10px 18px 14px',
              background: 'rgba(244,242,237,0.72)',
              borderRight: '1px solid rgba(0,0,0,0.05)',
              flexShrink: 0,
            })}>
              {imageUrls.map((imageUrl, index) => (
                <button
                  key={imageUrl}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`查看第 ${index + 1} 张图片`}
                  style={styleOf({
                    width: 54,
                    height: 68,
                    padding: 0,
                    flexShrink: 0,
                    overflow: 'hidden',
                    borderRadius: 9,
                    border: index === resolvedImageIndex
                      ? `2px solid ${color}`
                      : '2px solid transparent',
                    background: '#E8E5DE',
                    cursor: 'pointer',
                    opacity: index === resolvedImageIndex ? 1 : 0.68,
                    boxShadow: index === resolvedImageIndex ? `0 4px 14px ${color}30` : 'none',
                  })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt=""
                    draggable={false}
                    style={styleOf({ width: '100%', height: '100%', objectFit: 'cover', display: 'block' })}
                    onError={() => markImageFailed(imageUrl)}
                  />
                </button>
              ))}
            </div>
          )}
          <div style={styleOf({
            flex: 1,
            minWidth: 0,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 28,
            overflow: 'hidden',
          })}>
            {isVideo ? (
              <video
                ref={videoRef}
                src={note.videoUrl}
                poster={note.coverUrl || undefined}
                controls
                playsInline
                preload="metadata"
                style={styleOf({
                  width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                  background: '#171715', borderRadius: 12,
                })}
              />
            ) : activeImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeImageUrl}
                alt={note.title}
                draggable={false}
                style={styleOf({
                  width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                  filter: 'saturate(0.9) contrast(1.02)',
                })}
                onError={() => markImageFailed(activeImageUrl)}
              />
            ) : (
              <div style={styleOf({
                width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(145deg, ${color}18, ${color}40)`,
                color, fontFamily: '"Playfair Display", Georgia, serif', fontSize: 72, fontWeight: 600,
              })}>
                {note.title.slice(0, 1)}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              style={styleOf({
                position: 'absolute', top: 16, left: 16,
                background: 'rgba(253,252,250,0.92)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(0,0,0,0.05)', borderRadius: '50%',
                width: 36, height: 36, cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 12px rgba(0,0,0,0.1)',
              })}
            >
              <X size={15} color="#404047" strokeWidth={2} />
            </button>
            {!isVideo && imageUrls.length > 1 && (
              <div style={styleOf({
                position: 'absolute', right: 16, bottom: 16, padding: '5px 10px', borderRadius: 999,
                background: 'rgba(50,48,44,0.72)', color: '#fff', fontSize: 10.5,
                backdropFilter: 'blur(8px)',
              })}>
                {resolvedImageIndex + 1} / {imageUrls.length}
              </div>
            )}
          </div>
        </div>

        {/* Original note */}
        <div style={styleOf({
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          padding: '30px 32px 34px',
          background: '#FDFCFA',
        })}>
          <div style={styleOf({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 })}>
            <div style={styleOf({
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 9px', borderRadius: 999, background: `${color}14`,
              color, fontSize: 10.5, fontWeight: 600,
            })}>
              <span style={styleOf({ width: 6, height: 6, borderRadius: '50%', background: color })} />
              {note.category}
            </div>
            {confirmingDelete ? (
              <div style={styleOf({ display: 'flex', alignItems: 'center', gap: 5 })}>
                <button type="button" onClick={() => setConfirmingDelete(false)} disabled={isDeleting}
                  style={styleOf({ border: 'none', background: 'transparent', color: '#8C8780', fontSize: 11, cursor: 'pointer', padding: '5px 7px' })}>
                  取消
                </button>
                <button type="button" onClick={onDelete} disabled={isDeleting}
                  style={styleOf({
                    display: 'flex', alignItems: 'center', gap: 5, border: 'none', borderRadius: 999,
                    background: 'rgba(181,106,91,0.11)', color: '#A85F52', fontSize: 11,
                    cursor: isDeleting ? 'default' : 'pointer', padding: '6px 10px',
                  })}>
                  {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  {isDeleting ? '删除中' : '确认删除'}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)}
                style={styleOf({
                  display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent',
                  color: '#AAA49C', fontSize: 10.5, cursor: 'pointer', padding: '5px 4px',
                })}>
                <Trash2 size={12} strokeWidth={1.7} /> 删除
              </button>
            )}
          </div>

          <h2 style={styleOf({
            margin: '22px 0 10px', fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 25, lineHeight: 1.38, fontWeight: 600, color: '#35343A', letterSpacing: '-0.02em',
          })}>
            {note.title}
          </h2>
          <div style={styleOf({ display: 'flex', alignItems: 'center', gap: 10, color: '#9A958D', fontSize: 11 })}>
            <span>@{note.author.name}</span>
            <span style={styleOf({ width: 3, height: 3, borderRadius: '50%', background: '#C7C2BA' })} />
            <span>{formatDate(note.savedAt)}</span>
            {/^https?:\/\//i.test(note.sourceUrl||'')&&<a className="collection-original-link" href={note.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="查看原帖"><ExternalLink size={14}/>原帖</a>}
          </div>

          {note.type === 'video' ? (
            <div style={styleOf({
              display: 'flex', gap: 3, margin: '24px 0 22px', padding: 3,
              borderRadius: 12, background: 'rgba(72,67,58,0.055)',
            })}>
              {([
                ['note', '笔记正文'],
                ['transcript', '视频文稿'],
              ] as const).map(([tab, label]) => {
                const active = readerTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => changeReaderTab(tab)}
                    style={styleOf({
                      flex: 1, height: 34, border: 'none', borderRadius: 9,
                      background: active ? '#FDFCFA' : 'transparent',
                      boxShadow: active ? '0 2px 9px rgba(62,54,41,0.08)' : 'none',
                      color: active ? '#46433E' : '#99938B',
                      fontSize: 11.5, fontWeight: active ? 600 : 500, cursor: 'pointer',
                    })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={styleOf({ height: 1, background: 'rgba(0,0,0,0.06)', margin: '24px 0' })} />
          )}

          {readerTab === 'note' && (
            <p style={styleOf({
              margin: 0, fontSize: 13.5, color: '#5E5A54', lineHeight: 1.9,
              whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
            })}>
              {notePages[resolvedReaderPage] || '这条笔记没有可见正文。'}
            </p>
          )}

          {readerTab === 'transcript' && (
            transcriptPages.length > 0 ? (
              <div style={styleOf({ display: 'flex', flexDirection: 'column', gap: 13 })}>
                {transcriptPages[resolvedReaderPage]?.map((segment, index) => (
                  <div key={`${segment.start}-${index}`} style={styleOf({ display: 'grid', gridTemplateColumns: '42px 1fr', gap: 10 })}>
                    <button
                      type="button"
                      onClick={() => seekVideo(segment.start)}
                      style={styleOf({
                        alignSelf: 'start', border: 'none', borderRadius: 7, padding: '4px 0',
                        background: `${color}14`, color, fontSize: 10, cursor: isVideo ? 'pointer' : 'default',
                      })}
                    >
                      {formatMediaTime(segment.start)}
                    </button>
                    <p style={styleOf({ margin: 0, color: '#5E5A54', fontSize: 13.5, lineHeight: 1.8 })}>
                      {segment.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={styleOf({ margin: 0, color: '#9A958D', fontSize: 12.5, lineHeight: 1.8 })}>
                {note.videoError || '这条视频没有识别到可转写的语音。'}
              </p>
            )
          )}

          {readerPages.length > 1 && (
            <div style={styleOf({
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
              marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.05)',
            })}>
              <button
                type="button"
                aria-label="上一页"
                onClick={() => setReaderPage((page) => Math.max(0, page - 1))}
                disabled={resolvedReaderPage === 0}
                style={styleOf({
                  width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.06)',
                  background: '#F8F6F2', color: '#777168', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: resolvedReaderPage === 0 ? 'default' : 'pointer',
                  opacity: resolvedReaderPage === 0 ? 0.35 : 1,
                })}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={styleOf({ color: '#AAA49C', fontSize: 10.5 })}>
                {resolvedReaderPage + 1} / {readerPages.length}
              </span>
              <button
                type="button"
                aria-label="下一页"
                onClick={() => setReaderPage((page) => Math.min(readerPages.length - 1, page + 1))}
                disabled={resolvedReaderPage >= readerPages.length - 1}
                style={styleOf({
                  width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.06)',
                  background: '#F8F6F2', color: '#777168', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: resolvedReaderPage >= readerPages.length - 1 ? 'default' : 'pointer',
                  opacity: resolvedReaderPage >= readerPages.length - 1 ? 0.35 : 1,
                })}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {readerTab === 'note' && Array.isArray(note.tags) && note.tags.length > 0 && (
            <div style={styleOf({
              display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 22,
            })}>
              {note.tags.map((tag) => (
                <span key={tag} style={styleOf({
                  padding: '4px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.035)',
                  color: '#8D8881', fontSize: 10.5,
                })}>#{tag}</span>
              ))}
            </div>
          )}

          {readerTab === 'note' && ocrText && (
            <div style={styleOf({ marginTop: 26, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 18 })}>
              <button type="button" onClick={() => setShowOcr((value) => !value)}
                style={styleOf({
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                  color: '#666159', fontSize: 12, fontWeight: 600,
                })}>
                <span>图片文字</span>
                <span style={styleOf({ color: '#AAA49C', fontSize: 10.5, fontWeight: 400 })}>
                  {showOcr ? '收起' : '展开 OCR'}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {showOcr && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={styleOf({
                      margin: '14px 0 0', overflow: 'hidden', whiteSpace: 'pre-wrap',
                      color: '#777168', fontSize: 12, lineHeight: 1.8,
                    })}>
                    {ocrText}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}

          {note.mediaStatus === 'partial' && (
            <p style={styleOf({ marginTop: 16, fontSize: 10.5, color: '#B56A5B', lineHeight: 1.5 })}>
              {note.mediaError || '部分图片或文字未能完整保存。'}
            </p>
          )}

          {note.videoStatus === 'partial' && note.videoError && readerTab === 'note' && (
            <p style={styleOf({ marginTop: 16, fontSize: 10.5, color: '#B56A5B', lineHeight: 1.5 })}>
              {note.videoError}
            </p>
          )}

          <div style={styleOf({
            display: 'flex', alignItems: 'center', gap: 18, marginTop: 28, paddingTop: 18,
            borderTop: '1px solid rgba(0,0,0,0.05)', color: '#AAA49C', fontSize: 11,
          })}>
            <span style={styleOf({ display: 'flex', alignItems: 'center', gap: 5 })}>
              <Heart size={13} strokeWidth={1.6} /> {formatNumber(note.likes)}
            </span>
            <span style={styleOf({ display: 'flex', alignItems: 'center', gap: 5 })}>
              <BookMarked size={13} strokeWidth={1.6} /> {formatNumber(note.collects)}
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Individual card ───────────────────────────────────────────────────────────
const DeskCard = memo(function DeskCard({
  note, pos, isDimmed, lightweight, isSelected, selectedCount,
  onClick, onDragStart, onDragEnd
}: {
  note: Note;
  pos: Pos;
  isDimmed?: boolean;
  lightweight?: boolean;
  isSelected?: boolean;
  selectedCount?: number;
  onClick: (note: Note, event: MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (noteId: string, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  const color = catColor(note.category);
  const ring = `0 0 0 ${isSelected ? 2 : 1}px ${isSelected ? `${color}B8` : 'rgba(0,0,0,0.02)'}`;
  const restingShadow = `0 2px 6px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.10), ${ring}`;
  const liftedShadow = `0 3px 8px rgba(0,0,0,0.10), 0 10px 28px rgba(0,0,0,0.12), ${ring}`;

  return (
    <motion.div
      className="collection-card-position"
      role="button"
      aria-hidden={isDimmed || undefined}
      inert={isDimmed || undefined}
      tabIndex={isDimmed ? -1 : 0}
      aria-label={`阅读收藏：${note.title}`}
      aria-pressed={!!isSelected}
      data-note-id={note.id}
      onKeyDown={event=>{if(!isDimmed && (event.key==='Enter' || event.key===' ')){event.preventDefault();onClick(note,event as any);}}}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        rotate: pos.rot,
        zIndex: isDimmed ? 0 : pos.z,
        opacity: isDimmed ? 0.35 : 1,
        scale: isDimmed ? 0.75 : 1,
      }}
      transition={{ type: 'spring', stiffness: 220, damping: 24, mass: 0.8 }}
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
        className="desk-native-drag"
        draggable={!isDimmed}
        onMouseDown={() => window.getSelection()?.removeAllRanges()}
        onDragStartCapture={(event) => onDragStart?.(note.id, event)}
        onDragEndCapture={() => onDragEnd?.()}
        style={styleOf({ width: '100%', height: '100%', cursor: isDimmed ? 'default' : 'grab' })}
      >
      <motion.div
        className="collection-card-breathe"
        animate={lightweight ? undefined : { y: [0, -2, 0] }}
        transition={lightweight ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: pos.breathOffset }}
        style={styleOf({ width: '100%', height: '100%' })}
      >
        {/* Keep the original float without continuously scaling the text raster. */}
        <motion.div className="collection-paper"
          animate={lightweight ? undefined : { boxShadow: [restingShadow, liftedShadow, restingShadow] }}
          transition={lightweight ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: pos.breathOffset }}
          style={styleOf({
          background: '#FDFCFA', borderRadius: 10,
          padding: '7px 7px 20px',
          position: 'relative',
          boxShadow: restingShadow,
          userSelect: 'none',
        })}>
          {isSelected && (
            <span style={styleOf({
              position: 'absolute', top: 13, left: 13, zIndex: 3,
              width: 24, height: 24, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: color,
              color: '#fff',
              border: `1px solid ${color}`,
              boxShadow: '0 3px 10px rgba(55,45,25,0.12)',
              backdropFilter: 'blur(7px)',
            })}>
              <Check size={13} strokeWidth={2.5} />
            </span>
          )}
          {isSelected && (selectedCount || 0) > 1 && (
            <span style={styleOf({
              position: 'absolute', top: -9, right: -9, zIndex: 4,
              minWidth: 25, height: 25, padding: '0 7px', borderRadius: 999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#4F6254', color: '#fff', fontSize: 10.5, fontWeight: 700,
              border: '2px solid #EBE9E4', boxShadow: '0 5px 14px rgba(55,45,25,0.18)',
            })}>
              {selectedCount}
            </span>
          )}
          <div style={styleOf({
            borderRadius: 6,
            overflow: 'hidden',
            height: CARD_IMAGE_H,
            background: '#f0f0f0',
            position: 'relative',
          })}>
            {note.coverUrl ? (
              <>
                {/* External note images cannot use Next Image without a stable host allowlist. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={note.coverUrl}
                  alt={note.title}
                  draggable={false}
                  decoding="async"
                  style={styleOf({
                    width: '100%', height: '100%',
                    objectFit: 'cover', display: 'block',
                    pointerEvents: 'none',
                  })}
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                />
              </>
            ) : (
              <div style={styleOf({
                width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(145deg, ${color}22, ${color}55)`,
                color, fontFamily: '"Playfair Display", Georgia, serif', fontSize: 38, fontWeight: 600,
              })}>
                {note.title.slice(0, 1)}
              </div>
            )}
            {note.type === 'video' && (
              <span style={styleOf({
                position: 'absolute', top: 7, right: 7, width: 23, height: 23,
                borderRadius: '50%', background: 'rgba(42,40,36,0.72)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(6px)', boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
              })}>
                <Play size={10} fill="currentColor" strokeWidth={1.5} style={styleOf({ marginLeft: 1 })} />
              </span>
            )}
          </div>

          <div className="collection-card-copy" style={styleOf({ padding: '7px 3px 0' })}>
            <span className="collection-card-category" style={styleOf({
              display: 'inline-block',
              fontSize: 8.5,
              fontWeight: 600,
              color,
              background: `${color}18`,
              borderRadius: 3,
              padding: '1px 5px',
              letterSpacing: '0.02em',
              marginBottom: 4,
            })}>
              {note.category}
            </span>
            <p className="collection-card-title" style={styleOf({
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 12.5,
              fontWeight: 500,
              color: '#3A3840',
              lineHeight: 1.52,
              letterSpacing: '-0.003em',
              display: '-webkit-box',
              WebkitLineClamp: CARD_TITLE_LINES,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              margin: 0,
              userSelect: 'none',
              pointerEvents: 'none',
            })}>
              {note.title}
            </p>
          </div>
        </motion.div>
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
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={styleOf({
        position: 'fixed', inset: 0, zIndex: 310,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 28,
        background: 'rgba(73, 67, 57, 0.18)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      })}
    >
      <motion.div
        ref={dialogRef}
        className="collection-setup"
        role="dialog"
        aria-modal="true"
        aria-label={panel==='extension'?'浏览器插件':'连接 Agent'}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.22 }}
        style={styleOf({
          width: 'min(440px, calc(100vw - 48px))',
          borderRadius: 24,
          background: 'rgba(253,252,250,0.98)',
          border: '1px solid rgba(255,255,255,0.72)',
          boxShadow: '0 34px 90px rgba(73,56,28,0.2)',
          overflow: 'hidden',
        })}
      >
        <div style={styleOf({ padding: '25px 26px 24px', position: 'relative' })}>
          <button
            onClick={onClose}
            aria-label="关闭"
            style={styleOf({
              position: 'absolute', top: 18, right: 18,
              width: 34, height: 34, borderRadius: 999,
              border: '1px solid rgba(0,0,0,0.06)', background: '#F4F2ED',
              color: '#6F6B64', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            })}
          >
            <X size={16} />
          </button>

          <h2 style={styleOf({
            margin: 0, color: '#3A3840', fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 21, fontWeight: 600,
          })}>
            {panel === 'extension' ? '浏览器插件' : '连接 Agent'}
          </h2>

          {loading ? (
            <div style={styleOf({ height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#829987' })}>
              <Loader2 size={21} className="animate-spin" />
            </div>
          ) : panel === 'extension' ? (
            <div style={styleOf({ marginTop: 24 })}>
              <p className="collection-path">{info?.extension.path}</p>
              <button
                onClick={onOpenExtension}
                disabled={!info?.extension.available}
                style={styleOf({
                  width: '100%', height: 46, border: 'none', borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  background: info?.extension.available ? '#829987' : '#C8C7C2',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: info?.extension.available ? 'pointer' : 'not-allowed',
                  opacity: info?.extension.available ? 1 : 0.58,
                })}
              >
                <ExternalLink size={15} />
                配置 Chrome 插件
              </button>
              <button className="collection-pair" onClick={async()=>{try{const result=await pairExtension();setPairingToken(result.token);setPairError('');}catch(error){setPairError(error instanceof Error?error.message:'配对失败');}}}>生成插件配对码</button>
              {pairingToken&&<label className="collection-pair-label">配对码<input readOnly value={pairingToken} aria-label="插件配对码" onFocus={event=>event.currentTarget.select()}/><button onClick={()=>navigator.clipboard.writeText(pairingToken).catch(()=>setPairError('复制失败，请手动选择配对码'))}>复制配对码</button></label>}
              <button className="collection-revoke" onClick={async()=>{try{await revokeExtension();setPairingToken('');setPairError('配对已撤销');}catch(error){setPairError(error instanceof Error?error.message:'撤销失败');}}}>撤销插件配对</button>
              {pairError&&<p role="status">{pairError}</p>}
              <details style={styleOf({ marginTop: 14, color: '#8B857D' })}>
                <summary style={styleOf({ cursor: 'pointer', fontSize: 11.5, textAlign: 'center', listStylePosition: 'inside' })}>
                  安装帮助
                </summary>
                <div style={styleOf({ marginTop: 11, padding: '12px 14px', borderRadius: 12, background: '#F5F3EE', fontSize: 11.5, lineHeight: 1.8 })}>
                  在 Chrome 扩展页开启开发者模式，加载上方文件夹；点插件图标，把配对码填入插件并保存。
                </div>
              </details>
            </div>
          ) : (
            <div style={styleOf({ marginTop: 18 })}>
              <div style={styleOf({ borderTop: '1px solid rgba(73,56,28,0.08)' })}>
                {([
                  ['codex', 'Codex'],
                  ['claude', 'Claude Code'],
                ] as const).map(([client, label]) => {
                  const detected = info?.agent.clients[client].available;
                  const connected = connectedClients.has(client);
                  const connecting = connectingClient === client;
                  return (
                    <div key={client} style={styleOf({
                      minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                      borderBottom: '1px solid rgba(73,56,28,0.08)',
                    })}>
                      <strong style={styleOf({ fontSize: 13.5, color: '#454248', fontWeight: 600 })}>{label}</strong>
                      <button
                        onClick={() => onConnectAgent(client)}
                        disabled={!detected || connecting}
                        style={styleOf({
                          width: 94, height: 38, borderRadius: 12,
                          border: connected ? '1px solid rgba(130,153,135,0.28)' : 'none',
                          background: connected ? 'rgba(130,153,135,0.09)' : detected ? '#829987' : '#D2D0CB',
                          color: connected ? '#627567' : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          fontSize: 12, fontWeight: 600,
                          cursor: detected && !connected ? 'pointer' : 'default',
                          opacity: detected ? 1 : 0.58,
                        })}
                      >
                        {connecting ? <Loader2 size={14} className="animate-spin" /> : connected ? <Check size={14} /> : <Bot size={14} />}
                        {connecting ? '准备中' : connected ? '已复制' : detected ? '复制配置' : '不可用'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {message && (
            <div style={styleOf({
              marginTop: 14, color: '#5E7564', fontSize: 11.5, textAlign: 'center',
            })}>{message}</div>
          )}
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
  const minH = Math.ceil(Math.max(labels.length, 1) / getDeskGroupColumnCount(dims.w)) * 310 + 160;
  const containerH = Math.max(maxY + CARD_H + 100, minH);

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

  const subtitle = state.error
    ? state.error
    : state.isLoading
      ? '加载中…'
      : hasActiveSearch
        ? `找到 ${visibleNotes.length} 条`
        : `${notes.length} 条笔记`;

  const isEmpty = notes.length === 0;
  const hasNoSearchResults = !isEmpty && hasActiveSearch && visibleNotes.length === 0;

  return (
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
      style={styleOf({
        minHeight: '100vh',
        background: '#EBE9E4',
        position: 'relative',
        overflowY: 'auto',
        overflowX: 'hidden',
      })}
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
            style={styleOf({
              position: 'fixed',
              inset: 0,
              zIndex: 220,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: importFeedback.phase === 'dragging'
                ? 'rgba(235,233,228,0.58)'
                : 'rgba(235,233,228,0.82)',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
              pointerEvents: importFeedback.phase === 'dragging' ? 'auto' : 'none',
              boxShadow: importFeedback.phase === 'dragging'
                ? 'inset 0 0 0 2px rgba(130,153,135,0.52)'
                : 'none',
            })}
          >
            {importFeedback.phase === 'dragging' ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: [1, 1.06, 1] }}
                transition={{ opacity: { duration: 0.18 }, scale: { duration: 1.35, repeat: Infinity, ease: 'easeInOut' } }}
                style={styleOf({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13, color: '#4F6254' })}
              >
                <div style={styleOf({
                  width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(253,252,250,0.88)', border: '1px solid rgba(130,153,135,0.3)',
                  boxShadow: '0 16px 48px rgba(73,56,28,0.13)',
                })}>
                  <BookMarked size={25} strokeWidth={1.7} />
                </div>
                <span style={styleOf({ fontSize: 13, fontWeight: 600, letterSpacing: '0.08em' })}>松手收录</span>
              </motion.div>
            ) : (
              <motion.div
                layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
                style={styleOf({
                  maxWidth: 480, display: 'flex', alignItems: 'center', gap: 9,
                  padding: '10px 15px', borderRadius: 999,
                  color: importFeedback.phase === 'error' ? '#8F5146' : '#4F6254',
                  background: 'rgba(253,252,250,0.92)', border: '1px solid rgba(94,105,95,0.12)',
                  backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                  boxShadow: '0 8px 28px rgba(73,56,28,0.10)',
                })}
              >
                <motion.span
                  animate={importFeedback.phase === 'processing'
                    ? { opacity: [0.35, 1, 0.35], scale: [0.82, 1, 0.82] }
                    : { opacity: 1, scale: 1 }}
                  transition={importFeedback.phase === 'processing'
                    ? { duration: 1.15, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.16 }}
                  style={styleOf({
                    width: 7, height: 7, flexShrink: 0, borderRadius: '50%',
                    background: importFeedback.phase === 'error' ? '#B56A5B' : '#829987',
                  })}
                />
                <div style={styleOf({
                  minWidth: 0, maxWidth: 430, fontSize: 12, fontWeight: 550,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                })}>
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

      {/* ── Header ── */}
      <header className="collection-toolbar" style={styleOf({
        position: 'sticky', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${12 + TITLEBAR_SAFE_TOP}px 20px 12px ${20 + TITLEBAR_SAFE_LEFT}px`,
        background: 'rgba(235,233,228,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(0,0,0,0.04)',
      })}>
        <div style={styleOf({ width: 190, flexShrink: 0 })}>
          <h2 style={styleOf({
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 16, fontWeight: 600, color: '#3A3840',
            letterSpacing: '-0.015em', lineHeight: 1,
          })}>
            收藏画布
          </h2>
          <p style={styleOf({ fontSize: 10, color: '#A8A29E', marginTop: 2 })}>
            {subtitle}
          </p>
        </div>

        <div style={styleOf({
          width: 260, margin: '0 22px',
          position: 'relative', display: 'flex', alignItems: 'center',
        })}>
          <Search size={14} strokeWidth={1.8} style={styleOf({ position: 'absolute', left: 13, color: '#8F8A82', pointerEvents: 'none' })} />
          <input
            disabled={localDeleteBusy}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setActiveCategory(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchQuery('');
            }}
            placeholder="搜索"
            aria-label="搜索收藏"
            style={styleOf({
              width: '100%', height: 34, padding: '0 13px 0 36px',
              borderRadius: 13, border: '1px solid rgba(73,56,28,0.07)',
              background: 'rgba(253,252,250,0.58)',
              color: '#454248', fontSize: 12,
            })}
          />
        </div>

        <div className="collection-toolbar-tools" style={styleOf({ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 })}>
          <button ref={localDeleteButton} type="button" className="collection-recycle-entry" disabled={localDeleteBusy || localDeleteBlocked} aria-busy={localDeleteBusy} onClick={()=>void handleLocalDelete()} title={localDeleteBlocked?'分组保存或当前收藏操作完成后可用':'本地删除'}>{localDeleteBusy?<Loader2 size={14} className="animate-spin"/>:<Trash2 size={14} strokeWidth={1.8}/>}本地删除</button>
          {([
            ['extension', '插件', Puzzle],
            ['agent', 'Agent', Bot],
          ] as const).map(([panel, label, Icon]) => (
            <motion.button
              key={panel}
              disabled={localDeleteBusy}
              whileHover={{ y: -1, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => void openSetupPanel(panel)}
              style={styleOf({
                height: 36, padding: '0 13px', borderRadius: 15,
                border: '1px solid rgba(73,56,28,0.07)',
                background: 'rgba(253,252,250,0.78)', color: '#666159',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11.5, fontWeight: 550, cursor: 'pointer',
                boxShadow: '0 3px 13px rgba(73,56,28,0.045)',
              })}
            >
              <Icon size={14} strokeWidth={1.8} />
              {label}
            </motion.button>
          ))}
        </div>
      </header>

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
        height: isEmpty || hasNoSearchResults ? 'calc(100vh - 98px)' : containerH,
        minHeight: isEmpty || hasNoSearchResults ? 520 : undefined,
        zIndex: 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      })}>
        {isEmpty && !state.isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={styleOf({
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#77736C',
              textAlign: 'center',
              pointerEvents: 'none',
            })}
          >
            <BookMarked size={26} strokeWidth={1.4} color="#829987" />
            <div style={styleOf({
              marginTop: 12,
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 22,
              fontWeight: 600,
              color: '#4B494F',
            })}>
              暂无收藏
            </div>
          </motion.div>
        )}
        {hasNoSearchResults && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={styleOf({
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: '#77736C', textAlign: 'center', pointerEvents: 'none',
            })}
          >
            <Search size={24} strokeWidth={1.4} color="#829987" />
            <div style={styleOf({
              marginTop: 12, fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 20, fontWeight: 600, color: '#4B494F',
            })}>
              没找到相关收藏
            </div>
          </motion.div>
        )}
        <AnimatePresence>
          {draggedNoteId && labels
            .filter(({ groupId }) => !draggedNoteIds.every((noteId) =>
              (deskState.noteGroupMap?.[noteId] || LOOSE_GROUP_ID) === groupId
            ))
            .map(({ groupId, x, y, color }) => {
              const isDropTarget = dropTargetGroupId === groupId;
              return (
                <motion.div
                  key={`drop-zone-${groupId}`}
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
                    borderRadius: 30,
                    border: `1px dashed ${isDropTarget ? `${color}88` : 'rgba(130,153,135,0.25)'}`,
                    background: isDropTarget ? `${color}12` : 'rgba(253,252,250,0.04)',
                    boxShadow: isDropTarget ? `inset 0 0 0 1px ${color}18` : 'none',
                    pointerEvents: 'auto',
                  })}
                />
              );
            })}
        </AnimatePresence>
        <AnimatePresence>
          {labels.map(({ groupId, name, x, y, color, noteCount }) => {
            const isExpanded = activeCategory === groupId;
            const isEditing = editingGroupId === groupId;
            const isDropTarget = dropTargetGroupId === groupId;
            const isGroupDropTarget = groupDropTargetId === groupId;
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
                  top: y,
                  x: '-50%',
                  zIndex: isExpanded || isGroupDropTarget ? 600 : (activeCategory === null ? 400 : 100),
                })}
              >
                <div style={styleOf({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                })}>
                  <motion.div
                    className="desk-native-drag collection-group"
                    role={isEditing ? undefined : 'button'}
                    tabIndex={isEditing ? -1 : 0}
                    aria-label={`分组：${name}，${noteCount} 条收藏`}
                    aria-expanded={isExpanded}
                    data-group-id={groupId}
                    onKeyDown={event=>{if(!isEditing && (event.key==='Enter' || event.key===' ')){event.preventDefault();setActiveCategory(prev=>prev===groupId?null:groupId);}}}
                    draggable={!isEditing}
                    title={isEditing ? undefined : '点击展开，拖动排序'}
                    onMouseDown={() => window.getSelection()?.removeAllRanges()}
                    onDragStartCapture={(event) => handleGroupDragStart(groupId, event)}
                    onDragEndCapture={handleDragEnd}
                    onClick={() => {
                      if (isEditing) return;
                      setActiveCategory((prev) => (prev === groupId ? null : groupId));
                    }}
                    onDragOver={(event) => {
                      if (draggedGroupId) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setGroupDropTargetId(groupId);
                        return;
                      }
                      if (!draggedNoteId) return;
                      event.preventDefault();
                      if (dropTargetGroupId !== groupId) {
                        setDropTargetGroupId(groupId);
                      }
                    }}
                    onDragLeave={() => {
                      if (groupDropTargetId === groupId) {
                        setGroupDropTargetId(null);
                      }
                      if (dropTargetGroupId === groupId) {
                        setDropTargetGroupId(null);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (draggedGroupId) {
                        handleGroupDrop(groupId);
                        return;
                      }
                      if (draggedNoteIds.length) {
                        handleMoveNotesToGroup(draggedNoteIds, groupId);
                      }
                      setDraggedNoteIds([]);
                    }}
                    style={styleOf({
                      background: isExpanded || isDropTarget || isGroupDropTarget ? 'rgba(253, 252, 250, 0.98)' : 'rgba(240, 238, 230, 0.85)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      padding: '6px 14px 6px 18px',
                      borderRadius: 24,
                      border: isExpanded || isDropTarget || isGroupDropTarget ? `1px solid ${color}40` : '1px solid rgba(0,0,0,0.04)',
                      boxShadow: isExpanded || isDropTarget || isGroupDropTarget
                        ? `0 8px 24px ${color}25, 0 2px 8px rgba(0,0,0,0.06)`
                        : '0 2px 8px rgba(55,45,25,0.08)',
                      cursor: isEditing ? 'default' : 'grab',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    })}
                    animate={isDropTarget || isGroupDropTarget ? { scale: 1.05, y: -2 } : { scale: 1, y: 0 }}
                    whileHover={isEditing ? undefined : { scale: 1.05, y: -2 }}
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
                          style={styleOf({
                            width: 132,
                            height: 30,
                            border: '1px solid rgba(0,0,0,0.08)',
                            borderRadius: 10,
                            background: '#fff',
                            padding: '0 10px',
                            fontSize: 13,
                            color: '#3A3840',
                            outline: 'none',
                          })}
                        />
                        <button
                          aria-label="保存分组名称"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCommitRename();
                          }}
                          style={styleOf({
                            width: 26,
                            height: 26,
                            borderRadius: 999,
                            border: 'none',
                            background: color,
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          })}
                        >
                          <Check size={13} strokeWidth={2.2} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div>
                          <div style={styleOf({ position: 'relative', fontFamily: 'Playfair Display, Georgia, serif', fontSize: 15, fontWeight: 600, color: isExpanded ? color : '#3A3840', zIndex: 1 })}>
                            {name}
                            <div style={styleOf({
                              position: 'absolute',
                              bottom: 2,
                              left: -2,
                              right: -2,
                              height: 6,
                              background: color,
                              opacity: isExpanded ? 0.1 : 0.35,
                              zIndex: -1,
                              borderRadius: 2,
                              transition: 'opacity 0.3s ease',
                            })} />
                          </div>
                          <div style={styleOf({ marginTop: 2, fontSize: 10, color: '#A8A29E', lineHeight: 1 })}>
                            {noteCount} 条笔记
                          </div>
                        </div>
                        <motion.div
                          animate={{
                            rotate: isExpanded ? 180 : 0,
                            color: isExpanded ? color : '#A8A29E'
                          }}
                          transition={{ type: 'spring', stiffness: 250, damping: 20 }}
                          style={styleOf({ display: 'flex', alignItems: 'center' })}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </motion.div>
                      </>
                    )}
                  </motion.div>

                  <AnimatePresence>
                    {isExpanded && (
                      <>
                        <motion.button
                          aria-label={`重命名分组：${name}`}
                          initial={{ opacity: 0, scale: 0.8, x: -10 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.8, x: -10 }}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStartRename(groupId, name);
                          }}
                          style={styleOf({
                            background: 'rgba(253,252,250,0.94)',
                            color: '#6B6860',
                            border: '1px solid rgba(0,0,0,0.06)',
                            borderRadius: 20,
                            width: 34,
                            height: 34,
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(73,56,28,0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          })}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
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
        {visibleNotes.map(note => {
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
              isDimmed={isDimmed}
              lightweight={lightweightCanvas}
              isSelected={isSelected}
              selectedCount={draggedNoteId === note.id ? draggedNoteIds.length : 0}
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

      {/* ── Canvas footer control ── */}
      {!state.isLoading && notes.length > 0 && (
        <motion.button
          className="collection-create-group"
          disabled={!deskReady}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleCreateGroup}
          style={styleOf({
            position: 'relative',
            margin: '24px auto',
            height: 46,
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '0 20px', borderRadius: 24, cursor: 'pointer',
            color: '#FDFCFA', background: '#829987', border: '1px solid #829987',
            fontSize: 13, fontWeight: 550,
            boxShadow: '0 8px 28px rgba(55,45,25,0.13), 0 2px 8px rgba(0,0,0,0.06)',
          })}
        >
          <Plus size={16} />
          新建分组
        </motion.button>
      )}

    </div>
  );
}
