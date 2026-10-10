// 本机小助手：macOS 日历与提醒事项（EventKit）。路线 v3 5.2；产品定义 v1.2 §4.8、v1.1 §4.5。
// 由 server/calendar.mjs 通过子进程调用：/usr/bin/swift calendar-helper.swift <命令> '<JSON 参数>'
// 每次只打印一行 JSON：{"ok":true,...} 或 {"ok":false,"error":"denied|not_found|conflict|readonly|invalid|failed","message":"..."}。
// 读取：指定时间段内所有日历的事件（只有“工作台”日历可改）、“工作台”提醒事项列表。
// 写入：只在“工作台”日历 / 列表中新建与修改；确认后可删除工作台规划块。保存后独立回读。
// 修改前比对 expectedModified（上次回读的最后修改时间），不一致即返回 conflict 与当前内容，不写入。
// 不联网；其他日历和提醒事项不删除。
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
  var value: [String: Any] = [
    "id": e.eventIdentifier ?? e.calendarItemIdentifier,
    "calendar": e.calendar?.title ?? "",
    "workbench": isWorkbench(e.calendar),
    "title": e.title ?? "",
    "start": iso(e.startDate),
    "end": iso(e.endDate),
    "allDay": e.isAllDay,
    "modified": iso(e.lastModifiedDate),
  ]
  if isWorkbench(e.calendar) {
    let currentNotes = e.notes ?? ""
    if currentNotes.utf16.count > 2000 { value["notesOverflow"] = true }
    else { value["notes"] = currentNotes }
  }
  return value
}
func reminderJSON(_ r: EKReminder) -> [String: Any] {
  [
    "id": r.calendarItemIdentifier,
    "title": r.title ?? "",
    "completed": r.isCompleted,
    "due": iso(r.dueDateComponents.flatMap { Calendar.current.date(from: $0) }),
    "dueHasTime": r.dueDateComponents?.hour != nil && r.dueDateComponents?.minute != nil,
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
func requestFullAccess(_ body: (@escaping (Bool, Error?) -> Void) -> Void) -> (Bool, NSError?) {
  let semaphore = DispatchSemaphore(value: 0)
  var granted = false
  var requestError: NSError? = nil
  body { accepted, error in
    granted = accepted
    requestError = error as NSError?
    semaphore.signal()
  }
  semaphore.wait()
  return (granted, requestError)
}

func setDue(_ reminder: EKReminder, _ due: Date?) {
  // 只改到期时间；新条目不加系统闹钟，旧条目的已有闹钟保持原样。
  if let due = due {
    reminder.dueDateComponents = Calendar.current.dateComponents(
      [.year, .month, .day, .hour, .minute, .second, .timeZone], from: due)
  } else {
    reminder.dueDateComponents = nil
  }
}

switch command {
case "status":
  emit(["ok": true, "access": access()])

case "request-access":
  // 只在用户于页面点击“授权”时调用；系统会弹出权限对话框。
  let (eventsGranted, eventsError) = requestFullAccess { done in store.requestFullAccessToEvents(completion: done) }
  let (remindersGranted, remindersError) = requestFullAccess { done in store.requestFullAccessToReminders(completion: done) }
  let current = access()
  if current["calendar"] as? String != "authorized" {
    let detail = eventsError.map { "\($0.domain) \($0.code): \($0.localizedDescription)" }
      ?? (eventsGranted ? "系统权限状态仍未更新" : "系统没有授予完全访问")
    failure("failed", "日历授权未完成：\(detail)", extra: ["access": current])
  }
  if current["reminders"] as? String != "authorized" {
    let detail = remindersError.map { "\($0.domain) \($0.code): \($0.localizedDescription)" }
      ?? (remindersGranted ? "系统权限状态仍未更新" : "系统没有授予完全访问")
    failure("failed", "提醒事项授权未完成：\(detail)", extra: ["access": current])
  }
  emit(["ok": true, "access": current])

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
  if input.keys.contains("allDay") && !(input["allDay"] is Bool) {
    failure("invalid", "全天状态无效")
  }
  event.isAllDay = (input["allDay"] as? Bool) ?? false
  event.title = title
  event.startDate = start
  event.endDate = end
  if input.keys.contains("notes") {
    guard let notes = input["notes"] as? String, notes.count <= 2000, !notes.contains("\0") else {
      failure("invalid", "备注不能超过 2000 字或包含空字符")
    }
    event.notes = notes
  }
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
  if input.keys.contains("allDay") {
    guard let allDay = input["allDay"] as? Bool else { failure("invalid", "全天状态无效") }
    event.isAllDay = allDay
  }
  event.title = title
  event.startDate = start
  event.endDate = end
  if input.keys.contains("notes") {
    guard let notes = input["notes"] as? String, notes.count <= 2000, !notes.contains("\0") else {
      failure("invalid", "备注不能超过 2000 字或包含空字符")
    }
    event.notes = notes
  }
  do { try store.save(event, span: .thisEvent, commit: true) } catch {
    failure("failed", error.localizedDescription)
  }
  guard let back = rereadEvent(event.eventIdentifier ?? id) else {
    failure("failed", "已保存但回读不到，请在日历应用里核对")
  }
  emit(["ok": true, "access": access(), "event": eventJSON(back)])

case "lookup-event":
  requireAccess(.event)
  guard let id = input["id"] as? String, !id.isEmpty else { failure("invalid", "条目标识无效") }
  if let event = store.event(withIdentifier: id) {
    emit(["ok": true, "access": access(), "found": true, "event": eventJSON(event)])
  }
  emit(["ok": true, "access": access(), "found": false])

case "delete-event":
  requireAccess(.event)
  guard input["confirmed"] as? Bool == true else { failure("invalid", "删除前需要二次确认") }
  guard let id = input["id"] as? String, let expected = input["expectedModified"] as? String,
    let event = store.event(withIdentifier: id) else { failure("not_found", "日历里已找不到这条") }
  guard let selected = workbenchCalendar(.event, create: false, in: store),
    isWorkbench(event.calendar), event.calendar.calendarIdentifier == selected.calendarIdentifier else {
    failure("readonly", "只能删除当前“工作台”日历里的规划块")
  }
  let current = event.lastModifiedDate.map { isoOut.string(from: $0) }
  guard current == expected else {
    failure("conflict", "日历应用里已被修改", extra: ["current": eventJSON(event)])
  }
  do { try store.remove(event, span: .thisEvent, commit: true) } catch {
    failure("failed", "删除操作结果未知：\(error.localizedDescription)")
  }
  guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
    failure("failed", "删除后日历权限变化，无法独立回读")
  }
  guard rereadEvent(id) == nil else {
    failure("failed", "删除后独立回读仍见该条目，请核对")
  }
  emit(["ok": true, "access": access(), "deleted": true, "verified": true])

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
  // 完成后保留 24 小时；系统未提供完成时间时无法判断是否过期，先保留。
  let completedCutoff = Date().addingTimeInterval(-24 * 60 * 60)
  let visible = found.filter { reminder in
    guard reminder.isCompleted, let completedAt = reminder.completionDate else { return true }
    return completedAt >= completedCutoff
  }
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
