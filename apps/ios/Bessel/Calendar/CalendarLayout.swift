import Foundation

/// Grid maths, ported from the web calendar (calendar-layout.ts and
/// grid-geometry.ts) so both lay events out the same way.
enum CalendarLayout {
    static let hourHeight: CGFloat = 52
    static let minEventHeight: CGFloat = 22
    static let compactHeight: CGFloat = 36
    static let snapMinutes = 15
    static let minDurationMinutes = 15
    static let defaultDurationMinutes = 60
    static let allDayRowHeight: CGFloat = 24

    struct Placed: Identifiable {
        let event: CalendarEvent
        let top: CGFloat
        let height: CGFloat
        let column: Int
        let columns: Int

        var id: UUID { event.id }
    }

    /// Timed events in one day column, side by side where they overlap.
    static func layoutDay(_ events: [CalendarEvent], day: Date) -> [Placed] {
        let calendar = Calendar.current
        let dayStart = calendar.startOfDay(for: day)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart)!

        struct Item {
            let event: CalendarEvent
            let startMin: Int
            let endMin: Int
        }

        func minutes(_ date: Date) -> Int {
            let parts = calendar.dateComponents([.hour, .minute], from: date)
            return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
        }

        let items = events
            .filter { !$0.allDay && $0.start < dayEnd && $0.end > dayStart }
            .map { event -> Item in
                let startMin = event.start <= dayStart ? 0 : minutes(event.start)
                let endMin = event.end >= dayEnd ? 1440 : minutes(event.end)
                return Item(event: event, startMin: startMin, endMin: max(endMin, startMin))
            }
            .sorted { $0.startMin != $1.startMin ? $0.startMin < $1.startMin : $0.endMin > $1.endMin }

        var placed: [Placed] = []
        var cluster: [(Item, Int)] = []
        var columnEnds: [Int] = []
        var clusterEnd = -1

        func flush() {
            for (item, column) in cluster {
                placed.append(Placed(
                    event: item.event,
                    top: CGFloat(item.startMin) / 60 * hourHeight,
                    height: max(CGFloat(item.endMin - item.startMin) / 60 * hourHeight, minEventHeight),
                    column: column,
                    columns: columnEnds.count
                ))
            }
            cluster = []
            columnEnds = []
        }

        for item in items {
            if item.startMin >= clusterEnd { flush() }
            let column = columnEnds.firstIndex { $0 <= item.startMin } ?? columnEnds.count
            if column == columnEnds.count { columnEnds.append(item.endMin) } else { columnEnds[column] = item.endMin }
            cluster.append((item, column))
            clusterEnd = max(clusterEnd, item.endMin)
        }
        flush()
        return placed
    }

    struct AllDayPlaced: Identifiable {
        let event: CalendarEvent
        let startColumn: Int
        let span: Int
        let row: Int

        var id: UUID { event.id }
    }

    /// All-day events as bars across the shown days, stacked into rows.
    static func layoutAllDay(_ events: [CalendarEvent], days: [Date]) -> (items: [AllDayPlaced], rows: Int) {
        guard let firstDay = days.first else { return ([], 0) }
        let calendar = Calendar.current
        func dayIndex(_ date: Date) -> Int {
            calendar.dateComponents([.day], from: firstDay, to: calendar.startOfDay(for: date)).day ?? 0
        }

        let spans = events
            .filter(\.allDay)
            .compactMap { event -> (CalendarEvent, Int, Int)? in
                let start = dayIndex(event.start)
                let end = dayIndex(event.end)
                let startColumn = max(start, 0)
                let endColumn = min(max(end, start + 1), days.count)
                let span = endColumn - startColumn
                return span > 0 ? (event, startColumn, span) : nil
            }
            .sorted { $0.1 != $1.1 ? $0.1 < $1.1 : $0.2 > $1.2 }

        var rowEnds: [Int] = []
        var items: [AllDayPlaced] = []
        for (event, startColumn, span) in spans {
            let row = rowEnds.firstIndex { $0 <= startColumn } ?? rowEnds.count
            if row == rowEnds.count { rowEnds.append(startColumn + span) } else { rowEnds[row] = startColumn + span }
            items.append(AllDayPlaced(event: event, startColumn: startColumn, span: span, row: row))
        }
        return (items, rowEnds.count)
    }

    /// The 15-minute slot at a height in the grid.
    static func snappedMinutes(atY y: CGFloat) -> Int {
        let raw = Int(y / hourHeight * 60)
        let snapped = (raw / snapMinutes) * snapMinutes
        return min(max(snapped, 0), 1440 - snapMinutes)
    }

    /// A height change in the grid as whole 15-minute steps.
    static func snappedDelta(forDY dy: CGFloat) -> Int {
        Int((dy / hourHeight * 60 / CGFloat(snapMinutes)).rounded()) * snapMinutes
    }

    static func date(_ day: Date, minutes: Int) -> Date {
        Calendar.current.date(byAdding: .minute, value: minutes, to: Calendar.current.startOfDay(for: day))!
    }
}
