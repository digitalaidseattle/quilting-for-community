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
import { DataGrid, GridSortModel } from "@mui/x-data-grid";
import dayjs from "dayjs";
import { ConfirmationDialog } from "@digitalaidseattle/mui";
import { LoadingContext, PageInfo, QueryModel, RefreshContext } from "@digitalaidseattle/core";
import { DEFAULT_TABLE_PAGE_SIZE } from "../../constants/Data";
import { EventsService } from "../../services/events/EventsService";
import { EventsDao } from "../../services/events/EventsDao";
import { Event, EventSession } from "../../services/events/types";
import { CalendarRange, EventCalendar } from "./EventCalendar";
import { EventDialog } from "./EventDialog";

const TEMPLATES_QUERY: QueryModel = {
    page: 0,
    pageSize: 100,
    sortField: 'name',
    sortDirection: 'asc',
    filterModel: { items: [{ field: 'template', operator: 'equals', value: true }] },
};

// Month view can show up to a week of adjacent months on either side.
const initialCalendarRange = (): CalendarRange => ({
    start: dayjs().startOf('month').subtract(7, 'day').toDate(),
    end: dayjs().endOf('month').add(7, 'day').toDate(),
});

export const AdminEventManagementPage = () => {
    const service = EventsService.getInstance();
    const { setLoading } = useContext(LoadingContext);
    const { refresh } = useContext(RefreshContext);

    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE });
    const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'name', sort: 'asc' }]);
    const [pageInfo, setPageInfo] = useState<PageInfo<Event>>({ rows: [], totalRowCount: 0 });
    const [templateEvents, setTemplateEvents] = useState<Event[]>([]);
    const [calendarRange, setCalendarRange] = useState<CalendarRange>(initialCalendarRange);
    const [calendarEvents, setCalendarEvents] = useState<Event[]>([]);
    const [version, setVersion] = useState(0);
    const [tab, setTab] = useState(0);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Event>(EventsDao.empty());
    const [initialSessionId, setInitialSessionId] = useState<string | null>(null);
    const [eventToDelete, setEventToDelete] = useState<Event | null>(null);

    useEffect(() => { fetchPage(); }, [paginationModel, sortModel, refresh, version]);

    useEffect(() => {
        service.find(TEMPLATES_QUERY, { select: '*' }).then((page) => setTemplateEvents(page.rows));
    }, [refresh, version]);

    useEffect(() => {
        if (tab === 1) {
            fetchCalendarEvents();
        }
    }, [tab, calendarRange, refresh, version]);

    function fetchPage() {
        const queryModel = {
            page: paginationModel.page,
            pageSize: paginationModel.pageSize,
            sortField: sortModel.length === 0 ? 'name' : sortModel[0].field,
            sortDirection: sortModel.length === 0 ? 'asc' : sortModel[0].sort,
        } as QueryModel;

        setLoading(true);
        service.find(queryModel, { select: '*' })
            .then(setPageInfo)
            .finally(() => setLoading(false));
    }

    function fetchCalendarEvents() {
        const queryModel = {
            page: 0,
            pageSize: 200,
            sortField: 'name',
            sortDirection: 'asc',
            filterModel: {
                items: [
                    { field: 'event_sessions.start_at', operator: '>', value: calendarRange.start.toISOString() },
                    { field: 'event_sessions.start_at', operator: '<', value: calendarRange.end.toISOString() },
                ],
            },
        } as QueryModel;

        setLoading(true);
        // The !inner join drops events with no sessions in range, and the
        // dotted filters restrict the embedded sessions to the range.
        service.find(queryModel, { select: '*, event_sessions!inner(*)' })
            .then((page) => setCalendarEvents(page.rows))
            .finally(() => setLoading(false));
    }

    function refetch() {
        setVersion((v) => v + 1);
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
            refetch();
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirmDeleteEvent() {
        if (!eventToDelete?.id) return;
        setLoading(true);
        try {
            await service.delete(eventToDelete.id);
            setEventToDelete(null);
            if (dialogOpen && editing.id === eventToDelete.id) {
                setDialogOpen(false);
            }
            refetch();
        } finally {
            setLoading(false);
        }
    }

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
                                rows={pageInfo.rows}
                                columns={columns}
                                autoHeight
                                disableRowSelectionOnClick

                                paginationMode='server'
                                paginationModel={paginationModel}
                                rowCount={pageInfo.totalRowCount}
                                onPaginationModelChange={setPaginationModel}

                                sortingMode='server'
                                sortModel={sortModel}
                                onSortModelChange={setSortModel}

                                pageSizeOptions={[10, 25]}
                            />
                        </CardContent>
                    </Card>
                )}
                {tab === 1 && (
                    <Card>
                        <CardContent>
                            <EventCalendar
                                events={calendarEvents}
                                onSessionSelect={openSessionFromCalendar}
                                onRangeChange={setCalendarRange}
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
                onSaved={refetch}
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
