import { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Calendar, dayjsLocalizer, View, Views } from "react-big-calendar";
import withDragAndDrop, { EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";
import dayjs from "dayjs";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { Event, EventSession, SessionStatus } from "../../services/events/types";
import {
    formatSessionDate,
    utcIsoToWallDate,
    wallDateToUtcIso,
} from "../../utils/date-format";

// Plain dayjs only — never import a module that extends dayjs/timezone here.
const localizer = dayjsLocalizer(dayjs);

type CalendarEvent = {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource: {
        session: EventSession;
        event: Event;
    };
};

const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar);

export type CalendarRange = {
    start: Date;
    end: Date;
};

type EventCalendarProps = {
    events: Event[];
    timeZone: string;
    onSessionSelect: (event: Event, session: EventSession) => void;
    onSessionTimesChange: (session: EventSession, startAt: string, endAt: string) => void;
    onRangeChange: (range: CalendarRange) => void;
};

function statusColor(status: SessionStatus): string {
    switch (status) {
        case 'published':
            return '#2e7d32';
        case 'cancelled':
            return '#757575';
        default:
            return '#1976d2';
    }
}

function toDate(value: string | Date): Date {
    return value instanceof Date ? value : new Date(value);
}

export const EventCalendar = ({
    events,
    timeZone,
    onSessionSelect,
    onSessionTimesChange,
    onRangeChange,
}: EventCalendarProps) => {
    const [view, setView] = useState<View>(Views.MONTH);

    const calendarEvents = useMemo<CalendarEvent[]>(() => events.flatMap((event) =>
        (event.event_sessions ?? []).map((session) => ({
            id: session.id as string,
            title: event.name,
            start: utcIsoToWallDate(session.start_at, timeZone),
            end: utcIsoToWallDate(session.end_at, timeZone),
            resource: { session, event },
        }))
    ), [events, timeZone]);

    function handleRangeChange(range: Date[] | { start: Date; end: Date }) {
        if (Array.isArray(range)) {
            // Week and day views report the visible days as an array.
            onRangeChange({
                start: range[0],
                end: dayjs(range[range.length - 1]).endOf('day').toDate(),
            });
        } else {
            onRangeChange(range);
        }
    }

    function applyTimes({ event, start, end, isAllDay }: EventInteractionArgs<CalendarEvent>) {
        let nextStart = toDate(start);
        let nextEnd = toDate(end);

        // Month drops can land as all-day; keep the original clock times on the new day.
        if (isAllDay) {
            const durationMs = event.end.getTime() - event.start.getTime();
            nextStart = dayjs(nextStart)
                .hour(event.start.getHours())
                .minute(event.start.getMinutes())
                .second(event.start.getSeconds())
                .millisecond(0)
                .toDate();
            nextEnd = new Date(nextStart.getTime() + durationMs);
        }

        if (nextEnd.getTime() <= nextStart.getTime()) {
            return;
        }
        if (
            nextStart.getTime() === event.start.getTime()
            && nextEnd.getTime() === event.end.getTime()
        ) {
            return;
        }

        onSessionTimesChange(
            event.resource.session,
            wallDateToUtcIso(nextStart, timeZone),
            wallDateToUtcIso(nextEnd, timeZone),
        );
    }

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: statusColor('draft') }} />
                    Draft
                </Typography>
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: statusColor('published') }} />
                    Published
                </Typography>
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: statusColor('cancelled') }} />
                    Cancelled
                </Typography>
            </Stack>
            <Box sx={{ height: 700 }}>
                <DnDCalendar
                    localizer={localizer}
                    events={calendarEvents}
                    views={[Views.MONTH, Views.WEEK, Views.DAY]}
                    view={view}
                    onView={setView}
                    defaultView={Views.MONTH}
                    startAccessor="start"
                    endAccessor="end"
                    style={{ height: '100%' }}
                    popup
                    // Month view only supports east/west resize (multi-day); disable that.
                    // Week/day keep north/south resize for duration.
                    resizable={view !== Views.MONTH}
                    onRangeChange={handleRangeChange}
                    onEventDrop={applyTimes}
                    onEventResize={applyTimes}
                    onSelectEvent={(calEvent) => onSessionSelect(calEvent.resource.event, calEvent.resource.session)}
                    eventPropGetter={(calEvent) => ({
                        style: {
                            backgroundColor: statusColor(calEvent.resource.session.status),
                            borderColor: statusColor(calEvent.resource.session.status),
                        },
                    })}
                    tooltipAccessor={(calEvent) => {
                        const { session, event } = calEvent.resource;
                        return `${event.name} · ${formatSessionDate(session.start_at, timeZone)} (${session.status})`;
                    }}
                />
            </Box>
        </Stack>
    );
};
