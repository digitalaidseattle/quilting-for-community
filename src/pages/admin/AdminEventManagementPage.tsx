import { useContext, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { HomeOutlined, PlusOutlined } from "@ant-design/icons";
import {
    Breadcrumbs,
    Button,
    Card,
    CardContent,
    IconButton,
    Stack,
    Tab,
    Tabs,
    Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { ConfirmationDialog } from "@digitalaidseattle/mui";
import { LoadingContext, RefreshContext } from "@digitalaidseattle/core";
import { EventsService } from "../../services/events/EventsService";
import { EventsDao } from "../../services/events/EventsDao";
import { Event, EventSession } from "../../services/events/types";
import { EventCalendar } from "./EventCalendar";
import { EventDialog } from "./EventDialog";

export const AdminEventManagementPage = () => {
    const service = EventsService.getInstance();
    const { setLoading } = useContext(LoadingContext);
    const { refresh } = useContext(RefreshContext);

    const [events, setEvents] = useState<Event[]>([]);
    const [sessions, setSessions] = useState<EventSession[]>([]);
    const [tab, setTab] = useState(0);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Event>(EventsDao.empty());
    const [initialSessionId, setInitialSessionId] = useState<string | null>(null);
    const [eventToDelete, setEventToDelete] = useState<Event | null>(null);

    useEffect(() => { fetchData(); }, [refresh]);

    function fetchData() {
        setLoading(true);
        service.events.getAll()
            .then((nextEvents) => {
                setEvents(nextEvents);
                setSessions(nextEvents.flatMap((event) => event.event_sessions ?? []));
            })
            .finally(() => setLoading(false));
    }

    function openNew() {
        setInitialSessionId(null);
        setEditing(EventsDao.empty());
        setDialogOpen(true);
    }

    function openEdit(event: Event) {
        setInitialSessionId(null);
        setEditing({ ...event });
        setDialogOpen(true);
    }

    function openSessionFromCalendar(event: Event, session: EventSession) {
        setInitialSessionId(session.id as string);
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
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Tabs value={tab} onChange={(_, value) => setTab(value)}>
                        <Tab label="List" />
                        <Tab label="Calendar" />
                    </Tabs>
                    <Button variant="contained" startIcon={<PlusOutlined />} onClick={openNew}>
                        New event
                    </Button>
                </Stack>
                {tab === 0 && (
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
                )}
                {tab === 1 && (
                    <Card>
                        <CardContent>
                            <EventCalendar
                                events={events}
                                sessions={sessions}
                                onSessionSelect={openSessionFromCalendar}
                            />
                        </CardContent>
                    </Card>
                )}
            </Stack>

            <EventDialog
                service={service}
                open={dialogOpen}
                editing={editing}
                templateEvents={templateEvents}
                initialSessionId={initialSessionId}
                onClose={() => setDialogOpen(false)}
                onSaved={fetchData}
                onInitialSessionOpened={() => setInitialSessionId(null)}
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
