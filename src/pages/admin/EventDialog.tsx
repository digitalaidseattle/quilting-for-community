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
import { EventsService } from "../../services/events/EventsService";
import { EventSessionsDao } from "../../services/events/EventSessionsDao";
import { Event, EventSession, SessionStatus } from "../../services/events/types";
import { formatSessionDate } from "../../utils/date-format";

const PICKER_FORMAT = 'YYYY-MM-DDTHH:mm';

/** Converts a stored UTC timestamp to the local string the picker edits. */
function toPickerValue(timestamp: string): string {
    return dayjs(timestamp).format(PICKER_FORMAT);
}

export type EventDialogProps = {
    service: EventsService;
    open: boolean;
    editing: Event;
    templateEvents: Event[];
    initialSessionId?: string | null;
    onClose: () => void;
    onSaved: () => void;
    onInitialSessionOpened?: () => void;
};

export const EventDialog = ({
    service,
    open,
    editing,
    templateEvents,
    initialSessionId,
    onClose,
    onSaved,
    onInitialSessionOpened,
}: EventDialogProps) => {
    const { setLoading } = useContext(LoadingContext);
    const [event, setEvent] = useState<Event>(editing);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
    const [editingSession, setEditingSession] = useState<EventSession>(EventSessionsDao.empty());
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'event' } | { type: 'session', session: EventSession } | null>(null);

    const sessions = event.event_sessions ?? [];

    useEffect(() => {
        setEvent(editing);
        setSelectedTemplateId('');
        if (editing.id) {
            service.getById(editing.id).then((full) => setEvent(full ?? editing));
        }
    }, [editing, open]);

    useEffect(() => {
        if (!open || !initialSessionId || sessions.length === 0) {
            return;
        }
        const session = sessions.find((s) => s.id === initialSessionId);
        if (session) {
            setEditingSession({
                ...session,
                start_at: toPickerValue(session.start_at),
                end_at: toPickerValue(session.end_at),
            });
            setSessionDialogOpen(true);
            onInitialSessionOpened?.();
        }
    }, [open, initialSessionId, sessions, onInitialSessionOpened]);

    function applyTemplate(templateId: string) {
        setSelectedTemplateId(templateId);
        const template = templateEvents.find((t) => t.id === templateId);
        if (!template) return;
        const { id: _id, created_at, updated_at, event_sessions, ...rest } = template;
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
        const start = dayjs();
        const draft = service.sessionFromEvent(event, {
            start_at: start.format(PICKER_FORMAT),
            end_at: start.add(event.duration, 'minute').format(PICKER_FORMAT),
        });
        setEditingSession(draft);
        setSessionDialogOpen(true);
    }

    function openEditSession(session: EventSession) {
        setEditingSession({
            ...session,
            start_at: toPickerValue(session.start_at),
            end_at: toPickerValue(session.end_at),
        });
        setSessionDialogOpen(true);
    }

    // Session edits only touch the local aggregate. They persist with "Save event".
    function handleSaveSession() {
        const start = new Date(editingSession.start_at);
        const normalized = {
            ...editingSession,
            id: editingSession.id ?? crypto.randomUUID(),
            event_id: (event.id as string) ?? '',
            start_at: start.toISOString(),
            end_at: new Date(start.getTime() + event.duration * 60000).toISOString(),
        } as EventSession;

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
            valueGetter: (_: unknown, row: EventSession) => formatSessionDate(row.start_at),
        },
        {
            field: 'end_at',
            headerName: 'End',
            flex: 1,
            valueGetter: (_: unknown, row: EventSession) => formatSessionDate(row.end_at),
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
            <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
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
                            <NumberField label="Duration (minutes)" value={event.duration} onChange={(duration) => setEvent({ ...event, duration })} sx={{ flex: 1 }} />
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
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="subtitle1">Sessions</Typography>
                                <Button size="small" startIcon={<PlusOutlined />} onClick={openNewSession}>
                                    Add session
                                </Button>
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

            <Dialog open={sessionDialogOpen} onClose={() => setSessionDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editingSession.id ? 'Edit session' : 'New session'}</DialogTitle>
                <DialogContent>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <DateTimePicker
                                label="Start"
                                value={editingSession.start_at ? dayjs(editingSession.start_at) : null}
                                onChange={(value) => setEditingSession({
                                    ...editingSession,
                                    start_at: value?.format('YYYY-MM-DDTHH:mm') ?? '',
                                })}
                                slotProps={{
                                    textField: {
                                        fullWidth: true,
                                        helperText: editingSession.start_at
                                            ? `Ends ${dayjs(editingSession.start_at).add(event.duration, 'minute').format('MMM D, YYYY h:mm A')} (${event.duration} min)`
                                            : `Duration: ${event.duration} min`,
                                    },
                                }}
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
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={editingSession.max_seats != null}
                                        onChange={(e) => setEditingSession({
                                            ...editingSession,
                                            max_seats: e.target.checked ? event.max_seats : null,
                                        })}
                                    />
                                }
                                label={`Override max seats (event default: ${event.max_seats})`}
                            />
                            {editingSession.max_seats != null && (
                                <NumberField
                                    label="Max seats"
                                    value={editingSession.max_seats}
                                    onChange={(max_seats) => setEditingSession({ ...editingSession, max_seats })}
                                    fullWidth
                                />
                            )}
                        </Stack>
                    </LocalizationProvider>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between' }}>
                    {editingSession.id ? (
                        <Button color="error" onClick={() => setConfirmDelete({ type: 'session', session: editingSession })}>Delete session</Button>
                    ) : (
                        <span />
                    )}
                    <Stack direction="row" spacing={1}>
                        <Button onClick={() => setSessionDialogOpen(false)}>Cancel</Button>
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
                            ? `Remove this session starting ${formatSessionDate(confirmDelete.session.start_at)}? It will be deleted when you save the event.`
                            : ''
                }
                handleConfirm={handleConfirmDelete}
                handleCancel={() => setConfirmDelete(null)}
            />
        </>
    );
};
