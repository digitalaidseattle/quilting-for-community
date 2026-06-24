import { useContext, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { HomeOutlined, PlusOutlined } from "@ant-design/icons";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import dayjs from "dayjs";
import {
    Breadcrumbs,
    Button,
    Card,
    CardContent,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { ConfirmationDialog } from "@digitalaidseattle/mui";
import { LoadingContext, RefreshContext } from "@digitalaidseattle/core";
import { EventsService } from "../../services/events/EventsService";
import { EventSessionsDao } from "../../services/events/EventSessionsDao";
import { EventsDao } from "../../services/events/EventsDao";
import { Event, EventSession, SessionStatus } from "../../services/events/types";
import { formatSessionDate } from "../../utils/date-format";

type EventDialogProps = {
    service: EventsService;
    open: boolean;
    editing: Event;
    templateEvents: Event[];
    onClose: () => void;
    onSaved: () => void;
};

const EventDialog = ({
    service,
    open,
    editing,
    templateEvents,
    onClose,
    onSaved,
}: EventDialogProps) => {
    const { setLoading } = useContext(LoadingContext);
    const [event, setEvent] = useState<Event>(editing);
    const [sessions, setSessions] = useState<EventSession[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
    const [editingSession, setEditingSession] = useState<EventSession>(EventSessionsDao.empty());
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'event' } | { type: 'session', session: EventSession } | null>(null);

    useEffect(() => {
        setEvent(editing);
        setSelectedTemplateId('');
        if (editing.id) {
            service.sessions.getByEventId(editing.id as string).then(setSessions);
        } else {
            setSessions([]);
        }
    }, [editing, open]);

    function applyTemplate(templateId: string) {
        setSelectedTemplateId(templateId);
        const template = templateEvents.find((t) => t.id === templateId);
        if (!template) return;
        const { id: _id, created_at, updated_at, ...rest } = template;
        setEvent({
            ...rest,
            template: false,
            name: `${template.name} (copy)`,
        } as Event);
    }

    async function handleSaveEvent() {
        setLoading(true);
        try {
            if (event.id) {
                await service.events.update(event.id, event);
            } else {
                await service.events.insert(event);
            }
            onSaved();
            onClose();
        } finally {
            setLoading(false);
        }
    }

    function openNewSession() {
        if (!event.id) return;
        const start = new Date();
        const draft = service.sessionFromEvent(event, {
            start_at: start.toISOString().slice(0, 16),
            end_at: new Date(start.getTime() + event.duration * 60000).toISOString().slice(0, 16),
        });
        setEditingSession({
            ...draft,
            start_at: draft.start_at.slice(0, 16),
            end_at: draft.end_at.slice(0, 16),
        } as EventSession);
        setSessionDialogOpen(true);
    }

    function openEditSession(session: EventSession) {
        setEditingSession({
            ...session,
            start_at: session.start_at.slice(0, 16),
            end_at: session.end_at.slice(0, 16),
        });
        setSessionDialogOpen(true);
    }

    async function handleSaveSession() {
        if (!event.id) return;
        const payload = {
            ...editingSession,
            event_id: event.id as string,
            start_at: new Date(editingSession.start_at).toISOString(),
            end_at: new Date(editingSession.end_at).toISOString(),
        };
        setLoading(true);
        try {
            if (editingSession.id) {
                await service.sessions.update(editingSession.id, payload);
            } else {
                await service.sessions.insert(payload as EventSession);
            }
            setSessionDialogOpen(false);
            setSessions(await service.sessions.getByEventId(event.id as string));
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirmDelete() {
        if (!confirmDelete || !event.id) return;
        setLoading(true);
        try {
            if (confirmDelete.type === 'event') {
                await service.events.delete(event.id);
                setConfirmDelete(null);
                onSaved();
                onClose();
            } else if (confirmDelete.session.id) {
                await service.sessions.delete(confirmDelete.session.id);
                setConfirmDelete(null);
                setSessionDialogOpen(false);
                setSessions(await service.sessions.getByEventId(event.id as string));
            }
        } finally {
            setLoading(false);
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
                            <TextField label="Duration (minutes)" type="number" value={event.duration} onChange={(e) => setEvent({ ...event, duration: Number(e.target.value) })} sx={{ flex: 1 }} />
                            <TextField label="Max seats" type="number" value={event.max_seats} onChange={(e) => setEvent({ ...event, max_seats: Number(e.target.value) })} sx={{ flex: 1 }} />
                            <TextField label="Volunteer seats" type="number" value={event.volunteer_seat_count} onChange={(e) => setEvent({ ...event, volunteer_seat_count: Number(e.target.value) })} sx={{ flex: 1 }} />
                        </Stack>
                        <Stack direction="row" spacing={2}>
                            <TextField label="Price min" type="number" value={event.price_min} onChange={(e) => setEvent({ ...event, price_min: Number(e.target.value) })} sx={{ flex: 1 }} />
                            <TextField label="Price" type="number" value={event.price} onChange={(e) => setEvent({ ...event, price: Number(e.target.value) })} sx={{ flex: 1 }} />
                            <TextField label="Price max" type="number" value={event.price_max} onChange={(e) => setEvent({ ...event, price_max: Number(e.target.value) })} sx={{ flex: 1 }} />
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

                        {event.id && (
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
                        )}
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
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                            <DateTimePicker
                                label="End"
                                value={editingSession.end_at ? dayjs(editingSession.end_at) : null}
                                onChange={(value) => setEditingSession({
                                    ...editingSession,
                                    end_at: value?.format('YYYY-MM-DDTHH:mm') ?? '',
                                })}
                                slotProps={{ textField: { fullWidth: true } }}
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
                                <TextField
                                    label="Max seats"
                                    type="number"
                                    value={editingSession.max_seats}
                                    onChange={(e) => setEditingSession({ ...editingSession, max_seats: Number(e.target.value) })}
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
                            ? `Delete this session starting ${formatSessionDate(confirmDelete.session.start_at)}? This cannot be undone.`
                            : ''
                }
                handleConfirm={handleConfirmDelete}
                handleCancel={() => setConfirmDelete(null)}
            />
        </>
    );
};

export const AdminEventManagementPage = () => {
    const service = EventsService.getInstance();
    const { setLoading } = useContext(LoadingContext);
    const { refresh } = useContext(RefreshContext);

    const [events, setEvents] = useState<Event[]>([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Event>(EventsDao.empty());
    const [eventToDelete, setEventToDelete] = useState<Event | null>(null);

    useEffect(() => { fetchData(); }, [refresh]);

    function fetchData() {
        setLoading(true);
        service.events.getAll()
            .then(setEvents)
            .finally(() => setLoading(false));
    }

    function openNew() {
        setEditing(EventsDao.empty());
        setDialogOpen(true);
    }

    function openEdit(event: Event) {
        setEditing({ ...event });
        setDialogOpen(true);
    }

    async function handleClone(event: Event) {
        setLoading(true);
        try {
            await service.cloneEvent(event.id as string);
            fetchData();
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirmDeleteEvent() {
        if (!eventToDelete?.id) return;
        setLoading(true);
        try {
            await service.events.delete(eventToDelete.id);
            setEventToDelete(null);
            if (dialogOpen && editing.id === eventToDelete.id) {
                setDialogOpen(false);
            }
            fetchData();
        } finally {
            setLoading(false);
        }
    }

    const templateEvents = events.filter((e) => e.template);

    const columns = [
        { field: 'name', headerName: 'Name', flex: 1 },
        { field: 'category', headerName: 'Category', width: 120 },
        { field: 'max_seats', headerName: 'Seats', width: 80 },
        {
            field: 'template',
            headerName: 'Template',
            width: 100,
            valueGetter: (_: unknown, row: Event) => row.template ? 'Yes' : '',
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 230,
            sortable: false,
            renderCell: (params: { row: Event }) => (
                <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => openEdit(params.row)}>Edit</Button>
                    <Button size="small" onClick={() => handleClone(params.row)}>Clone</Button>
                    <Button size="small" color="error" onClick={() => setEventToDelete(params.row)}>Delete</Button>
                </Stack>
            ),
        },
    ];

    return (
        <>
            <Breadcrumbs sx={{ mb: 2 }}>
                <NavLink to="/"><IconButton size="medium"><HomeOutlined /></IconButton></NavLink>
                <Typography color="text.primary">Event Management</Typography>
            </Breadcrumbs>

            <Stack spacing={2}>
                <Stack direction="row" justifyContent="flex-end">
                    <Button variant="contained" startIcon={<PlusOutlined />} onClick={openNew}>
                        New event
                    </Button>
                </Stack>
                <Card>
                    <CardContent>
                        <DataGrid
                            rows={events}
                            columns={columns}
                            autoHeight
                            disableRowSelectionOnClick
                            pageSizeOptions={[10, 25]}
                            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                        />
                    </CardContent>
                </Card>
            </Stack>

            <EventDialog
                service={service}
                open={dialogOpen}
                editing={editing}
                templateEvents={templateEvents}
                onClose={() => setDialogOpen(false)}
                onSaved={fetchData}
            />

            <ConfirmationDialog
                open={eventToDelete != null}
                title="Delete event"
                message={`Delete "${eventToDelete?.name ?? ''}" and all of its sessions? This cannot be undone.`}
                handleConfirm={handleConfirmDeleteEvent}
                handleCancel={() => setEventToDelete(null)}
            />
        </>
    );
};
