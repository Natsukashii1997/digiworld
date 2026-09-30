// 银饰剪影：macOS Vision 主体抠图（JXA，由 silver-cutout.mjs 通过 osascript -l JavaScript 调用）。
// 用法：osascript -l JavaScript silver-cutout.jxa.js <输入图片> <输出 PNG>
// 需要 macOS 14+（VNGenerateForegroundInstanceMaskRequest）。只读输入、只写调用方给定的输出路径，不联网。
// 输出：成功写出透明背景 PNG 后打印 OK；没有识别到主体打印 NO_SUBJECT；其他错误抛出（退出码非 0）。
// 状态：云端无法运行，需本机验证。
ObjC.import("Foundation");
ObjC.import("AppKit");
ObjC.import("CoreImage");
ObjC.import("Vision");

function run(argv) {
  if (argv.length !== 2) throw new Error("需要输入与输出两个路径");
  const input = $.NSURL.fileURLWithPath(argv[0]);
  const output = argv[1];
  if (typeof $.VNGenerateForegroundInstanceMaskRequest === "undefined")
    throw new Error("VNGenerateForegroundInstanceMaskRequest 不可用（需要 macOS 14+）");
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(input, $.NSDictionary.dictionary);
  const request = $.VNGenerateForegroundInstanceMaskRequest.alloc.init;
  const error = Ref();
  if (!handler.performRequestsError($.NSArray.arrayWithObject(request), error))
    throw new Error("Vision 请求失败");
  const results = request.results;
  if (!results || results.count === 0) return "NO_SUBJECT";
  const observation = results.objectAtIndex(0);
  const instances = observation.allInstances;
  if (!instances || instances.count === 0) return "NO_SUBJECT";
  // 保留全部前景实例，裁到主体范围，背景透明。
  const buffer = observation.generateMaskedImageOfInstancesFromRequestHandlerCroppedToInstancesExtentError(
    instances,
    handler,
    true,
    error,
  );
  if (!buffer) throw new Error("生成抠图失败");
  const image = $.CIImage.imageWithCVPixelBuffer(buffer);
  const rep = $.NSBitmapImageRep.alloc.initWithCIImage(image);
  const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
  if (!png || !png.writeToFileAtomically(output, true)) throw new Error("写出 PNG 失败");
  return "OK";
}
