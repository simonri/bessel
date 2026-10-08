import Foundation
import Observation

/// /v1/timeline: the day's sleep and screen time as segments.
struct TimelineResponse: Decodable {
    let startTs: Int
    let endTs: Int
    @Lossy var lanes: [Lane]

    struct Lane: Decodable {
        let key: String
        let totalSecs: Int
        @Lossy var segments: [Segment]
    }

    struct Segment: Decodable {
        let startTs: Int
        let endTs: Int
    }
}

/// /v1/location-history/day: places visited, from an imported Google Timeline.
struct LocationDayResponse: Decodable {
    @Lossy var visits: [Visit]

    struct Visit: Decodable {
        let startAt: Date
        let endAt: Date
        let name: String?
        let semanticType: String?
    }
}

/// One lane of the day ribbon, mirroring apps/web components/timeline/day-summary.ts.
struct RibbonLane: Identifiable {
    enum Key: String {
        case sleep, pc, places
    }

    struct Block: Identifiable, Equatable {
        let start: Date
        let end: Date
        let name: String
        let hue: Double

        var id: String { "\(start.timeIntervalSince1970)-\(name)" }
        var duration: TimeInterval { end.timeIntervalSince(start) }
    }

    let key: Key
    let totalSecs: Int
    let blocks: [Block]

    var id: Key { key }

    var title: String {
        switch key {
        case .sleep: "Sleep"
        case .pc: "Screen time"
        case .places: "Places"
        }
    }

    var hue: Double {
        switch key {
        case .sleep: 295
        case .pc: 235
        case .places: 165
        }
    }

    var icon: String {
        switch key {
        case .sleep: "moon.fill"
        case .pc: "desktopcomputer"
        case .places: "mappin"
        }
    }

    var summary: String {
        if blocks.isEmpty { return "Nothing yet" }
        if key == .places {
            let count = Set(blocks.map(\.name)).count
            return "\(count) \(count == 1 ? "place" : "places")"
        }
        return DayTimeline.duration(TimeInterval(totalSecs))
    }
}

@MainActor
@Observable
final class DayTimeline {
    private(set) var day: Date = Calendar.current.startOfDay(for: .now)
    private(set) var lanes: [RibbonLane] = []
    private(set) var hasLoaded = false
    @ObservationIgnored private var loadedDay: Date?

    private let client: APIClient
    @ObservationIgnored private var loads = LoadGeneration()

    /// Segments closer than a minute apart are one session.
    private static let mergeGap: TimeInterval = 60

    init(client: APIClient) {
        self.client = client
    }

    var isToday: Bool { Calendar.current.isDateInToday(day) }
    var dayEnd: Date { Calendar.current.date(byAdding: .day, value: 1, to: day)! }
    var isEmpty: Bool { lanes.allSatisfy(\.blocks.isEmpty) }

    /// Follows the day picked on the Health page.
    func show(_ date: Date) async {
        let target = Calendar.current.startOfDay(for: date)
        guard target != day else { return }
        day = target
        await load()
    }

    func loadIfStale() async {
        guard loads.isStale(maxAge: AppServices.freshFor) else { return }
        await load()
    }

    func load() async {
        let ticket = loads.begin()
        let shownDay = day
        let start = Int(day.timeIntervalSince1970)
        let end = Int(dayEnd.timeIntervalSince1970)
        do {
            let response: TimelineResponse = try await client.get("/v1/timeline", query: [
                URLQueryItem(name: "start_ts", value: String(start)),
                URLQueryItem(name: "end_ts", value: String(end)),
            ])
            var lanes = response.lanes.compactMap(Self.activityLane)
            // Places come from an imported Google Timeline; most days have none.
            if let location: LocationDayResponse = try? await client.get(
                "/v1/location-history/day",
                query: [URLQueryItem(name: "date", value: DateParsing.dateOnly.string(from: day))]
            ) {
                let places = placesLane(location.visits)
                if !places.blocks.isEmpty { lanes.append(places) }
            }
            guard loads.isCurrent(ticket) else { return }
            self.lanes = lanes
            loads.finish(ticket)
        } catch {
            // Keep what's there for the same day; another day's lanes would mislead.
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            if !hasLoaded || shownDay != loadedDay { lanes = [] }
        }
        loadedDay = shownDay
        hasLoaded = true
    }

    /// "You slept 6h 30m, spent 5h 40m at the computer and visited 3 places."
    var sentence: String? {
        var parts: [String] = []
        func lane(_ key: RibbonLane.Key) -> RibbonLane? {
            lanes.first { $0.key == key && !$0.blocks.isEmpty }
        }
        if let sleep = lane(.sleep) { parts.append("slept \(Self.duration(TimeInterval(sleep.totalSecs)))") }
        if let screen = lane(.pc) { parts.append("spent \(Self.duration(TimeInterval(screen.totalSecs))) at the computer") }
        if let places = lane(.places) {
            let count = Set(places.blocks.map(\.name)).count
            parts.append("visited \(count) \(count == 1 ? "place" : "places")")
        }
        guard let last = parts.popLast() else { return nil }
        return "You \(parts.isEmpty ? last : "\(parts.joined(separator: ", ")) and \(last)")."
    }

    private static func activityLane(_ lane: TimelineResponse.Lane) -> RibbonLane? {
        guard let key = RibbonLane.Key(rawValue: lane.key), key != .places else { return nil }
        var sessions: [(start: Int, end: Int)] = []
        for segment in lane.segments.sorted(by: { $0.startTs < $1.startTs }) {
            if let last = sessions.last, TimeInterval(segment.startTs - last.end) <= mergeGap {
                sessions[sessions.count - 1].end = max(last.end, segment.endTs)
            } else {
                sessions.append((segment.startTs, segment.endTs))
            }
        }
        let template = RibbonLane(key: key, totalSecs: 0, blocks: [])
        let blocks = sessions.map {
            RibbonLane.Block(
                start: Date(timeIntervalSince1970: TimeInterval($0.start)),
                end: Date(timeIntervalSince1970: TimeInterval($0.end)),
                name: template.title,
                hue: template.hue
            )
        }
        return RibbonLane(key: key, totalSecs: lane.totalSecs, blocks: blocks)
    }

    private func placesLane(_ visits: [LocationDayResponse.Visit]) -> RibbonLane {
        let blocks = visits
            .map { visit -> RibbonLane.Block in
                let name = Self.visitName(visit)
                return RibbonLane.Block(
                    start: max(day, visit.startAt),
                    end: min(dayEnd, visit.endAt),
                    name: name,
                    hue: PastelHue.forName(name)
                )
            }
            .filter { $0.end > $0.start }
            .sorted { $0.start < $1.start }
        let total = blocks.map(\.duration).reduce(0, +)
        return RibbonLane(key: .places, totalSecs: Int(total), blocks: blocks)
    }

    private static func visitName(_ visit: LocationDayResponse.Visit) -> String {
        if let name = visit.name { return name }
        let semantic = (visit.semanticType ?? "").lowercased()
        if semantic.contains("home") { return "Home" }
        if semantic.contains("work") { return "Work" }
        return "Somewhere"
    }

    /// "6h 05m" or "45m", matching the web's fmtDur.
    nonisolated static func duration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds / 60)
        if minutes >= 60 { return "\(minutes / 60)h \(String(format: "%02d", minutes % 60))m" }
        return "\(minutes)m"
    }
}
