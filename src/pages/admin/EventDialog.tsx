import { useContext, useEffect, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import dayjs from "dayjs";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    InputAdornment,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { ConfirmationDialog } from "@digitalaidseattle/mui";
import { LoadingContext } from "@digitalaidseattle/core";
import { EventCategorySelect } from "../../components/EventCategorySelect";
import { NumberField } from "../../components/NumberField";
import { EventsService } from "../../services/events/EventsService";
import { EventSessionsDao } from "../../services/events/EventSessionsDao";
import { EventSessionsService } from "../../services/events/EventSessionsService";
import { Event, EventSession, EventStatus, SessionStatus } from "../../services/events/types";
import {
    EventFieldErrors,
    hasEventErrors,
    validateEvent,
} from "../../services/events/eventValidation";
import { Profile } from "../../services/members/ProfilesDao";
import { profileLabel, ProfilesService } from "../../services/members/ProfilesService";
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
    onTimeZoneChange: _onTimeZoneChange,
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
    const [sessionDurationError, setSessionDurationError] = useState('');
    const [sessionStartError, setSessionStartError] = useState('');
    const [sessionMaxSeatsError, setSessionMaxSeatsError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<EventFieldErrors>({});
    const [instructorOptions, setInstructorOptions] = useState<Profile[]>([]);
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'event' } | { type: 'session', session: EventSession } | null>(null);

    const sessions = event.event_sessions ?? [];
    const selectedInstructor = instructorOptions.find((profile) => profile.id === event.instructor_id)
        ?? (event.instructor && event.instructor_id
            ? {
                id: event.instructor.id,
                name: event.instructor.name,
                email: event.instructor.email,
                first_name: event.instructor.first_name,
                last_name: event.instructor.last_name,
                phone: '',
                roles: [],
                waiver_accepted: false,
            } as unknown as Profile
            : null);

    function defaultDurationMinutes(): number {
        return Math.max(1, event.duration || 60);
    }

    function durationMinutes(session: EventSession): number {
        const startMs = new Date(session.start_at).getTime();
        const endMs = new Date(session.end_at).getTime();
        if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
            return defaultDurationMinutes();
        }
        return Math.max(1, Math.round((endMs - startMs) / 60000));
    }

    useEffect(() => {
        if (!open || sessionOnly) {
            return;
        }
        ProfilesService.getInstance().getInstructorCandidates()
            .then(setInstructorOptions)
            .catch(() => setInstructorOptions([]));
    }, [open, sessionOnly]);

    useEffect(() => {
        setEvent(editing);
        setSelectedTemplateId('');
        setFieldErrors({});
        setSessionDurationError('');
        setSessionStartError('');
        setSessionMaxSeatsError('');
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
        setSessionDurationError('');
        setSessionStartError('');
        setSessionMaxSeatsError('');
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
        setFieldErrors({});
    }

    function updateEvent<K extends keyof Event>(key: K, value: Event[K]) {
        setEvent((prev) => ({ ...prev, [key]: value }));
        setFieldErrors((prev) => {
            if (!prev[key as keyof EventFieldErrors]) return prev;
            const next = { ...prev };
            delete next[key as keyof EventFieldErrors];
            return next;
        });
    }

    async function handleSaveEvent() {
        const errors = validateEvent(event);
        setFieldErrors(errors);
        if (hasEventErrors(errors)) {
            return;
        }

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
        const duration = defaultDurationMinutes();
        const endWall = new Date(startWall.getTime() + duration * 60000);
        const draft = service.sessionFromEvent(event, {
            start_at: wallDateToUtcIso(startWall, timeZone),
            end_at: wallDateToUtcIso(endWall, timeZone),
        });
        setEditingSession(draft);
        setSessionDuration(duration);
        setSessionDurationError('');
        setSessionStartError('');
        setSessionMaxSeatsError('');
        setSessionDialogOpen(true);
    }

    function openEditSession(session: EventSession) {
        setEditingSession({ ...session });
        setSessionDuration(durationMinutes(session));
        setSessionDurationError('');
        setSessionStartError('');
        setSessionMaxSeatsError('');
        setSessionDialogOpen(true);
    }

    function closeSessionDialog() {
        setSessionDialogOpen(false);
        if (sessionOnly) {
            onClose();
        }
    }

    function sessionStartWall(): Date | null {
        if (!editingSession.start_at) return null;
        const wallDate = utcIsoToWallDate(editingSession.start_at, timeZone);
        return Number.isNaN(wallDate.getTime()) ? null : wallDate;
    }

    function updateSessionStart(wallDate: Date | null) {
        setSessionStartError('');
        if (!wallDate || Number.isNaN(wallDate.getTime())) {
            setEditingSession({ ...editingSession, start_at: '' });
            return;
        }
        const safeDuration = Math.max(1, sessionDuration);
        const startAt = wallDateToUtcIso(wallDate, timeZone);
        const endAt = wallDateToUtcIso(
            new Date(wallDate.getTime() + safeDuration * 60000),
            timeZone,
        );
        setEditingSession({
            ...editingSession,
            start_at: startAt,
            end_at: endAt,
        });
    }

    function updateSessionDate(date: Date | null) {
        if (!date || Number.isNaN(date.getTime())) {
            updateSessionStart(null);
            return;
        }
        const current = sessionStartWall() ?? nowAsWallDate(timeZone);
        const next = new Date(date);
        next.setHours(current.getHours(), current.getMinutes(), 0, 0);
        updateSessionStart(next);
    }

    function updateSessionTime(time: Date | null) {
        if (!time || Number.isNaN(time.getTime())) {
            return;
        }
        const current = sessionStartWall() ?? nowAsWallDate(timeZone);
        const next = new Date(current);
        next.setHours(time.getHours(), time.getMinutes(), 0, 0);
        updateSessionStart(next);
    }

    function updateSessionDuration(minutes: number) {
        setSessionDuration(minutes);
        if (minutes < 1) {
            setSessionDurationError('Duration must be at least 1 minute');
            return;
        }
        setSessionDurationError('');
        if (!editingSession.start_at) return;
        const startWall = utcIsoToWallDate(editingSession.start_at, timeZone);
        setEditingSession({
            ...editingSession,
            end_at: wallDateToUtcIso(
                new Date(startWall.getTime() + minutes * 60000),
                timeZone,
            ),
        });
    }

    function validateSessionFields(): boolean {
        let valid = true;
        if (!editingSession.start_at) {
            setSessionStartError('Start date/time is required');
            valid = false;
        } else {
            setSessionStartError('');
        }
        if (sessionDuration < 1) {
            setSessionDurationError('Duration must be at least 1 minute');
            valid = false;
        } else {
            setSessionDurationError('');
        }
        if (editingSession.max_seats != null && editingSession.max_seats < 1) {
            setSessionMaxSeatsError('Max seats must be at least 1');
            valid = false;
        } else {
            setSessionMaxSeatsError('');
        }
        return valid;
    }

    function buildNormalizedSession(): EventSession | null {
        if (!editingSession.start_at || sessionDuration < 1) return null;

        const startWall = utcIsoToWallDate(editingSession.start_at, timeZone);
        return {
            ...editingSession,
            id: editingSession.id ?? crypto.randomUUID(),
            event_id: (event.id as string) ?? '',
            start_at: wallDateToUtcIso(startWall, timeZone),
            end_at: wallDateToUtcIso(
                new Date(startWall.getTime() + sessionDuration * 60000),
                timeZone,
            ),
        } as EventSession;
    }

    // From the event form, session edits stay local until "Save event".
    // From the calendar (sessionOnly), persist immediately and return.
    async function handleSaveSession() {
        if (!validateSessionFields()) return;

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
        setFieldErrors((prev) => {
            if (!prev.sessions) return prev;
            const next = { ...prev };
            delete next.sessions;
            return next;
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
            minWidth: 0,
            valueGetter: (_: unknown, row: EventSession) => formatSessionDate(row.start_at, timeZone),
        },
        {
            field: 'end_at',
            headerName: 'End',
            flex: 1,
            minWidth: 0,
            valueGetter: (_: unknown, row: EventSession) => formatSessionDate(row.end_at, timeZone),
        },
        { field: 'status', headerName: 'Status', width: 110 },
        {
            field: 'actions',
            headerName: '',
            width: 160,
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
                        <TextField
                            label="Title"
                            value={event.name}
                            onChange={(e) => updateEvent('name', e.target.value)}
                            required
                            error={Boolean(fieldErrors.name)}
                            helperText={fieldErrors.name}
                            fullWidth
                        />
                        <Stack direction="row" spacing={2} alignItems="flex-start">
                            <TextField
                                label="Description"
                                value={event.description}
                                onChange={(e) => updateEvent('description', e.target.value)}
                                multiline
                                rows={3}
                                sx={{ flex: 1 }}
                            />
                            <TextField
                                label="Notes"
                                value={event.notes}
                                onChange={(e) => updateEvent('notes', e.target.value)}
                                placeholder="Internal Notes"
                                multiline
                                rows={3}
                                sx={{ flex: 1 }}
                            />
                        </Stack>
                        <Stack direction="row" spacing={2}>
                            <EventCategorySelect
                                value={event.category}
                                onChange={(category) => updateEvent('category', category)}
                                sx={{ flex: 1 }}
                            />
                            <Autocomplete
                                options={instructorOptions}
                                value={selectedInstructor}
                                onChange={(_event, profile) => {
                                    setEvent((prev) => ({
                                        ...prev,
                                        instructor_id: (profile?.id as string) ?? null,
                                        instructor: profile
                                            ? {
                                                id: profile.id as string,
                                                name: profile.name,
                                                email: profile.email,
                                                first_name: profile.first_name,
                                                last_name: profile.last_name,
                                            }
                                            : null,
                                    }));
                                }}
                                getOptionLabel={(profile) => profileLabel(profile)}
                                isOptionEqualToValue={(a, b) => a.id === b.id}
                                filterOptions={(options, state) => {
                                    const query = state.inputValue.trim().toLowerCase();
                                    if (!query) return options;
                                    return options.filter((profile) => {
                                        const haystack = [
                                            profile.name,
                                            profile.email,
                                            profile.first_name,
                                            profile.last_name,
                                            profileLabel(profile),
                                        ].filter(Boolean).join(' ').toLowerCase();
                                        return haystack.includes(query);
                                    });
                                }}
                                renderOption={(props, profile) => (
                                    <li {...props} key={profile.id as string}>
                                        <Stack>
                                            <Typography variant="body2">{profileLabel(profile)}</Typography>
                                            {profile.email && profileLabel(profile) !== profile.email && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {profile.email}
                                                </Typography>
                                            )}
                                        </Stack>
                                    </li>
                                )}
                                renderInput={(params) => (
                                    <TextField {...params} label="Instructor" />
                                )}
                                sx={{ flex: 1 }}
                            />
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="flex-start">
                            <Stack direction="row" spacing={2} sx={{ flex: 1 }}>
                                <TextField
                                    select
                                    label="Status"
                                    value={event.status}
                                    onChange={(e) => setEvent({ ...event, status: e.target.value as EventStatus })}
                                    sx={{ flex: 1 }}
                                >
                                    <MenuItem value="draft">Draft</MenuItem>
                                    <MenuItem value="published">Published</MenuItem>
                                    <MenuItem value="cancelled">Cancelled</MenuItem>
                                </TextField>
                                <NumberField
                                    label="Default duration (minutes)"
                                    value={event.duration}
                                    onChange={(duration) => updateEvent('duration', duration)}
                                    min={1}
                                    required
                                    error={Boolean(fieldErrors.duration)}
                                    helperText={fieldErrors.duration ?? 'Used when adding new sessions'}
                                    sx={{ flex: 1 }}
                                />
                                <NumberField
                                    label="Price"
                                    value={event.price}
                                    onChange={(price) => updateEvent('price', price)}
                                    min={0}
                                    required
                                    error={Boolean(fieldErrors.price)}
                                    helperText={fieldErrors.price}
                                    sx={{ flex: 1 }}
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                    }}
                                />
                            </Stack>
                            <Stack direction="row" spacing={2} sx={{ flex: 1 }}>
                                <NumberField
                                    label="Max seats"
                                    value={event.max_seats}
                                    onChange={(max_seats) => updateEvent('max_seats', max_seats)}
                                    min={1}
                                    required
                                    error={Boolean(fieldErrors.max_seats)}
                                    helperText={fieldErrors.max_seats}
                                    sx={{ flex: 1 }}
                                />
                                <NumberField
                                    label="Volunteer seats"
                                    value={event.volunteer_seat_count}
                                    onChange={(volunteer_seat_count) => updateEvent('volunteer_seat_count', volunteer_seat_count)}
                                    min={0}
                                    error={Boolean(fieldErrors.volunteer_seat_count)}
                                    helperText={fieldErrors.volunteer_seat_count}
                                    sx={{ flex: 1 }}
                                />
                            </Stack>
                        </Stack>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={event.template}
                                    onChange={(e) => {
                                        updateEvent('template', e.target.checked);
                                        if (e.target.checked) {
                                            setFieldErrors((prev) => {
                                                if (!prev.sessions) return prev;
                                                const next = { ...prev };
                                                delete next.sessions;
                                                return next;
                                            });
                                        }
                                    }}
                                />
                            }
                            label="Mark as template (shows in clone picker for other events)"
                        />

                        <Stack spacing={1}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
                                <Typography variant="subtitle1">Sessions{event.template ? '' : ' *'}</Typography>
                                <Button size="small" startIcon={<PlusOutlined />} onClick={openNewSession}>
                                    Add session
                                </Button>
                            </Stack>
                            {fieldErrors.sessions && (
                                <Alert severity="error">{fieldErrors.sessions}</Alert>
                            )}
                            <Box
                                sx={{
                                    bgcolor: 'grey.50',
                                    border: 1,
                                    borderColor: 'divider',
                                    borderRadius: 1,
                                    overflow: 'hidden',
                                }}
                            >
                                <DataGrid
                                    rows={sessions}
                                    columns={sessionColumns}
                                    autoHeight
                                    disableRowSelectionOnClick
                                    hideFooter={sessions.length <= 5}
                                    pageSizeOptions={[5, 10]}
                                    initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
                                    sx={{
                                        border: 'none',
                                        bgcolor: 'transparent',
                                        '& .MuiDataGrid-columnHeaders, & .MuiDataGrid-filler, & .MuiDataGrid-scrollbarFiller, & .MuiDataGrid-cell, & .MuiDataGrid-row': {
                                            bgcolor: 'transparent',
                                        },
                                        '& .MuiDataGrid-cell': {
                                            px: 1.5,
                                        },
                                        '& .MuiDataGrid-columnHeader': {
                                            px: 1.5,
                                        },
                                    }}
                                />
                            </Box>
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
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <DatePicker
                                    label="Date"
                                    value={editingSession.start_at
                                        ? dayjs(utcIsoToWallDate(editingSession.start_at, timeZone))
                                        : null}
                                    onChange={(value) => updateSessionDate(value?.toDate() ?? null)}
                                    slotProps={{
                                        textField: {
                                            required: true,
                                            error: Boolean(sessionStartError),
                                            helperText: sessionStartError
                                                || (editingSession.start_at && sessionDuration >= 1
                                                    ? `Ends ${dayjs(utcIsoToWallDate(editingSession.start_at, timeZone)).add(sessionDuration, 'minute').format('MMM D, YYYY h:mm A')}`
                                                    : undefined),
                                            sx: { flex: 1 },
                                        },
                                    }}
                                />
                                <TimePicker
                                    label="Time"
                                    ampm
                                    value={editingSession.start_at
                                        ? dayjs(utcIsoToWallDate(editingSession.start_at, timeZone))
                                        : null}
                                    onChange={(value) => updateSessionTime(value?.toDate() ?? null)}
                                    slotProps={{
                                        textField: {
                                            required: true,
                                            error: Boolean(sessionStartError),
                                            sx: { flex: 1 },
                                        },
                                    }}
                                />
                            </Stack>
                            <TextField
                                label="Description"
                                value={editingSession.description}
                                onChange={(e) => setEditingSession({ ...editingSession, description: e.target.value })}
                                multiline
                                rows={3}
                                fullWidth
                            />
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <NumberField
                                    label="Duration (minutes)"
                                    value={sessionDuration}
                                    onChange={updateSessionDuration}
                                    min={1}
                                    required
                                    error={Boolean(sessionDurationError)}
                                    helperText={sessionDurationError || `Event default: ${event.duration} min`}
                                    sx={{ width: 200 }}
                                />
                                <TextField
                                    select
                                    label="Status"
                                    value={editingSession.status}
                                    onChange={(e) => setEditingSession({ ...editingSession, status: e.target.value as SessionStatus })}
                                    sx={{ flex: 1, minWidth: 140 }}
                                >
                                    <MenuItem value="draft">Draft</MenuItem>
                                    <MenuItem value="published">Published</MenuItem>
                                    <MenuItem value="cancelled">Cancelled</MenuItem>
                                </TextField>
                            </Stack>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <FormControlLabel
                                    sx={{ flexShrink: 0, mr: 0 }}
                                    control={
                                        <Checkbox
                                            checked={editingSession.max_seats != null}
                                            onChange={(e) => {
                                                setSessionMaxSeatsError('');
                                                setEditingSession({
                                                    ...editingSession,
                                                    max_seats: e.target.checked ? Math.max(1, event.max_seats) : null,
                                                });
                                            }}
                                        />
                                    }
                                    label={`Override max seats (default: ${event.max_seats})`}
                                />
                                {editingSession.max_seats != null && (
                                    <NumberField
                                        label="Max seats"
                                        value={editingSession.max_seats}
                                        onChange={(max_seats) => {
                                            setEditingSession({ ...editingSession, max_seats });
                                            setSessionMaxSeatsError(max_seats < 1 ? 'Max seats must be at least 1' : '');
                                        }}
                                        min={1}
                                        error={Boolean(sessionMaxSeatsError)}
                                        helperText={sessionMaxSeatsError}
                                        sx={{ width: 110 }}
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
