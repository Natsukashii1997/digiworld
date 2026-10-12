import { useState, useRef, useEffect, useCallback } from "react";
import { request } from "./api.js";
export function useCollabProtocol(state, route, inboxOpen) {
  const projects = (state?.connections?.projects || []).filter((p) => p.active);
  const key = JSON.stringify([
    projects,
    state?.connections?.contextBindings,
    state?.connections?.roots,
    state?.collabRunSettings || [],
    (state?.assets || []).filter((asset) => asset.type === "Workflow")
      .map((asset) => [asset.id, asset.versions.map((version) => version.id)]),
  ]);
  const keyRef = useRef(key);
  keyRef.current = key;
  const epoch = useRef(0);
  const [value, setValue] = useState({
    items: [],
    loaded: false,
    error: "",
    key: "",
  });
  const refresh = useCallback(async () => {
    const n = ++epoch.current;
    if (!projects.length) {
      const v = { items: [], loaded: true, error: "", key };
      setValue(v);
      return v;
    }
    setValue(previous => ({ items: previous.key === key ? previous.items : [], loaded: false, error: "", key }));
    try {
      const v = {
        ...(await request("/collab/protocol", {})),
        loaded: true,
        error: "",
        key,
      };
      if (n === epoch.current && keyRef.current === key) setValue(v);
      return v;
    } catch (e) {
      const v = {
        items: [],
        loaded: true,
        error: e.message || "协议读取失败",
        key,
      };
      if (n === epoch.current && keyRef.current === key) setValue(previous => ({ ...v, items: previous.key === key ? previous.items : [] }));
      return v;
    }
  }, [key]);
  useEffect(() => {
    if (state) refresh();
    return () => {
      epoch.current++;
    };
  }, [!!state, refresh]);
  useEffect(() => {
    if (state && (route === "collab" || route === "home" || inboxOpen))
      refresh();
  }, [route, inboxOpen]);
  useEffect(() => {
    const focus = () => {
      if (document.visibilityState === "visible" && state) refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh, !!state]);
  return {
    collabStatus:
      value.key === key
        ? value
        : { items: [], loaded: projects.length === 0, error: "", key },
    refreshCollabStatus: refresh,
  };
}
