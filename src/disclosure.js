// 折叠收起的退场（#127）：展开时内容淡入落定（styles.css 的 disclose），收起时先 160ms 淡出再真正合上，
// 两个方向都交代清楚。收起途中再点一次就取消收起、保持展开（可打断）。减少动效时走浏览器原生的立即收起。
import { T } from "./motion-tokens.js";
import { reducedMotion } from "./scan-motion.js";

const closing = new WeakMap();
const INTERACTIVE = "a,button,input,select,textarea,label,[contenteditable]";

export function installDisclosure(doc = document) {
  const click = (e) => {
    const summary = e.target?.closest?.("summary");
    const d = summary?.parentElement;
    if (!d || d.tagName !== "DETAILS" || e.defaultPrevented) return;
    // summary 里的按钮、链接自己处理，不当作开合。
    const inner = e.target.closest(INTERACTIVE);
    if (inner && inner !== summary && summary.contains(inner)) return;
    const timer = closing.get(d);
    if (timer) {
      e.preventDefault();
      clearTimeout(timer);
      closing.delete(d);
      delete d.dataset.closing;
      return;
    }
    if (!d.open || reducedMotion()) return;
    e.preventDefault();
    d.dataset.closing = "";
    closing.set(d, setTimeout(() => {
      closing.delete(d);
      delete d.dataset.closing;
      d.open = false;
    }, T.fast));
  };
  doc.addEventListener("click", click);
  return () => doc.removeEventListener("click", click);
}
