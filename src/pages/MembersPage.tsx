/**
 * MembersPage.tsx
 * 
 * @copyright 2026 Digital Aid Seattle
*/
import { useCallback, useContext, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { ExportOutlined, FilterOutlined, HomeOutlined, PlusCircleOutlined, TableOutlined } from "@ant-design/icons";
import { Box, Breadcrumbs, Card, CardContent, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import {
  ColumnsPanelTrigger,
  DataGrid,
  ExportCsv,
  FilterPanelTrigger,
  GridFilterModel,
  GridRowParams,
  GridSortModel,
  Toolbar,
  useGridApiRef
} from '@mui/x-data-grid';


import { FilterItem, LoadingContext, PageInfo, QueryModel, RefreshContext, useNotifications } from "@digitalaidseattle/core";
import { QuickSearch } from "../components/QuickSearch";
import { DEFAULT_TABLE_PAGE_SIZE } from "../constants/Data";
import { Labels } from "../constants/Labels";
import { Profile } from "../services/members/ProfilesDao";
import { ProfilesService } from "../services/members/ProfilesService";
import ProfileDialog from "../components/ProfileDialog";


// ==============================|| SAMPLE PAGE ||============================== //

export const MembersPage = () => {
  const profilesService = ProfilesService.getInstance();
  const notifications = useNotifications();
  const navigate = useNavigate();
  const { setLoading } = useContext(LoadingContext);
  const { refresh , setRefresh} = useContext(RefreshContext);
  const apiRef = useGridApiRef();

  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE });
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'email', sort: 'asc' }]);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });

  const [pageInfo, setPageInfo] = useState<PageInfo<Profile>>({ rows: [], totalRowCount: 0 });

  const [profile, setProfile] = useState<Profile | undefined>();
  const [openProfileDialog, setOpenProfileDialog] = useState<boolean>(false);

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
    }
  ];

  // API data fetch, uncomment to replace dummy data with real data
  const fetchData = useCallback(() => {
    profilesService
      .find(createQueryModel())
      .then(data => setPageInfo(data))
      .catch(err => {
        notifications.error('Error fetching profiles.');
        console.error('Error fetching profiles:', err);
      })
      .finally(() => setLoading(false));

  }, [paginationModel, profilesService, setLoading, sortModel]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refresh])


  function createQueryModel(): QueryModel {
    const filterItems: FilterItem[] = [];
    if (filterModel && filterModel.items.length > 0) {
      const filterItem = filterModel.items[0];
      filterItems.push({
        field: filterItem.field,
        operator: filterItem.operator,
        value: filterItem.value
      })
    }
    const sortField = sortModel && sortModel.length > 0 ? sortModel![0].field : '';
    const sortDirection = sortModel && sortModel.length > 0 ? sortModel![0].sort : '';
    return {
      ...paginationModel,
      sortField: sortField,
      sortDirection: sortDirection,
      filterModel: {
        items: filterItems
      }
    } as QueryModel;
  }

  function addProfile() {
    setProfile({ ...profilesService.empty() });
    setOpenProfileDialog(true);
    setRefresh(0);
  }

  function handleProfileChange(updated: Profile | null) {
    if (updated === null) {
      setProfile(undefined);
      setOpenProfileDialog(false);
    } else {
      const newProfile = {
        ...profile,
        ...updated
      }
      console.error(newProfile);
      profilesService.insert(newProfile)
        .then(result => {
          console.log(result);

          setProfile(undefined);
          setOpenProfileDialog(false);
          notifications.success(`Member ${result.name} has been added.`)
        })
        .catch(err => {
          console.error(`Problems adding ${newProfile.name}.`, err);
          notifications.error(`Problems adding ${newProfile.name}.`)
        })
    }
  }

  function handleRowClick(params: GridRowParams<Profile>): void {
    navigate(`/members/${params.row.id}`)
  }

  function CustomToolbar() {
    return (
      <Toolbar      >
        <Tooltip title="Add Member" enterDelay={0}>
          <IconButton
            onClick={() => addProfile()}>
            <PlusCircleOutlined />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        <ColumnsPanelTrigger render={<IconButton><TableOutlined /></IconButton>} />
        <FilterPanelTrigger render={<IconButton><FilterOutlined /></IconButton>} />
        <ExportCsv render={<IconButton><ExportOutlined /></IconButton>} />
        <QuickSearch onChange={search => console.log(search)} />
      </Toolbar>
    );
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
            <DataGrid
              apiRef={apiRef}
              rows={pageInfo.rows}
              columns={columns}

              pageSizeOptions={[5, 10, 25, 100]}
              paginationMode='server'
              paginationModel={paginationModel}
              rowCount={pageInfo.totalRowCount}
              onPaginationModelChange={setPaginationModel}

              sortingMode='server'
              sortModel={sortModel}
              onSortModelChange={setSortModel}

              filterMode="server"
              filterModel={filterModel}
              onFilterModelChange={setFilterModel}

              onRowClick={handleRowClick}
              showToolbar={true}
              slots={{ toolbar: CustomToolbar }}

            />
          </CardContent>
        </Card>
        <ProfileDialog
          title={Labels.ADD_PROFILE}
          profile={profile!}
          open={openProfileDialog}
          onChange={handleProfileChange} />
      </Stack>
    </>)
};
