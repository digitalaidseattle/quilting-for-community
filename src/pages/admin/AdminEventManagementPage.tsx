import { useContext, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { HomeOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import {
    Breadcrumbs,
    Button,
    Card,
    CardContent,
    IconButton,
    InputAdornment,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
} from "@mui/material";
import { DataGrid, GridSortModel } from "@mui/x-data-grid";
import dayjs from "dayjs";
import { ConfirmationDialog } from "@digitalaidseattle/mui";
import { FilterItem, LoadingContext, PageInfo, QueryModel, RefreshContext } from "@digitalaidseattle/core";
import { DEFAULT_TABLE_PAGE_SIZE } from "../../constants/Data";
import { TimezoneSelect } from "../../components/TimezoneSelect";
import { useEventCategoryOptions } from "../../hooks/useEventCategoryOptions";
import { EventsService } from "../../services/events/EventsService";
import { EventSessionsService } from "../../services/events/EventSessionsService";
import { Event, EventSession } from "../../services/events/types";
import { ProfilesService } from "../../services/members/ProfilesService";
import { loadStoredTimezone, storeTimezone } from "../../utils/date-format";
import { CalendarRange, EventCalendar } from "./EventCalendar";

// Month view can show up to a week of adjacent months on either side.
const initialCalendarRange = (): CalendarRange => ({
    start: dayjs().startOf('month').subtract(7, 'day').toDate(),
    end: dayjs().endOf('month').add(7, 'day').toDate(),
});

export const AdminEventManagementPage = () => {
    const service = EventsService.getInstance();
    const { setLoading } = useContext(LoadingContext);
    const { refresh } = useContext(RefreshContext);
    const navigate = useNavigate();

    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE });
    const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'name', sort: 'asc' }]);
    const [pageInfo, setPageInfo] = useState<PageInfo<Event>>({ rows: [], totalRowCount: 0 });
    const [calendarRange, setCalendarRange] = useState<CalendarRange>(initialCalendarRange);
    const [calendarEvents, setCalendarEvents] = useState<Event[]>([]);
    const [version, setVersion] = useState(0);
    const [tab, setTab] = useState(0); // 0 = Calendar, 1 = List
    const [search, setSearch] = useState('');
    const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
    const [timeZone, setTimeZone] = useState(loadStoredTimezone);
    const { options: categoryOptions } = useEventCategoryOptions();

    function handleTimeZoneChange(next: string) {
        setTimeZone(next);
        storeTimezone(next);
    }

    function searchFilterItems(): FilterItem[] {
        const term = search.trim();
        if (!term) return [];
        return [{ field: 'search_key', operator: 'contains', value: term }];
    }

    function handleSearchChange(value: string) {
        setSearch(value);
        setPaginationModel((prev) => (prev.page === 0 ? prev : { ...prev, page: 0 }));
    }

    useEffect(() => { fetchPage(); }, [paginationModel, sortModel, refresh, version, search]);

    useEffect(() => {
        if (tab === 0) {
            fetchCalendarEvents();
        }
    }, [tab, calendarRange, refresh, version, search]);

    function fetchPage() {
        const queryModel = {
            page: paginationModel.page,
            pageSize: paginationModel.pageSize,
            sortField: sortModel.length === 0 ? 'name' : sortModel[0].field,
            sortDirection: sortModel.length === 0 ? 'asc' : sortModel[0].sort,
            filterModel: { items: searchFilterItems() },
        } as QueryModel;

        setLoading(true);
        service.find(queryModel, {
            select: '*, instructor:profiles!instructor_id(id, name, email, first_name, last_name)',
        })
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
                    ...searchFilterItems(),
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
        navigate('/admin/event-management/new');
    }

    function openEdit(event: Event) {
        navigate(`/admin/event-management/${event.id}`);
    }

    function openSessionFromCalendar(event: Event, session: EventSession) {
        navigate(`/admin/event-management/${event.id}?session=${session.id}`);
    }

    async function handleSessionTimesChange(session: EventSession, startAt: string, endAt: string) {
        setCalendarEvents((prev) => prev.map((event) => ({
            ...event,
            event_sessions: (event.event_sessions ?? []).map((s) =>
                s.id === session.id ? { ...s, start_at: startAt, end_at: endAt } : s
            ),
        })));

        try {
            await EventSessionsService.getInstance().update(session.id as string, {
                start_at: startAt,
                end_at: endAt,
            });
        } catch {
            refetch();
        }
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
            refetch();
        } finally {
            setLoading(false);
        }
    }

    const columns = [
        { field: 'name', headerName: 'Name', flex: 1 },
        { field: 'status', headerName: 'Status', width: 110 },
        {
            field: 'category',
            headerName: 'Category',
            width: 180,
            valueGetter: (_: unknown, row: Event) =>
                categoryOptions.find((option) => option.value === row.category)?.label
                ?? row.category,
        },
        {
            field: 'instructor',
            headerName: 'Instructor',
            width: 160,
            sortable: false,
            valueGetter: (_: unknown, row: Event) =>
                row.instructor
                    ? ProfilesService.getInstance().profileLabel(row.instructor)
                    : '',
        },
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
            display: 'flex' as const,
            renderCell: (params: { row: Event }) => (
                <Stack direction="row" spacing={1} onClick={(e) => e.stopPropagation()}>
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
                <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
                    <Tabs value={tab} onChange={(_, value) => setTab(value)}>
                        <Tab label="Calendar" />
                        <Tab label="List" />
                    </Tabs>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <TextField
                            size="small"
                            placeholder="Search events…"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            sx={{ minWidth: 220 }}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchOutlined />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                        <TimezoneSelect value={timeZone} onChange={handleTimeZoneChange} />
                        <Button variant="contained" startIcon={<PlusOutlined />} onClick={openNew}>
                            New event
                        </Button>
                    </Stack>
                </Stack>
                {tab === 0 && (
                    <Card>
                        <CardContent>
                            <EventCalendar
                                events={calendarEvents}
                                timeZone={timeZone}
                                onSessionSelect={openSessionFromCalendar}
                                onSessionTimesChange={handleSessionTimesChange}
                                onRangeChange={setCalendarRange}
                            />
                        </CardContent>
                    </Card>
                )}
                {tab === 1 && (
                    <Card>
                        <CardContent>
                            <DataGrid
                                rows={pageInfo.rows}
                                columns={columns}
                                autoHeight
                                disableRowSelectionOnClick
                                onRowClick={(params) => openEdit(params.row)}
                                sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}

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
            </Stack>

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
