// 本机小助手：macOS 日历与提醒事项（EventKit）。路线 v3 5.2；产品定义 v1.2 §4.8、v1.1 §4.5。
// 由 server/calendar.mjs 通过子进程调用：/usr/bin/swift calendar-helper.swift <命令> '<JSON 参数>'
// 每次只打印一行 JSON：{"ok":true,...} 或 {"ok":false,"error":"denied|not_found|conflict|readonly|invalid|failed","message":"..."}。
// 读取：指定时间段内所有日历的事件（只有“工作台”日历可改）、“工作台”提醒事项列表。
// 写入：只在“工作台”日历 / 列表中新建与修改；保存后用一个新的 EKEventStore 按标识回读，输出回读结果。
// 修改前比对 expectedModified（上次回读的最后修改时间），不一致即返回 conflict 与当前内容，不写入。
// 不联网、不删除任何条目、不触碰其他日历。
// 状态：云端（Linux）无法运行，需本机验证（权限弹窗、iCloud 同步、手机提醒均未验证）。
import EventKit
import Foundation

let WORKBENCH = "工作台"

// ---- 输出 ----
func emit(_ value: [String: Any]) -> Never {
  let data = try! JSONSerialization.data(withJSONObject: value, options: [])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
  exit(0)
}
func failure(_ error: String, _ message: String, extra: [String: Any] = [:]) -> Never {
  var value: [String: Any] = ["ok": false, "error": error, "message": message]
  for (k, v) in extra { value[k] = v }
  emit(value)
}

let isoOut: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f
}()
let isoIn = ISO8601DateFormatter()
func iso(_ date: Date?) -> Any { date.map { isoOut.string(from: $0) } ?? NSNull() }
func parseDate(_ value: Any?) -> Date? {
  guard let s = value as? String else { return nil }
  return isoOut.date(from: s) ?? isoIn.date(from: s)
}

// ---- 权限 ----
func accessName(_ status: EKAuthorizationStatus) -> String {
  switch status {
  case .notDetermined: return "notDetermined"
  case .restricted: return "restricted"
  case .denied: return "denied"
  case .writeOnly: return "writeOnly"
  case .fullAccess: return "authorized"
  @unknown default: return "denied"
  }
}
func access() -> [String: Any] {
  [
    "calendar": accessName(EKEventStore.authorizationStatus(for: .event)),
    "reminders": accessName(EKEventStore.authorizationStatus(for: .reminder)),
  ]
}
func requireAccess(_ type: EKEntityType) {
  if EKEventStore.authorizationStatus(for: type) != .fullAccess {
    failure("denied", type == .event ? "日历未授权" : "提醒事项未授权", extra: ["access": access()])
  }
}

// ---- 参数 ----
let args = CommandLine.arguments
guard args.count >= 2 else { failure("invalid", "缺少命令") }
let command = args[1]
var input: [String: Any] = [:]
if args.count >= 3 {
  guard let data = args[2].data(using: .utf8),
    let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  else { failure("invalid", "参数不是 JSON 对象") }
  input = object
}

let store = EKEventStore()

// ---- “工作台”日历 / 列表：查找，写入时不存在则新建 ----
func workbenchCalendar(_ type: EKEntityType, create: Bool, in store: EKEventStore) -> EKCalendar? {
  if let found = store.calendars(for: type).first(where: {
    $0.title == WORKBENCH && $0.allowsContentModifications
  }) {
    return found
  }
  guard create else { return nil }
  let calendar = EKCalendar(for: type, eventStore: store)
  calendar.title = WORKBENCH
  let preferred =
    type == .event
    ? store.defaultCalendarForNewEvents?.source : store.defaultCalendarForNewReminders()?.source
  guard
    let source = preferred ?? store.sources.first(where: { $0.sourceType == .calDAV })
      ?? store.sources.first(where: { $0.sourceType == .local })
  else { failure("failed", "找不到可用的日历账户来新建“工作台”") }
  calendar.source = source
  do { try store.saveCalendar(calendar, commit: true) } catch {
    failure("failed", "无法新建“工作台”：\(error.localizedDescription)")
  }
  return calendar
}

func isWorkbench(_ calendar: EKCalendar?) -> Bool {
  calendar?.title == WORKBENCH && calendar?.allowsContentModifications == true
}
func eventJSON(_ e: EKEvent) -> [String: Any] {
  [
    "id": e.eventIdentifier ?? e.calendarItemIdentifier,
    "calendar": e.calendar?.title ?? "",
    "workbench": isWorkbench(e.calendar),
    "title": e.title ?? "",
    "start": iso(e.startDate),
    "end": iso(e.endDate),
    "allDay": e.isAllDay,
    "modified": iso(e.lastModifiedDate),
  ]
}
func reminderJSON(_ r: EKReminder) -> [String: Any] {
  [
    "id": r.calendarItemIdentifier,
    "title": r.title ?? "",
    "completed": r.isCompleted,
    "due": iso(r.dueDateComponents.flatMap { Calendar.current.date(from: $0) }),
    "modified": iso(r.lastModifiedDate),
  ]
}

// 回读：用新的 EKEventStore 从系统数据库重新读取，不用内存中的对象。
func rereadEvent(_ id: String) -> EKEvent? { EKEventStore().event(withIdentifier: id) }
func rereadReminder(_ id: String) -> EKReminder? {
  EKEventStore().calendarItem(withIdentifier: id) as? EKReminder
}

func wait(_ body: (@escaping () -> Void) -> Void) {
  let semaphore = DispatchSemaphore(value: 0)
  body { semaphore.signal() }
  semaphore.wait()
}

func setDue(_ reminder: EKReminder, _ due: Date?) {
  for alarm in reminder.alarms ?? [] { reminder.removeAlarm(alarm) }
  if let due = due {
    reminder.dueDateComponents = Calendar.current.dateComponents(
      [.year, .month, .day, .hour, .minute, .second, .timeZone], from: due)
    reminder.addAlarm(EKAlarm(absoluteDate: due))  // 到点提醒，手机经 iCloud 同步后也能收到
  } else {
    reminder.dueDateComponents = nil
  }
}

switch command {
case "status":
  emit(["ok": true, "access": access()])

case "request-access":
  // 只在用户于页面点击“授权”时调用；系统会弹出权限对话框。
  wait { done in store.requestFullAccessToEvents { _, _ in done() } }
  wait { done in store.requestFullAccessToReminders { _, _ in done() } }
  emit(["ok": true, "access": access()])

case "events":
  requireAccess(.event)
  guard let from = parseDate(input["from"]), let to = parseDate(input["to"]), to > from else {
    failure("invalid", "日期范围无效")
  }
  let predicate = store.predicateForEvents(withStart: from, end: to, calendars: nil)
  emit(["ok": true, "access": access(), "events": store.events(matching: predicate).map(eventJSON)])

case "create-event":
  requireAccess(.event)
  guard let title = input["title"] as? String, !title.isEmpty,
    let start = parseDate(input["start"]), let end = parseDate(input["end"]), end > start
  else { failure("invalid", "标题或时间无效") }
  let event = EKEvent(eventStore: store)
  event.calendar = workbenchCalendar(.event, create: true, in: store)
  event.title = title
  event.startDate = start
  event.endDate = end
  do { try store.save(event, span: .thisEvent, commit: true) } catch {
    failure("failed", error.localizedDescription)
  }
  guard let id = event.eventIdentifier, let back = rereadEvent(id) else {
    failure("failed", "已保存但回读不到，请在日历应用里核对")
  }
  emit(["ok": true, "access": access(), "event": eventJSON(back)])

case "update-event":
  requireAccess(.event)
  guard let id = input["id"] as? String, let event = store.event(withIdentifier: id) else {
    failure("not_found", "日历里已找不到这条")
  }
  guard isWorkbench(event.calendar) else {
    failure("readonly", "只能修改“工作台”日历里的条目")
  }
  let expected = input["expectedModified"] as? String
  let current = event.lastModifiedDate.map { isoOut.string(from: $0) }
  if expected != current { failure("conflict", "日历应用里已被修改", extra: ["current": eventJSON(event)]) }
  guard let title = input["title"] as? String, !title.isEmpty,
    let start = parseDate(input["start"]), let end = parseDate(input["end"]), end > start
  else { failure("invalid", "标题或时间无效") }
  event.title = title
  event.startDate = start
  event.endDate = end
  do { try store.save(event, span: .thisEvent, commit: true) } catch {
    failure("failed", error.localizedDescription)
  }
  guard let back = rereadEvent(event.eventIdentifier ?? id) else {
    failure("failed", "已保存但回读不到，请在日历应用里核对")
  }
  emit(["ok": true, "access": access(), "event": eventJSON(back)])

case "reminders":
  requireAccess(.reminder)
  guard let list = workbenchCalendar(.reminder, create: false, in: store) else {
    emit(["ok": true, "access": access(), "list": WORKBENCH, "reminders": []])
  }
  var found: [EKReminder] = []
  wait { done in
    store.fetchReminders(matching: store.predicateForReminders(in: [list])) { items in
      found = items ?? []
      done()
    }
  }
  // 未完成的全部显示；已完成的只显示最近 7 天内完成的。
  let recent = Date().addingTimeInterval(-7 * 86400)
  let visible = found.filter { !$0.isCompleted || ($0.completionDate ?? .distantPast) > recent }
  emit(["ok": true, "access": access(), "list": WORKBENCH, "reminders": visible.map(reminderJSON)])

case "create-reminder":
  requireAccess(.reminder)
  guard let title = input["title"] as? String, !title.isEmpty else { failure("invalid", "标题无效") }
  let reminder = EKReminder(eventStore: store)
  reminder.calendar = workbenchCalendar(.reminder, create: true, in: store)
  reminder.title = title
  if input["due"] != nil && !(input["due"] is NSNull) {
    guard let due = parseDate(input["due"]) else { failure("invalid", "提醒时间无效") }
    setDue(reminder, due)
  }
  do { try store.save(reminder, commit: true) } catch { failure("failed", error.localizedDescription) }
  guard let back = rereadReminder(reminder.calendarItemIdentifier) else {
    failure("failed", "已保存但回读不到，请在提醒事项应用里核对")
  }
  emit(["ok": true, "access": access(), "reminder": reminderJSON(back)])

case "update-reminder":
  requireAccess(.reminder)
  guard let id = input["id"] as? String,
    let reminder = store.calendarItem(withIdentifier: id) as? EKReminder
  else { failure("not_found", "提醒事项里已找不到这条") }
  guard isWorkbench(reminder.calendar) else {
    failure("readonly", "只能修改“工作台”列表里的提醒事项")
  }
  let expected = input["expectedModified"] as? String
  let current = reminder.lastModifiedDate.map { isoOut.string(from: $0) }
  if expected != current {
    failure("conflict", "提醒事项应用里已被修改", extra: ["current": reminderJSON(reminder)])
  }
  if let title = input["title"] as? String {
    guard !title.isEmpty else { failure("invalid", "标题无效") }
    reminder.title = title
  }
  if let completed = input["completed"] as? Bool { reminder.isCompleted = completed }
  if input.keys.contains("due") {
    if input["due"] is NSNull { setDue(reminder, nil) } else {
      guard let due = parseDate(input["due"]) else { failure("invalid", "提醒时间无效") }
      setDue(reminder, due)
    }
  }
  do { try store.save(reminder, commit: true) } catch { failure("failed", error.localizedDescription) }
  guard let back = rereadReminder(id) else {
    failure("failed", "已保存但回读不到，请在提醒事项应用里核对")
  }
  emit(["ok": true, "access": access(), "reminder": reminderJSON(back)])

default:
  failure("invalid", "未知命令 \(command)")
}
