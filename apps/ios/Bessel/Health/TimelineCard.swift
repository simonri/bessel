import SwiftUI

/// The day left to right, like the desktop Timeline: one track per lane
/// (sleep, screen time, places) with night shaded and "now" marked on today.
/// Tap a block to see what it was and when.
struct TimelineCard: View {
    let timeline: DayTimeline

    @State private var selected: RibbonLane.Block?

    private static let axisHours = [0, 6, 12, 18, 24]
    private static let nightBefore = 6
    private static let nightFrom = 22
    private let trackHeight: CGFloat = 28

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if timeline.hasLoaded {
                if timeline.isEmpty {
                    VStack(spacing: 4) {
                        Text("A quiet day 🌙")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Theme.foreground)
                        Text("Sleep comes from Apple Health, screen time from the activity monitor and places from your Google Timeline.")
                            .font(.caption)
                            .foregroundStyle(Theme.mutedForeground)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                } else {
                    TimelineView(.periodic(from: .now, by: 60)) { context in
                        ribbon(now: context.date)
                    }
                    if let selected {
                        detail(selected)
                            .transition(.opacity)
                    }
                }
            }
        }
        .card(padding: 18)
        .animation(.snappy, value: selected)
        .onChange(of: timeline.day) { selected = nil }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(timeline.isToday ? "Your day so far" : "How \(timeline.day.formatted(.dateTime.weekday(.wide))) went")
                .font(.headline)
                .foregroundStyle(Theme.foreground)
            Text(timeline.hasLoaded ? (timeline.sentence ?? "Nothing recorded for this day yet.") : " ")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Ribbon

    private func ribbon(now: Date) -> some View {
        let start = timeline.day
        let end = timeline.dayEnd
        let nowFraction: Double? = timeline.isToday ? fraction(now, start, end) : nil

        return VStack(alignment: .leading, spacing: 14) {
            axis(start: start, end: end, nowFraction: nowFraction)
            ForEach(timeline.lanes) { lane in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Image(systemName: lane.icon)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.pastel(lane.hue))
                            .frame(width: 20, height: 20)
                            .background(Theme.pastelWash(lane.hue, strength: 1.3), in: Circle())
                        Text(lane.title)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Theme.foreground)
                        Text(lane.summary)
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(Theme.faintForeground)
                    }
                    track(lane, start: start, end: end, nowFraction: nowFraction)
                }
            }
        }
    }

    private func axis(start: Date, end: Date, nowFraction: Double?) -> some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                ForEach(Self.axisHours, id: \.self) { hour in
                    let x = fraction(hourDate(hour), start, end)
                    if nowFraction.map({ abs($0 - x) < 0.07 }) != true {
                        Text(hourDate(hour).formatted(.dateTime.hour()))
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(Theme.faintForeground)
                            .fixedSize()
                            .alignmentGuide(.leading) { dimensions in
                                let anchor = hour == 0 ? 0 : hour == 24 ? dimensions.width : dimensions.width / 2
                                return anchor - x * geometry.size.width
                            }
                    }
                }
                if let nowFraction {
                    Text("now")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(Theme.primary, in: Capsule())
                        .fixedSize()
                        .alignmentGuide(.leading) { dimensions in
                            let x = min(max(nowFraction, 0.06), 0.94) * geometry.size.width
                            return dimensions.width / 2 - x
                        }
                }
            }
        }
        .frame(height: 16)
    }

    private func track(_ lane: RibbonLane, start: Date, end: Date, nowFraction: Double?) -> some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            ZStack(alignment: .leading) {
                Theme.fill
                // Night: before 6am and from 10pm.
                Theme.border
                    .frame(width: fraction(hourDate(Self.nightBefore), start, end) * width)
                Theme.border
                    .frame(width: (1 - fraction(hourDate(Self.nightFrom), start, end)) * width)
                    .offset(x: fraction(hourDate(Self.nightFrom), start, end) * width)
                ForEach(lane.blocks) { block in
                    let x = fraction(block.start, start, end) * width
                    let blockWidth = max((fraction(block.end, start, end) - fraction(block.start, start, end)) * width, 3)
                    Rectangle()
                        .fill(Theme.pastelSolid(block.hue))
                        .opacity(selected == nil || selected == block ? 1 : 0.4)
                        .frame(width: blockWidth)
                        .offset(x: x)
                        .onTapGesture {
                            selected = selected == block ? nil : block
                        }
                        .accessibilityLabel("\(block.name), \(clock(block.start)) to \(clock(block.end))")
                }
                if let nowFraction {
                    Theme.primary
                        .frame(width: 2)
                        .offset(x: nowFraction * width - 1)
                        .allowsHitTesting(false)
                }
            }
        }
        .frame(height: trackHeight)
        .clipShape(Capsule())
    }

    private func detail(_ block: RibbonLane.Block) -> some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Theme.pastelSolid(block.hue))
                .frame(width: 8, height: 8)
            Text(block.name)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Theme.foreground)
            Text("\(clock(block.start)) to \(clock(block.end)) · \(DayTimeline.duration(block.duration))")
                .font(.subheadline)
                .monospacedDigit()
                .foregroundStyle(Theme.mutedForeground)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.85)
    }

    // MARK: - Helpers

    /// Wall-clock hours, so 23h/25h DST days still line up with the blocks.
    private func hourDate(_ hour: Int) -> Date {
        Calendar.current.date(byAdding: .hour, value: hour, to: timeline.day) ?? timeline.day
    }

    private func fraction(_ date: Date, _ start: Date, _ end: Date) -> Double {
        let span = end.timeIntervalSince(start)
        return min(max(date.timeIntervalSince(start) / span, 0), 1)
    }

    private func clock(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}
