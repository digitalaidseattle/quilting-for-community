/**
 *  AdminMembersPage.tsx
 *
 *  @copyright 2026 Digital Aid Seattle
 */

import { useCallback, useContext, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { HomeOutlined, PlusOutlined } from "@ant-design/icons";
import {
    Breadcrumbs,
    Button,
    Card,
    CardContent,
    IconButton,
    Stack,
    Typography,
} from "@mui/material";
import {
    DataGrid,
    GridFilterModel,
    GridRowParams,
    GridSortModel,
    useGridApiRef,
} from "@mui/x-data-grid";
import {
    FilterItem,
    LoadingContext,
    PageInfo,
    QueryModel,
    RefreshContext,
    useNotifications,
} from "@digitalaidseattle/core";
import { DEFAULT_TABLE_PAGE_SIZE } from "../../constants/Data";
import { Labels } from "../../constants/Labels";
import { Profile } from "../../services/members/ProfilesDao";
import { ProfilesService } from "../../services/members/ProfilesService";
import { MemberRegistrationDialog } from "./MemberRegistrationDialog";

export const AdminMembersPage = () => {
    const profilesService = ProfilesService.getInstance();
    const notifications = useNotifications();

    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE });
    const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'email', sort: 'asc' }]);
    const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });

    const [pageInfo, setPageInfo] = useState<PageInfo<Profile>>({ rows: [], totalRowCount: 0 });
    const [dialogOpen, setDialogOpen] = useState(false);
    const apiRef = useGridApiRef();
    const { setLoading } = useContext(LoadingContext);
    const { refresh, setRefresh } = useContext(RefreshContext);
    const navigate = useNavigate();

    const columns = [
        {
            field: 'name',
            headerName: Labels.NAME,
            width: 150,
        },
        {
            field: 'email',
            headerName: Labels.EMAIL,
            width: 250,
        },
        {
            field: 'phone',
            headerName: 'Phone',
            width: 150,
        },
        {
            field: 'roles',
            headerName: 'Roles',
            width: 200,
            renderCell: (params) => (params.value as string[]).join(', '),
        },
    ];

    const fetchData = useCallback(() => {
        setLoading(true);
        profilesService
            .find(createQueryModel())
            .then((data) => setPageInfo(data))
            .catch((err) => {
                notifications.error('Error fetching profiles.');
                console.error('Error fetching profiles:', err);
            })
            .finally(() => setLoading(false));
    }, [paginationModel, profilesService, setLoading, sortModel, notifications]);

    useEffect(() => {
        fetchData();
    }, [fetchData, refresh]);

    function createQueryModel(): QueryModel {
        const filterItems: FilterItem[] = [];
        if (filterModel && filterModel.items.length > 0) {
            const filterItem = filterModel.items[0];
            filterItems.push({
                field: filterItem.field,
                operator: filterItem.operator,
                value: filterItem.value,
            });
        }
        const sortField = sortModel && sortModel.length > 0 ? sortModel![0].field : '';
        const sortDirection = sortModel && sortModel.length > 0 ? sortModel![0].sort : '';
        return {
            ...paginationModel,
            sortField: sortField,
            sortDirection: sortDirection,
            filterModel: {
                items: filterItems,
            },
        } as QueryModel;
    }

    function handleRowClick(params: GridRowParams<Profile>): void {
        navigate(`/members/${params.row.id}`);
    }

    function handleRegistrationSuccess() {
        notifications.success('Member registered successfully! They will receive an email to set their password.');
        setRefresh(!refresh);
    }

    return (
        <>
            <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
                <NavLink aria-label={Labels.HOME} role="button" title={Labels.HOME} to="/">
                    <HomeOutlined style={{ marginRight: 8 }} />
                    <Typography color="text.secondary">Home</Typography>
                </NavLink>
                <Typography color="text.primary">Member Management</Typography>
            </Breadcrumbs>

            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                        >
                            <Typography variant="h5">Members</Typography>
                            <Button
                                variant="contained"
                                startIcon={<PlusOutlined />}
                                onClick={() => setDialogOpen(true)}
                            >
                                Register Member
                            </Button>
                        </Stack>

                        <DataGrid
                            apiRef={apiRef}
                            rows={pageInfo.rows}
                            rowCount={pageInfo.totalRowCount}
                            columns={columns}
                            paginationModel={paginationModel}
                            onPaginationModelChange={setPaginationModel}
                            pageSizeOptions={[DEFAULT_TABLE_PAGE_SIZE]}
                            sortModel={sortModel}
                            onSortModelChange={setSortModel}
                            filterModel={filterModel}
                            onFilterModelChange={setFilterModel}
                            paginationMode="server"
                            sortingMode="server"
                            filteringMode="server"
                            onRowClick={handleRowClick}
                            sx={{ cursor: 'pointer' }}
                        />
                    </Stack>
                </CardContent>
            </Card>

            <MemberRegistrationDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onSuccess={handleRegistrationSuccess}
            />
        </>
    );
};
