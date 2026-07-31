import { useContext, useEffect, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import dayjs from "dayjs";
import {
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { ConfirmationDialog } from "@digitalaidseattle/mui";
import { LoadingContext } from "@digitalaidseattle/core";
import { NumberField } from "../../components/NumberField";
import { TimezoneSelect } from "../../components/TimezoneSelect";
import { EventsService } from "../../services/events/EventsService";
import { EventSessionsDao } from "../../services/events/EventSessionsDao";
import { EventSessionsService } from "../../services/events/EventSessionsService";
import { Event, EventSession, SessionStatus } from "../../services/events/types";
import {
    formatSessionDate,
    nowAsWallDate,
    utcIsoToWallDate,
    wallDateToUtcIso,
} from "../../utils/date-format";

export type EventDialogProps = {
    service: EventsService;
    open: boolean;
    editing: Event;
    templateEvents: Event[];
    timeZone: string;
    onTimeZoneChange: (timeZone: string) => void;
    initialSessionId?: string | null;
    /** Session snapshot from the calendar click — preferred over looking it up in stale state. */
    initialSession?: EventSession | null;
    /** When true, only the session dialog is shown (calendar click flow). */
    sessionOnly?: boolean;
    onOpenEventDetails?: () => void;
    onClose: () => void;
    onSaved: () => void;
    onInitialSessionOpened?: () => void;
};

export const EventDialog = ({
    service,
    open,
    editing,
    templateEvents,
    timeZone,
    onTimeZoneChange,
    initialSessionId,
    initialSession = null,
    sessionOnly = false,
    onOpenEventDetails,
    onClose,
    onSaved,
    onInitialSessionOpened,
}: EventDialogProps) => {
    const { setLoading } = useContext(LoadingContext);
    const [event, setEvent] = useState<Event>(editing);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
    const [editingSession, setEditingSession] = useState<EventSession>(EventSessionsDao.empty());
    const [sessionDuration, setSessionDuration] = useState(60);
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'event' } | { type: 'session', session: EventSession } | null>(null);

    const sessions = event.event_sessions ?? [];

    function durationMinutes(session: EventSession): number {
        const startMs = new Date(session.start_at).getTime();
        const endMs = new Date(session.end_at).getTime();
        if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
            return event.duration || 60;
        }
        return Math.max(1, Math.round((endMs - startMs) / 60000));
    }

    useEffect(() => {
        setEvent(editing);
        setSelectedTemplateId('');
        // In session-only mode the calendar already has current session times;
        // refetching can briefly race a just-finished drag and show stale times.
        if (editing.id && !sessionOnly) {
            service.getById(editing.id).then((full) => setEvent(full ?? editing));
        }
    }, [editing, open, sessionOnly]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const session = initialSession
            ?? (initialSessionId ? sessions.find((s) => s.id === initialSessionId) : undefined);
        if (!session) {
            return;
        }

        setEditingSession({ ...session });
        setSessionDuration(durationMinutes(session));
        setSessionDialogOpen(true);
        onInitialSessionOpened?.();
    }, [open, initialSession, initialSessionId, sessions, onInitialSessionOpened]);

    function applyTemplate(templateId: string) {
        setSelectedTemplateId(templateId);
        const template = templateEvents.find((t) => t.id === templateId);
        if (!template) return;
        const { id: _id, created_at: _createdAt, updated_at: _updatedAt, event_sessions: _sessions, ...rest } = template;
        setEvent({
            ...rest,
            template: false,
            name: `${template.name} (copy)`,
            // Keep any sessions the user has already drafted for this event.
            event_sessions: event.event_sessions,
        } as Event);
    }

    async function handleSaveEvent() {
        setLoading(true);
        try {
            await service.save(event);
            onSaved();
            onClose();
        } finally {
            setLoading(false);
        }
    }

    function openNewSession() {
        const startWall = nowAsWallDate(timeZone);
        const duration = event.duration || 60;
        const endWall = new Date(startWall.getTime() + duration * 60000);
        const draft = service.sessionFromEvent(event, {
            start_at: wallDateToUtcIso(startWall, timeZone),
            end_at: wallDateToUtcIso(endWall, timeZone),
        });
        setEditingSession(draft);
        setSessionDuration(duration);
        setSessionDialogOpen(true);
    }

    function openEditSession(session: EventSession) {
        setEditingSession({ ...session });
        setSessionDuration(durationMinutes(session));
        setSessionDialogOpen(true);
    }

    function closeSessionDialog() {
        setSessionDialogOpen(false);
        if (sessionOnly) {
            onClose();
        }
    }

    function updateSessionStart(wallDate: Date | null) {
        if (!wallDate || Number.isNaN(wallDate.getTime())) {
            setEditingSession({ ...editingSession, start_at: '' });
            return;
        }
        const startAt = wallDateToUtcIso(wallDate, timeZone);
        const endAt = wallDateToUtcIso(
            new Date(wallDate.getTime() + sessionDuration * 60000),
            timeZone,
        );
        setEditingSession({
            ...editingSession,
            start_at: startAt,
            end_at: endAt,
        });
    }

    function updateSessionDuration(minutes: number) {
        const duration = Math.max(1, minutes);
        setSessionDuration(duration);
        if (!editingSession.start_at) return;
        const startWall = utcIsoToWallDate(editingSession.start_at, timeZone);
        setEditingSession({
            ...editingSession,
            end_at: wallDateToUtcIso(
                new Date(startWall.getTime() + duration * 60000),
                timeZone,
            ),
        });
    }

    function buildNormalizedSession(): EventSession | null {
        if (!editingSession.start_at) return null;

        const startWall = utcIsoToWallDate(editingSession.start_at, timeZone);
        const duration = Math.max(1, sessionDuration);
        return {
            ...editingSession,
            id: editingSession.id ?? crypto.randomUUID(),
            event_id: (event.id as string) ?? '',
            start_at: wallDateToUtcIso(startWall, timeZone),
            end_at: wallDateToUtcIso(
                new Date(startWall.getTime() + duration * 60000),
                timeZone,
            ),
        } as EventSession;
    }

    // From the event form, session edits stay local until "Save event".
    // From the calendar (sessionOnly), persist immediately and return.
    async function handleSaveSession() {
        const normalized = buildNormalizedSession();
        if (!normalized) return;

        if (sessionOnly) {
            setLoading(true);
            try {
                await EventSessionsService.getInstance().upsert(normalized);
                onSaved();
                onClose();
            } finally {
                setLoading(false);
            }
            return;
        }

        const others = sessions.filter((session) => session.id !== normalized.id);
        setEvent({
            ...event,
            event_sessions: [...others, normalized]
                .sort((a, b) => a.start_at.localeCompare(b.start_at)),
        });
        setSessionDialogOpen(false);
    }

    async function handleConfirmDelete() {
        if (!confirmDelete) return;
        if (confirmDelete.type === 'event') {
            if (!event.id) return;
            setLoading(true);
            try {
                await service.delete(event.id);
                setConfirmDelete(null);
                onSaved();
                onClose();
            } finally {
                setLoading(false);
            }
        } else if (sessionOnly && confirmDelete.session.id) {
            setLoading(true);
            try {
                await EventSessionsService.getInstance().delete(confirmDelete.session.id);
                setConfirmDelete(null);
                onSaved();
                onClose();
            } finally {
                setLoading(false);
            }
        } else {
            setEvent({
                ...event,
                event_sessions: sessions.filter((session) => session.id !== confirmDelete.session.id),
            });
            setConfirmDelete(null);
            setSessionDialogOpen(false);
        }
    }

    const sessionColumns = [
        {
            field: 'start_at',
            headerName: 'Start',
            flex: 1,
            valueGetter: (_: unknown, row: EventSession) => formatSessionDate(row.start_at, timeZone),
        },
        {
            field: 'end_at',
            headerName: 'End',
            flex: 1,
            valueGetter: (_: unknown, row: EventSession) => formatSessionDate(row.end_at, timeZone),
        },
        { field: 'status', headerName: 'Status', width: 110 },
        {
            field: 'actions',
            headerName: '',
            width: 130,
            sortable: false,
            renderCell: (params: { row: EventSession }) => (
                <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => openEditSession(params.row)}>Edit</Button>
                    <Button size="small" color="error" onClick={() => setConfirmDelete({ type: 'session', session: params.row })}>Delete</Button>
                </Stack>
            ),
        },
    ];

    return (
        <>
            <Dialog open={open && !sessionOnly} onClose={onClose} maxWidth="md" fullWidth>
                <DialogTitle>{event.id ? 'Edit event' : 'New event'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {!event.id && templateEvents.length > 0 && (
                            <TextField
                                select
                                label="Clone from template"
                                value={selectedTemplateId}
                                onChange={(e) => applyTemplate(e.target.value)}
                                fullWidth
                            >
                                <MenuItem value="">Blank event</MenuItem>
                                {templateEvents.map((t) => (
                                    <MenuItem key={t.id as string} value={t.id as string}>{t.name}</MenuItem>
                                ))}
                            </TextField>
                        )}
                        <TextField label="Name" value={event.name} onChange={(e) => setEvent({ ...event, name: e.target.value })} fullWidth />
                        <TextField label="Description" value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} multiline rows={3} fullWidth />
                        <TextField label="Notes" value={event.notes} onChange={(e) => setEvent({ ...event, notes: e.target.value })} multiline rows={2} fullWidth />
                        <TextField label="Category" value={event.category} onChange={(e) => setEvent({ ...event, category: e.target.value })} fullWidth />
                        <Stack direction="row" spacing={2}>
                            <NumberField
                                label="Default duration (minutes)"
                                value={event.duration}
                                onChange={(duration) => setEvent({ ...event, duration })}
                                helperText="Used when adding new sessions"
                                sx={{ flex: 1 }}
                            />
                            <NumberField label="Max seats" value={event.max_seats} onChange={(max_seats) => setEvent({ ...event, max_seats })} sx={{ flex: 1 }} />
                            <NumberField label="Volunteer seats" value={event.volunteer_seat_count} onChange={(volunteer_seat_count) => setEvent({ ...event, volunteer_seat_count })} sx={{ flex: 1 }} />
                        </Stack>
                        <Stack direction="row" spacing={2}>
                            <NumberField label="Price min" value={event.price_min} onChange={(price_min) => setEvent({ ...event, price_min })} sx={{ flex: 1 }} />
                            <NumberField label="Price" value={event.price} onChange={(price) => setEvent({ ...event, price })} sx={{ flex: 1 }} />
                            <NumberField label="Price max" value={event.price_max} onChange={(price_max) => setEvent({ ...event, price_max })} sx={{ flex: 1 }} />
                        </Stack>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={event.template}
                                    onChange={(e) => setEvent({ ...event, template: e.target.checked })}
                                />
                            }
                            label="Mark as template (shows in clone picker for other events)"
                        />

                        <Stack spacing={1}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
                                <Typography variant="subtitle1">Sessions</Typography>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <TimezoneSelect value={timeZone} onChange={onTimeZoneChange} />
                                    <Button size="small" startIcon={<PlusOutlined />} onClick={openNewSession}>
                                        Add session
                                    </Button>
                                </Stack>
                            </Stack>
                            <DataGrid
                                rows={sessions}
                                columns={sessionColumns}
                                autoHeight
                                disableRowSelectionOnClick
                                hideFooter={sessions.length <= 5}
                                pageSizeOptions={[5, 10]}
                                initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
                            />
                        </Stack>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="contained" onClick={handleSaveEvent}>Save event</Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={open && sessionDialogOpen}
                onClose={closeSessionDialog}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    {editingSession.id ? 'Edit session' : 'New session'}
                    {sessionOnly && event.name ? ` · ${event.name}` : ''}
                </DialogTitle>
                <DialogContent>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <TimezoneSelect value={timeZone} onChange={onTimeZoneChange} fullWidth />
                            <DateTimePicker
                                label="Start"
                                value={editingSession.start_at
                                    ? dayjs(utcIsoToWallDate(editingSession.start_at, timeZone))
                                    : null}
                                onChange={(value) => updateSessionStart(value?.toDate() ?? null)}
                                slotProps={{
                                    textField: {
                                        fullWidth: true,
                                        helperText: editingSession.start_at
                                            ? `Ends ${dayjs(utcIsoToWallDate(editingSession.start_at, timeZone)).add(sessionDuration, 'minute').format('MMM D, YYYY h:mm A')}`
                                            : undefined,
                                    },
                                }}
                            />
                            <NumberField
                                label="Duration (minutes)"
                                value={sessionDuration}
                                onChange={updateSessionDuration}
                                helperText={`Event default: ${event.duration} min`}
                                fullWidth
                            />
                            <TextField
                                select
                                label="Status"
                                value={editingSession.status}
                                onChange={(e) => setEditingSession({ ...editingSession, status: e.target.value as SessionStatus })}
                                fullWidth
                            >
                                <MenuItem value="draft">Draft</MenuItem>
                                <MenuItem value="published">Published</MenuItem>
                                <MenuItem value="cancelled">Cancelled</MenuItem>
                            </TextField>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <FormControlLabel
                                    sx={{ flexShrink: 0, mr: 0 }}
                                    control={
                                        <Checkbox
                                            checked={editingSession.max_seats != null}
                                            onChange={(e) => setEditingSession({
                                                ...editingSession,
                                                max_seats: e.target.checked ? event.max_seats : null,
                                            })}
                                        />
                                    }
                                    label={`Override max seats (default: ${event.max_seats})`}
                                />
                                {editingSession.max_seats != null && (
                                    <NumberField
                                        label="Max seats"
                                        value={editingSession.max_seats}
                                        onChange={(max_seats) => setEditingSession({ ...editingSession, max_seats })}
                                        sx={{ flex: 1 }}
                                    />
                                )}
                            </Stack>
                        </Stack>
                    </LocalizationProvider>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between' }}>
                    {editingSession.id ? (
                        <Button color="error" onClick={() => setConfirmDelete({ type: 'session', session: editingSession })}>Delete session</Button>
                    ) : (
                        <span />
                    )}
                    <Stack direction="row" spacing={1} alignItems="center">
                        {sessionOnly && onOpenEventDetails && (
                            <Button onClick={() => {
                                setSessionDialogOpen(false);
                                onOpenEventDetails();
                            }}>
                                Edit event
                            </Button>
                        )}
                        <Button onClick={closeSessionDialog}>Cancel</Button>
                        <Button variant="contained" onClick={handleSaveSession}>Save session</Button>
                    </Stack>
                </DialogActions>
            </Dialog>

            <ConfirmationDialog
                open={confirmDelete != null}
                title={confirmDelete?.type === 'event' ? 'Delete event' : 'Delete session'}
                message={
                    confirmDelete?.type === 'event'
                        ? `Delete "${event.name}" and all of its sessions? This cannot be undone.`
                        : confirmDelete?.type === 'session'
                            ? sessionOnly
                                ? `Delete this session starting ${formatSessionDate(confirmDelete.session.start_at, timeZone)}? This cannot be undone.`
                                : `Remove this session starting ${formatSessionDate(confirmDelete.session.start_at, timeZone)}? It will be deleted when you save the event.`
                            : ''
                }
                handleConfirm={handleConfirmDelete}
                handleCancel={() => setConfirmDelete(null)}
            />
        </>
    );
};
