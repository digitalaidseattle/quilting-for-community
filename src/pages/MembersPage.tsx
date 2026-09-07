/**
 * MembersPage.tsx
 * 
 * @copyright 2026 Digital Aid Seattle
*/
import { useContext, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { HomeOutlined } from "@ant-design/icons";
import { PlusOutlined } from "@ant-design/icons";
import { Breadcrumbs, Card, CardContent, IconButton, Stack, Typography, Button } from '@mui/material';
import {
  DataGrid,
  GridFilterModel,
  GridRowParams,
  GridSortModel,
  useGridApiRef
} from '@mui/x-data-grid';


import { FilterItem, LoadingContext, PageInfo, QueryModel, useNotifications } from "@digitalaidseattle/core";
import { DEFAULT_TABLE_PAGE_SIZE } from "../constants/Data";
import { Labels } from "../constants/Labels";
import { Profile } from "../services/members/ProfilesDao";
import { ProfilesService } from "../services/members/ProfilesService";
import { useAuthService } from '@digitalaidseattle/core';
import { Q4CAuthService } from '../services/Q4CAuthService';
import { MemberRegistrationDialog } from "./admin/MemberRegistrationDialog";


// ==============================|| SAMPLE PAGE ||============================== //

export const MembersPage = () => {
  const profilesService = ProfilesService.getInstance();
  const notifications = useNotifications();
  const authService = useAuthService() as Q4CAuthService;

  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE });
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'email', sort: 'asc' }]);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });

  const [pageInfo, setPageInfo] = useState<PageInfo<Profile>>({ rows: [], totalRowCount: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const apiRef = useGridApiRef();
  const { setLoading } = useContext(LoadingContext);
  const navigate = useNavigate();

  const userColumns = [
    {
      field: 'name',
      headerName: Labels.NAME,
      width: 150,
    },
    {
      field: 'email',
      headerName: Labels.EMAIL,
      width: 250,
    }
  ];

  const adminColumns = [
    ...userColumns,
    {
      field: 'phone',
      headerName: 'Phone',
      width: 150,
    },
    {
      field: 'roles',
      headerName: 'Roles',
      width: 200,
      renderCell: (params: any) => (params.value as string[]).join(', '),
    },
  ];

  async function doFetch(options?: { paginationModel?: any; sortModel?: any; filterModel?: any }) {
    setLoading(true);
    try {
      const pModel = options?.paginationModel ?? paginationModel;
      const sModel = options?.sortModel ?? sortModel;
      const fModel = options?.filterModel ?? filterModel;

      const query = createQueryModel(pModel, sModel, fModel);
      const data = await profilesService.find(query);
      setPageInfo(data);
    } catch (err) {
      notifications.error('Error fetching profiles.');
      console.error('Error fetching profiles:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // fetch only when page mounts
    doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    authService.getUser().then((user) => {
      if (user && authService.isAuthorized(user, ['admin'])) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });
  }, [authService]);


  function createQueryModel(pModel?: any, sModel?: any, fModel?: any): QueryModel {
    const filterItems: FilterItem[] = [];
    const fm = fModel ?? filterModel;
    if (fm && fm.items.length > 0) {
      const filterItem = fm.items[0];
      filterItems.push({
        field: filterItem.field,
        operator: filterItem.operator,
        value: filterItem.value
      })
    }
    const sm = sModel ?? sortModel;
    const sortField = sm && sm.length > 0 ? sm![0].field : '';
    const sortDirection = sm && sm.length > 0 ? sm![0].sort : '';
    const pm = pModel ?? paginationModel;
    return {
      ...pm,
      sortField: sortField,
      sortDirection: sortDirection,
      filterModel: {
        items: filterItems
      }
    } as QueryModel;
  }

  function handleRowClick(params: GridRowParams<Profile>): void {
    navigate(`/members/${params.row.id}`)
  }

  function handleRegistrationSuccess() {
    notifications.success('Member registered successfully!');
    doFetch();
  }

  return (
    <>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <NavLink aria-label={Labels.HOME} role="button" title={Labels.HOME} to="/" >
          <IconButton size="medium">
            <HomeOutlined />
          </IconButton>
        </NavLink>
        <Typography color="text.primary">{Labels.MEMBERS}</Typography>
      </Breadcrumbs>
      <Stack direction="column" spacing={1} >
        <Card>
          <CardContent>
            <Typography variant="h5" component="div" gutterBottom>
              Some kind of upload widget
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h5">Members</Typography>
              {isAdmin && (
                <Button
                  variant="contained"
                  startIcon={<PlusOutlined />}
                  onClick={() => setDialogOpen(true)}
                >
                  Register Member
                </Button>
              )}
            </Stack>

            <DataGrid
              apiRef={apiRef}
              rows={pageInfo.rows}
              columns={isAdmin ? adminColumns : userColumns}

              pageSizeOptions={[5, 10, 25, 100]}
              paginationMode='server'
              paginationModel={paginationModel}
              rowCount={pageInfo.totalRowCount}
              onPaginationModelChange={(model) => { setPaginationModel(model); doFetch({ paginationModel: model }); }}

              sortingMode='server'
              sortModel={sortModel}
              onSortModelChange={(model) => { setSortModel(model); doFetch({ sortModel: model }); }}

              filterMode="server"
              filterModel={filterModel}
              onFilterModelChange={(model) => { setFilterModel(model); doFetch({ filterModel: model }); }}

              onRowClick={handleRowClick}
              sx={{ cursor: 'pointer' }}
            />
          </CardContent>
        </Card>
      </Stack>
      {isAdmin && (
        <MemberRegistrationDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSuccess={handleRegistrationSuccess}
        />
      )}
    </>)
};
