import { useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Calendar, dayjsLocalizer, Views } from "react-big-calendar";
import dayjs from "dayjs";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Event, EventSession, SessionStatus } from "../../services/events/types";

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

type EventCalendarProps = {
    events: Event[];
    sessions: EventSession[];
    onSessionSelect: (event: Event, session: EventSession) => void;
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

export const EventCalendar = ({ events, sessions, onSessionSelect }: EventCalendarProps) => {
    const eventsById = useMemo(
        () => new Map(events.map((event) => [event.id as string, event])),
        [events],
    );

    const calendarEvents = useMemo<CalendarEvent[]>(() => sessions.flatMap((session) => {
        const event = eventsById.get(session.event_id);
        if (!event) {
            return [];
        }

        return [{
            id: session.id as string,
            title: event.name,
            start: new Date(session.start_at),
            end: new Date(session.end_at),
            resource: { session, event },
        }];
    }), [eventsById, sessions]);

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
                <Calendar
                    localizer={localizer}
                    events={calendarEvents}
                    views={[Views.MONTH, Views.WEEK, Views.DAY]}
                    defaultView={Views.MONTH}
                    startAccessor="start"
                    endAccessor="end"
                    style={{ height: '100%' }}
                    popup
                    onSelectEvent={(calEvent) => onSessionSelect(calEvent.resource.event, calEvent.resource.session)}
                    eventPropGetter={(calEvent) => ({
                        style: {
                            backgroundColor: statusColor(calEvent.resource.session.status),
                            borderColor: statusColor(calEvent.resource.session.status),
                        },
                    })}
                    tooltipAccessor={(calEvent) => {
                        const { session, event } = calEvent.resource;
                        return `${event.name} (${session.status})`;
                    }}
                />
            </Box>
        </Stack>
    );
};
