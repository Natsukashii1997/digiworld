// UI v16 视觉稿素材：服务端渲染项目真实组件（页头、点阵字、像素图、图标），不手画。
import React from "react";
import { renderToStaticMarkup as R } from "react-dom/server";
import { PageHeading, Maturity, TypeIcon } from "../../../../src/components.jsx";
import { Pixel, DigiviceArt } from "../../../../src/pixel.jsx";
import { LcdText, Corners } from "../../../../src/v14.jsx";
import * as L from "lucide-react";
const h = React.createElement;

export const r = {
  lcd: (text, px = 2) => R(h(LcdText, { text: String(text), px })),
  pixel: (sprite, size = 48) => R(h(Pixel, { sprite, size })),
  digivice: (size = 240, sprite = "egg") => R(h(DigiviceArt, { size }, h(Pixel, { sprite, size: Math.round(size * 0.3) }))),
  heading: (page, over = {}) => R(h(PageHeading, { page, ...over })),
  maturity: (level) => R(h(Maturity, { level })),
  type: (type, size = 16) => R(h(TypeIcon, { type, size })),
  corners: () => R(h(Corners)),
  ic: (name, size = 16) => (L[name] ? R(h(L[name], { size, strokeWidth: 1.8, "aria-hidden": true })) : ""),
};
