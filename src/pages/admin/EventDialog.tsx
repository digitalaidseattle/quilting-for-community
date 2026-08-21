import { useContext, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { EventSessionsService } from "../../services/events/EventSessionsService";
import { Event, EventInstructor, EventSession, SessionStatus } from "../../services/events/types";
import { eventFormResolver } from "../../services/events/eventValidation";
import { Profile } from "../../services/members/ProfilesDao";
import { ProfilesService } from "../../services/members/ProfilesService";
import {
    formatSessionDate,
    defaultNewSessionStart,
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

type SessionFormValues = {
    id?: string;
    event_id: string;
    description: string;
    start_at: string;
    end_at: string;
    max_seats: number | null;
    status: SessionStatus;
    duration: number;
};

function defaultDurationMinutes(duration: number): number {
    return Math.max(1, duration || 60);
}

function durationMinutes(session: EventSession, eventDuration: number): number {
    const startMs = new Date(session.start_at).getTime();
    const endMs = new Date(session.end_at).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
        return defaultDurationMinutes(eventDuration);
    }
    return Math.max(1, Math.round((endMs - startMs) / 60000));
}

function sessionToFormValues(session: EventSession, duration: number): SessionFormValues {
    return {
        id: session.id as string | undefined,
        event_id: session.event_id,
        description: session.description ?? '',
        start_at: session.start_at,
        end_at: session.end_at,
        max_seats: session.max_seats,
        status: session.status,
        duration,
    };
}

function toInstructor(profile: Pick<Profile, 'id' | 'name' | 'email' | 'first_name' | 'last_name'>): EventInstructor {
    return {
        id: profile.id as string,
        name: profile.name,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
    };
}

function applyStartAndDuration(
    values: SessionFormValues,
    wallDate: Date | null,
    timeZone: string,
): Partial<SessionFormValues> {
    if (!wallDate || Number.isNaN(wallDate.getTime())) {
        return { start_at: '', end_at: '' };
    }
    const duration = Math.max(1, values.duration);
    return {
        start_at: wallDateToUtcIso(wallDate, timeZone),
        end_at: wallDateToUtcIso(new Date(wallDate.getTime() + duration * 60000), timeZone),
    };
}

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
    const profilesService = ProfilesService.getInstance();
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
    const [instructorOptions, setInstructorOptions] = useState<Profile[]>([]);
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'event' } | { type: 'session', session: EventSession } | null>(null);

    const {
        control,
        reset,
        setValue,
        getValues,
        watch,
        clearErrors,
        handleSubmit,
        formState: { errors },
    } = useForm<Event>({
        defaultValues: editing,
        resolver: eventFormResolver,
    });

    const {
        control: sessionControl,
        reset: resetSession,
        setValue: setSessionValue,
        getValues: getSessionValues,
        watch: watchSession,
        handleSubmit: handleSubmitSession,
        formState: { errors: sessionErrors },
    } = useForm<SessionFormValues>({
        defaultValues: sessionToFormValues(editing.event_sessions?.[0] ?? {
            event_id: (editing.id as string) ?? '',
            description: '',
            start_at: '',
            end_at: '',
            max_seats: null,
            status: 'draft',
        } as EventSession, 60),
    });

    const event = watch();
    const sessions = event.event_sessions ?? [];
    const sessionValues = watchSession();
    const selectedInstructor = instructorOptions.find((profile) => profile.id === event.instructor_id)
        ?? (event.instructor && event.instructor_id ? event.instructor as Profile : null);

    useEffect(() => {
        if (!open || sessionOnly) {
            return;
        }
        profilesService.getInstructorCandidates()
            .then(setInstructorOptions)
            .catch(() => setInstructorOptions([]));
    }, [open, sessionOnly, profilesService]);

    useEffect(() => {
        reset(editing);
        setSelectedTemplateId('');
        // In session-only mode the calendar already has current session times;
        // refetching can briefly race a just-finished drag and show stale times.
        if (editing.id && !sessionOnly) {
            service.getById(editing.id).then((full) => reset(full ?? editing));
        }
    }, [editing, open, sessionOnly, reset, service]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const session = initialSession
            ?? (initialSessionId ? sessions.find((s) => s.id === initialSessionId) : undefined);
        if (!session) {
            return;
        }

        resetSession(sessionToFormValues(session, durationMinutes(session, event.duration)));
        setSessionDialogOpen(true);
        onInitialSessionOpened?.();
    }, [open, initialSession, initialSessionId, sessions, onInitialSessionOpened, resetSession, event.duration]);

    function applyTemplate(templateId: string) {
        setSelectedTemplateId(templateId);
        const template = templateEvents.find((t) => t.id === templateId);
        if (!template) return;
        const { id: _id, created_at: _createdAt, updated_at: _updatedAt, event_sessions: _sessions, ...rest } = template;
        reset({
            ...rest,
            template: false,
            name: `${template.name} (copy)`,
            event_sessions: getValues('event_sessions'),
        } as Event);
    }

    async function onSaveEvent(values: Event) {
        setLoading(true);
        try {
            await service.save(values);
            onSaved();
            onClose();
        } finally {
            setLoading(false);
        }
    }

    function openNewSession() {
        const startWall = defaultNewSessionStart(timeZone);
        const duration = defaultDurationMinutes(event.duration);
        const endWall = new Date(startWall.getTime() + duration * 60000);
        const draft = service.sessionFromEvent(event, {
            start_at: wallDateToUtcIso(startWall, timeZone),
            end_at: wallDateToUtcIso(endWall, timeZone),
        });
        resetSession(sessionToFormValues(draft, duration));
        setSessionDialogOpen(true);
    }

    function openEditSession(session: EventSession) {
        resetSession(sessionToFormValues(session, durationMinutes(session, event.duration)));
        setSessionDialogOpen(true);
    }

    function closeSessionDialog() {
        setSessionDialogOpen(false);
        if (sessionOnly) {
            onClose();
        }
    }

    function sessionStartWall(): Date | null {
        if (!sessionValues.start_at) return null;
        const wallDate = utcIsoToWallDate(sessionValues.start_at, timeZone);
        return Number.isNaN(wallDate.getTime()) ? null : wallDate;
    }

    function updateSessionDate(date: Date | null) {
        if (!date || Number.isNaN(date.getTime())) {
            setSessionValue('start_at', '');
            setSessionValue('end_at', '');
            return;
        }
        const current = sessionStartWall() ?? nowAsWallDate(timeZone);
        const next = new Date(date);
        next.setHours(current.getHours(), current.getMinutes(), 0, 0);
        const nextTimes = applyStartAndDuration(getSessionValues(), next, timeZone);
        setSessionValue('start_at', nextTimes.start_at ?? '');
        setSessionValue('end_at', nextTimes.end_at ?? '');
    }

    function updateSessionTime(time: Date | null) {
        if (!time || Number.isNaN(time.getTime())) {
            return;
        }
        const current = sessionStartWall() ?? nowAsWallDate(timeZone);
        const next = new Date(current);
        next.setHours(time.getHours(), time.getMinutes(), 0, 0);
        const nextTimes = applyStartAndDuration(getSessionValues(), next, timeZone);
        setSessionValue('start_at', nextTimes.start_at ?? '');
        setSessionValue('end_at', nextTimes.end_at ?? '');
    }

    function buildNormalizedSession(values: SessionFormValues): EventSession | null {
        if (!values.start_at || values.duration < 1) return null;

        const startWall = utcIsoToWallDate(values.start_at, timeZone);
        return {
            ...values,
            id: values.id ?? crypto.randomUUID(),
            event_id: (event.id as string) ?? values.event_id ?? '',
            start_at: wallDateToUtcIso(startWall, timeZone),
            end_at: wallDateToUtcIso(
                new Date(startWall.getTime() + values.duration * 60000),
                timeZone,
            ),
        } as EventSession;
    }

    async function onSaveSession(values: SessionFormValues) {
        const normalized = buildNormalizedSession(values);
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
        setValue('event_sessions', [...others, normalized].sort((a, b) => a.start_at.localeCompare(b.start_at)), {
            shouldValidate: true,
        });
        clearErrors('event_sessions');
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
            setValue(
                'event_sessions',
                sessions.filter((session) => session.id !== confirmDelete.session.id),
            );
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

    const sessionStartError = sessionErrors.start_at?.message;
    const sessionDurationError = sessionErrors.duration?.message;
    const sessionMaxSeatsError = sessionErrors.max_seats?.message;

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
                        <Controller
                            name="name"
                            control={control}
                            render={({ field, fieldState }) => (
                                <TextField
                                    {...field}
                                    label="Title"
                                    required
                                    error={Boolean(fieldState.error)}
                                    helperText={fieldState.error?.message}
                                    slotProps={{ inputLabel: { shrink: Boolean(field.value) } }}
                                    fullWidth
                                />
                            )}
                        />
                        <Stack direction="row" spacing={2} alignItems="flex-start">
                            <Controller
                                name="description"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="Description"
                                        multiline
                                        rows={3}
                                        slotProps={{ inputLabel: { shrink: Boolean(field.value) } }}
                                        sx={{ flex: 1 }}
                                    />
                                )}
                            />
                            <Controller
                                name="notes"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="Notes"
                                        placeholder="Internal Notes"
                                        multiline
                                        rows={3}
                                        slotProps={{ inputLabel: { shrink: Boolean(field.value) } }}
                                        sx={{ flex: 1 }}
                                    />
                                )}
                            />
                        </Stack>
                        <Stack direction="row" spacing={2}>
                            <Controller
                                name="category"
                                control={control}
                                render={({ field }) => (
                                    <EventCategorySelect
                                        value={field.value}
                                        onChange={field.onChange}
                                        sx={{ flex: 1 }}
                                    />
                                )}
                            />
                            <Controller
                                name="instructor_id"
                                control={control}
                                render={({ field }) => (
                                    <Autocomplete
                                        options={instructorOptions}
                                        value={selectedInstructor}
                                        onChange={(_event, profile) => {
                                            field.onChange((profile?.id as string) ?? null);
                                            setValue('instructor', profile ? toInstructor(profile) : null);
                                        }}
                                        getOptionLabel={(profile) => profilesService.profileLabel(profile)}
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
                                                    profilesService.profileLabel(profile),
                                                ].filter(Boolean).join(' ').toLowerCase();
                                                return haystack.includes(query);
                                            });
                                        }}
                                        renderOption={(props, profile) => (
                                            <li {...props} key={profile.id as string}>
                                                <Stack>
                                                    <Typography variant="body2">{profilesService.profileLabel(profile)}</Typography>
                                                    {profile.email && profilesService.profileLabel(profile) !== profile.email && (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {profile.email}
                                                        </Typography>
                                                    )}
                                                </Stack>
                                            </li>
                                        )}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Instructor"
                                                slotProps={{ inputLabel: { shrink: Boolean(selectedInstructor) || Boolean(params.inputProps?.value) } }}
                                            />
                                        )}
                                        sx={{ flex: 1 }}
                                    />
                                )}
                            />
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="flex-start">
                            <Stack direction="row" spacing={2} sx={{ flex: 1 }}>
                                <Controller
                                    name="status"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            select
                                            label="Status"
                                            value={field.value}
                                            onChange={field.onChange}
                                            sx={{ flex: 1 }}
                                        >
                                            <MenuItem value="draft">Draft</MenuItem>
                                            <MenuItem value="published">Published</MenuItem>
                                            <MenuItem value="cancelled">Cancelled</MenuItem>
                                        </TextField>
                                    )}
                                />
                                <Controller
                                    name="duration"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <NumberField
                                            label="Default duration (minutes)"
                                            value={field.value}
                                            onChange={field.onChange}
                                            min={1}
                                            required
                                            error={Boolean(fieldState.error)}
                                            helperText={fieldState.error?.message ?? 'Used when adding new sessions'}
                                            sx={{ flex: 1 }}
                                        />
                                    )}
                                />
                                <Controller
                                    name="price"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <NumberField
                                            label="Price"
                                            value={field.value}
                                            onChange={field.onChange}
                                            min={0}
                                            required
                                            error={Boolean(fieldState.error)}
                                            helperText={fieldState.error?.message}
                                            sx={{ flex: 1 }}
                                            InputProps={{
                                                startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                            }}
                                        />
                                    )}
                                />
                            </Stack>
                            <Stack direction="row" spacing={2} sx={{ flex: 1 }}>
                                <Controller
                                    name="max_seats"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <NumberField
                                            label="Max seats"
                                            value={field.value}
                                            onChange={field.onChange}
                                            min={1}
                                            required
                                            error={Boolean(fieldState.error)}
                                            helperText={fieldState.error?.message}
                                            sx={{ flex: 1 }}
                                        />
                                    )}
                                />
                                <Controller
                                    name="volunteer_seat_count"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <NumberField
                                            label="Volunteer seats"
                                            value={field.value}
                                            onChange={field.onChange}
                                            min={0}
                                            error={Boolean(fieldState.error)}
                                            helperText={fieldState.error?.message}
                                            sx={{ flex: 1 }}
                                        />
                                    )}
                                />
                            </Stack>
                        </Stack>
                        <Controller
                            name="template"
                            control={control}
                            render={({ field }) => (
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={field.value}
                                            onChange={(e) => {
                                                field.onChange(e.target.checked);
                                                if (e.target.checked) {
                                                    clearErrors('event_sessions');
                                                }
                                            }}
                                        />
                                    }
                                    label="Mark as template (shows in clone picker for other events)"
                                />
                            )}
                        />

                        <Stack spacing={1}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
                                <Typography variant="subtitle1">Sessions{event.template ? '' : ' *'}</Typography>
                                <Button size="small" startIcon={<PlusOutlined />} onClick={openNewSession}>
                                    Add session
                                </Button>
                            </Stack>
                            {typeof errors.event_sessions?.message === 'string' && errors.event_sessions.message && (
                                <Alert severity="error">{errors.event_sessions.message}</Alert>
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
                    <Button variant="contained" onClick={handleSubmit(onSaveEvent)}>Save event</Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={open && sessionDialogOpen}
                onClose={closeSessionDialog}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    {sessionValues.id ? 'Edit session' : 'New session'}
                    {sessionOnly && event.name ? ` · ${event.name}` : ''}
                </DialogTitle>
                <DialogContent>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <Controller
                                    name="start_at"
                                    control={sessionControl}
                                    rules={{ required: 'Start date/time is required' }}
                                    render={({ field }) => (
                                        <DatePicker
                                            label="Date"
                                            value={field.value
                                                ? dayjs(utcIsoToWallDate(field.value, timeZone))
                                                : null}
                                            onChange={(value) => updateSessionDate(value?.toDate() ?? null)}
                                            slotProps={{
                                                textField: {
                                                    required: true,
                                                    error: Boolean(sessionStartError),
                                                    helperText: sessionStartError
                                                        || (field.value && sessionValues.duration >= 1
                                                            ? `Ends ${dayjs(utcIsoToWallDate(field.value, timeZone)).add(sessionValues.duration, 'minute').format('MMM D, YYYY h:mm A')}`
                                                            : undefined),
                                                    sx: { flex: 1 },
                                                },
                                            }}
                                        />
                                    )}
                                />
                                <TimePicker
                                    label="Time"
                                    ampm
                                    value={sessionValues.start_at
                                        ? dayjs(utcIsoToWallDate(sessionValues.start_at, timeZone))
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
                            <Controller
                                name="description"
                                control={sessionControl}
                                render={({ field }) => (
                                    <TextField
                                        label="Description"
                                        value={field.value}
                                        onChange={field.onChange}
                                        multiline
                                        rows={3}
                                        fullWidth
                                    />
                                )}
                            />
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <Controller
                                    name="duration"
                                    control={sessionControl}
                                    rules={{
                                        required: 'Duration must be at least 1 minute',
                                        min: { value: 1, message: 'Duration must be at least 1 minute' },
                                    }}
                                    render={({ field, fieldState }) => (
                                        <NumberField
                                            label="Duration (minutes)"
                                            value={field.value}
                                            onChange={(minutes) => {
                                                field.onChange(minutes);
                                                if (minutes < 1 || !getSessionValues('start_at')) return;
                                                const startWall = utcIsoToWallDate(getSessionValues('start_at'), timeZone);
                                                setSessionValue(
                                                    'end_at',
                                                    wallDateToUtcIso(new Date(startWall.getTime() + minutes * 60000), timeZone),
                                                );
                                            }}
                                            min={1}
                                            required
                                            error={Boolean(fieldState.error)}
                                            helperText={sessionDurationError || `Event default: ${event.duration} min`}
                                            sx={{ width: 200 }}
                                        />
                                    )}
                                />
                                <Controller
                                    name="status"
                                    control={sessionControl}
                                    render={({ field }) => (
                                        <TextField
                                            select
                                            label="Status"
                                            value={field.value}
                                            onChange={field.onChange}
                                            sx={{ flex: 1, minWidth: 140 }}
                                        >
                                            <MenuItem value="draft">Draft</MenuItem>
                                            <MenuItem value="published">Published</MenuItem>
                                            <MenuItem value="cancelled">Cancelled</MenuItem>
                                        </TextField>
                                    )}
                                />
                            </Stack>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <Controller
                                    name="max_seats"
                                    control={sessionControl}
                                    rules={{
                                        validate: (value) =>
                                            value == null || value >= 1 || 'Max seats must be at least 1',
                                    }}
                                    render={({ field }) => (
                                        <>
                                            <FormControlLabel
                                                sx={{ flexShrink: 0, mr: 0 }}
                                                control={
                                                    <Checkbox
                                                        checked={field.value != null}
                                                        onChange={(e) => {
                                                            field.onChange(e.target.checked ? Math.max(1, event.max_seats) : null);
                                                        }}
                                                    />
                                                }
                                                label={`Override max seats (default: ${event.max_seats})`}
                                            />
                                            {field.value != null && (
                                                <NumberField
                                                    label="Max seats"
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    min={1}
                                                    error={Boolean(sessionMaxSeatsError)}
                                                    helperText={sessionMaxSeatsError}
                                                    sx={{ width: 110 }}
                                                />
                                            )}
                                        </>
                                    )}
                                />
                            </Stack>
                        </Stack>
                    </LocalizationProvider>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between' }}>
                    {sessionValues.id ? (
                        <Button
                            color="error"
                            onClick={() => setConfirmDelete({
                                type: 'session',
                                session: buildNormalizedSession(getSessionValues()) ?? {
                                    ...getSessionValues(),
                                    id: sessionValues.id,
                                } as EventSession,
                            })}
                        >
                            Delete session
                        </Button>
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
                        <Button variant="contained" onClick={handleSubmitSession(onSaveSession)}>Save session</Button>
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
